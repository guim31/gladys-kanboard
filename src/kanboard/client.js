// -----------------------------------------------------------------------------
// Kanboard API client: JSON-RPC 2.0 on `/jsonrpc.php`, HTTP Basic. Two kinds of
// credentials, both checked against a real kanboard/kanboard v1.2.56 in
// Docker, October 2026:
//   - application API: user `jsonrpc` and the token of Settings → API; it sees
//     every project of the instance;
//   - user API: a username and its password or personal access token (My
//     profile → API); it sees the projects the user is a member of.
//
//   getVersion                         "v1.2.56"
//   getAllProjects (application)       Project[], archived ones included
//   getMyProjects (user)               Project[], active ones only
//   getAllTasks(project_id, 1)         open Task[] of a project (one call per
//                                      project, sent in one JSON-RPC batch)
//   getTask(task_id)                   Task, or null
//   createTask(title, project_id, …)   new id; 0 or false when refused
//   updateTask(id, date_due)           true / false
//   closeTask(task_id)                 true / false
//
// Pitfalls found on the real server:
//   - Due dates are Unix timestamps in seconds, 0 when none. On write, only a
//     text date is accepted (`Y-m-d H:i`; a timestamp or ISO 8601 with `T` is
//     refused with `false`), read in the time zone of Kanboard (Settings →
//     Application, or the user's own), which Gladys does not know: the task
//     is read back and its due date corrected once.
//   - A date without a time gets the current time of day, not midnight.
//   - `getMyProjects`, `getMe`… answer 403 "not available with the API
//     credentials" to the `jsonrpc` user, and `getAllProjects` answers 403 to
//     a non-admin user: the list call depends on the credentials.
//   - A wrong password or token is an HTTP 401; a forbidden procedure an HTTP
//     403 alone, or a `{ error: { code: 403 } }` item inside a batch (HTTP 200).
//   - `closeTask` answers true even on a task already closed; `createTask`
//     answers 0 for a project that does not exist.
//   - Closing a task that repeats "when the task is closed" creates a new task
//     (`recurrence_child` of the closed one) with the due date moved forward.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const APP_USER = 'jsonrpc';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify (self-signed without the option)
  AUTH: 'auth', // wrong user, password or token
  FORBIDDEN: 'forbidden', // the credentials may not call this procedure / project
  NOT_KANBOARD: 'not_kanboard', // something answers, but not the Kanboard API
  REDIRECT: 'redirect', // HTTP redirected to HTTPS, or a login portal
  RATE_LIMIT: 'rate_limit', // 429: a reverse proxy's request limit
  HTTP: 'http', // any other unexpected answer
});

export class KanboardError extends Error {
  constructor(kind, message, status, code) {
    super(message);
    this.name = 'KanboardError';
    this.kind = kind;
    this.status = status;
    /** JSON-RPC error code, or a short string of the client ('refused', 'stale'). */
    this.code = code;
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

function networkError(err) {
  if (err.code === 'ERESPONSETOOLARGE') {
    return new KanboardError(ERROR_KINDS.HTTP, 'Response too large');
  }
  if (TLS_CODES.has(err.code)) {
    return new KanboardError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
  }
  return new KanboardError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
}

/** The error of a JSON-RPC answer item. */
function rpcError(error) {
  const code = Number.isInteger(error?.code) ? error.code : undefined;
  const said = typeof error?.message === 'string' ? error.message.slice(0, 200) : 'error';
  if (code === 403) {
    return new KanboardError(ERROR_KINDS.FORBIDDEN, `JSON-RPC 403 ${said}`, 200, code);
  }
  if (code === 401) {
    return new KanboardError(ERROR_KINDS.AUTH, `JSON-RPC 401 ${said}`, 200, code);
  }
  return new KanboardError(ERROR_KINDS.HTTP, `JSON-RPC ${code ?? '?'} ${said}`, 200, code);
}

const pad = (n) => String(n).padStart(2, '0');

/** `Y-m-d H:i` of the UTC fields of `ms`. */
export const utcWall = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

/** Read `Y-m-d H:i` as if it were UTC. */
const wallAsUtc = (wall) => {
  const [date, time] = wall.split(' ');
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, h, min);
};

/** `Y-m-d H:i` of `ms` in `timeZone`. */
export function zonedWall(ms, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
      .formatToParts(new Date(ms))
      .map(({ type, value }) => [type, Number(value)]),
  );
  return utcWall(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));
}

export class KanboardClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, without trailing slash
   * @param {string} options.username `jsonrpc` (application API) or a username
   * @param {string} options.token API token, password or personal access token
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {Function} [options.request] HTTP seam (src/kanboard/http.js)
   */
  constructor({ url, username = APP_USER, token, insecure = false, request = httpRequest }) {
    this.url = url;
    this.username = username || APP_USER;
    this.token = token;
    this.insecure = insecure;
    this.request = request;
    this.nextId = 1;
  }

  get isAppUser() {
    return this.username === APP_USER;
  }

  /** One HTTP request; `payload` is one JSON-RPC call or an array of them. */
  async post(payload) {
    let response;
    try {
      response = await this.request(`${this.url}/jsonrpc.php`, {
        method: 'POST',
        json: payload,
        insecure: this.insecure,
        headers: {
          authorization: `Basic ${Buffer.from(`${this.username}:${this.token}`).toString('base64')}`,
        },
      });
    } catch (err) {
      throw networkError(err);
    }
    const { status, body } = response;
    if (status === 401) {
      throw new KanboardError(ERROR_KINDS.AUTH, 'HTTP 401', status);
    }
    if (status === 403) {
      throw new KanboardError(ERROR_KINDS.FORBIDDEN, 'HTTP 403', status);
    }
    if (status === 429) {
      throw new KanboardError(ERROR_KINDS.RATE_LIMIT, 'HTTP 429', status);
    }
    if (status >= 300 && status < 400) {
      throw new KanboardError(ERROR_KINDS.REDIRECT, `HTTP ${status}`, status);
    }
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new KanboardError(
        status === 200 || status === 404 ? ERROR_KINDS.NOT_KANBOARD : ERROR_KINDS.HTTP,
        `HTTP ${status}, not JSON`,
        status,
      );
    }
    if (status === 404) {
      throw new KanboardError(ERROR_KINDS.NOT_KANBOARD, 'HTTP 404', status);
    }
    if (status < 200 || status >= 300) {
      throw new KanboardError(ERROR_KINDS.HTTP, `HTTP ${status}`, status);
    }
    const isRpc = (item) => item && typeof item === 'object' && item.jsonrpc === '2.0';
    const valid = Array.isArray(payload)
      ? Array.isArray(parsed) && parsed.length > 0 && parsed.every(isRpc)
      : isRpc(parsed);
    if (!valid) {
      throw new KanboardError(ERROR_KINDS.NOT_KANBOARD, 'not a JSON-RPC answer', status);
    }
    return parsed;
  }

  async call(method, params) {
    const answer = await this.post({
      jsonrpc: '2.0',
      method,
      id: this.nextId++,
      ...(params ? { params } : {}),
    });
    if (answer.error) {
      throw rpcError(answer.error);
    }
    return answer.result;
  }

  /** Several calls in one request; the results in order, or the first error. */
  async batch(calls) {
    if (calls.length === 0) {
      return [];
    }
    const requests = calls.map(([method, params]) => ({
      jsonrpc: '2.0',
      method,
      id: this.nextId++,
      ...(params ? { params } : {}),
    }));
    const answers = new Map((await this.post(requests)).map((answer) => [answer.id, answer]));
    return requests.map(({ id }) => {
      const answer = answers.get(id);
      if (!answer) {
        throw new KanboardError(ERROR_KINDS.HTTP, 'batch answer missing', 200);
      }
      if (answer.error) {
        throw rpcError(answer.error);
      }
      return answer.result;
    });
  }

  /** `v1.2.56`; NOT_KANBOARD when the answer is not a version. */
  async version() {
    const version = await this.call('getVersion');
    if (typeof version !== 'string' || version === '') {
      throw new KanboardError(ERROR_KINDS.NOT_KANBOARD, 'no version', 200);
    }
    return version;
  }

  /** The projects the credentials see. */
  async projects() {
    const projects = await this.call(this.isAppUser ? 'getAllProjects' : 'getMyProjects');
    return Array.isArray(projects) ? projects : [];
  }

  /** The open tasks of these projects, in one request. */
  async openTasks(projectIds) {
    const lists = await this.batch(
      projectIds.map((id) => ['getAllTasks', { project_id: id, status_id: 1 }]),
    );
    return lists.flatMap((list) => (Array.isArray(list) ? list : []));
  }

  async task(id) {
    const task = await this.call('getTask', { task_id: id });
    return task && typeof task === 'object' ? task : null;
  }

  /** Close a task, as the user of the credentials. */
  async close(id) {
    if ((await this.call('closeTask', { task_id: id })) !== true) {
      throw new KanboardError(ERROR_KINDS.HTTP, 'closeTask refused', 200, 'refused');
    }
  }

  /**
   * Create a task. The due time is sent in `timeZone` (the one of Gladys),
   * then checked and corrected when Kanboard reads its dates in another one.
   * @param {number} projectId
   * @param {string} title
   * @param {object} [options]
   * @param {number|null} [options.dueAt] milliseconds, null for none
   * @param {string} [options.timeZone]
   * @returns {Promise<object>} the task as Kanboard saved it
   */
  async createTask(projectId, title, { dueAt = null, timeZone = 'UTC' } = {}) {
    const sent = dueAt === null ? null : zonedWall(dueAt, timeZone);
    const id = await this.call('createTask', {
      title,
      project_id: projectId,
      ...(sent ? { date_due: sent } : {}),
    });
    if (!Number.isInteger(id) || id < 1) {
      throw new KanboardError(ERROR_KINDS.HTTP, 'createTask refused', 200, 'refused');
    }
    let task = await this.task(id);
    if (sent) {
      // Kanboard read the wall time in its own zone: shift what is sent by
      // the gap, a few times at most (the offsets may differ around a DST
      // change), and give up on a gap no time zone explains.
      const wanted = Math.floor(dueAt / 60_000) * 60_000;
      let wall = sent;
      for (let attempt = 0; attempt < 3 && task; attempt += 1) {
        const saved = Number(task.date_due) * 1000;
        const gap = wanted - saved;
        if (gap === 0 || !(saved > 0) || Math.abs(gap) > 14 * 60 * 60_000) {
          break;
        }
        wall = utcWall(wallAsUtc(wall) + gap);
        if ((await this.call('updateTask', { id, date_due: wall })) !== true) {
          break;
        }
        task = (await this.task(id)) ?? task;
      }
    }
    return task ?? { id, title, project_id: projectId };
  }
}
