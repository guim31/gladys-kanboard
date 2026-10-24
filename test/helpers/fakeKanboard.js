// -----------------------------------------------------------------------------
// An in-memory Kanboard, answering JSON-RPC on /jsonrpc.php the way the real
// server does (HTTP Basic, 401 for wrong credentials, 403 for a procedure the
// credentials may not call, batches with an error per item, `false` or 0 for
// a refused write, text due dates read in the server's time zone, a task
// repeating "when closed" that leaves a new one, the web app's HTML page
// elsewhere). Its starting data are real answers of kanboard/kanboard v1.2.56
// in Docker (October 2026, test/fixtures/kanboard/real-*.json): three projects
// (one archived) and eight open tasks — two overdue, three due today, three
// later or undated.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/kanboard/${name}.json`, import.meta.url), 'utf8'));

export const TOKEN = 'b3f1c0de5a1e0f0a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcd';
export const USER = { username: 'alice', password: 'alicepass1', projects: [1] };

const json = (status, value) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
});

const USER_ONLY = new Set(['getMe', 'getMyDashboard', 'getMyProjects', 'getMyOverdueTasks']);
const ADMIN_ONLY = new Set(['getAllProjects']);

/** Parse `Y-m-d H:i` (or `Y-m-d`) in a fixed UTC offset, as Kanboard would. */
function parseWall(value, offsetMinutes, now) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/);
  if (!match) {
    return null;
  }
  const [, y, m, d, h, min] = match.map(Number);
  // A date alone gets the current time of day (seen on the real server).
  const time = match[4] === undefined ? (now % 86_400_000) / 1000 : (h * 60 + min) * 60;
  return Math.floor(Date.UTC(y, m - 1, d) / 1000 + time - offsetMinutes * 60);
}

export class FakeKanboard {
  constructor({ now = () => Date.now(), token = TOKEN, user = USER } = {}) {
    this.now = now;
    this.token = token;
    this.user = structuredClone(user);
    this.version = 'v1.2.56';
    this.projects = structuredClone(fixture('real-projects'));
    this.tasks = [
      ...structuredClone(fixture('real-tasks-open-1')),
      ...structuredClone(fixture('real-tasks-open-2')),
    ];
    /** Offset of the time zone of Kanboard, in minutes (UTC by default). */
    this.offsetMinutes = 0;
    this.online = true;
    this.requests = [];
    this.nextId = 100;
  }

  task(id) {
    return this.tasks.find((task) => task.id === id);
  }

  project(id) {
    return this.projects.find((project) => project.id === id);
  }

  /** Who is calling: 'app', 'user', or null. */
  caller(authorization) {
    const decoded = Buffer.from(String(authorization ?? '').replace(/^Basic /, ''), 'base64')
      .toString('utf8')
      .split(':');
    const [username, ...rest] = decoded;
    const secret = rest.join(':');
    if (username === 'jsonrpc' && secret === this.token) {
      return 'app';
    }
    if (username === this.user.username && secret === this.user.password) {
      return 'user';
    }
    return null;
  }

  canSee(caller, projectId) {
    return caller === 'app' || this.user.projects.includes(projectId);
  }

  procedure(caller, method, params = {}) {
    if (caller === 'app' && USER_ONLY.has(method)) {
      return { forbidden: true };
    }
    if (caller === 'user' && ADMIN_ONLY.has(method)) {
      return { forbidden: true };
    }
    const projectOf = (id) => this.task(Number(id))?.project_id;
    switch (method) {
      case 'getVersion':
        return { result: this.version };
      case 'getAllProjects':
        return { result: this.projects };
      case 'getMyProjects':
        return {
          result: this.projects.filter(
            (project) => project.is_active === 1 && this.canSee(caller, project.id),
          ),
        };
      case 'getAllTasks': {
        const projectId = Number(params.project_id);
        if (!this.canSee(caller, projectId)) {
          return { forbidden: true };
        }
        return {
          result: this.tasks.filter(
            (task) =>
              task.project_id === projectId && task.is_active === Number(params.status_id ?? 1),
          ),
        };
      }
      case 'getTask': {
        const task = this.task(Number(params.task_id));
        if (task && !this.canSee(caller, task.project_id)) {
          return { forbidden: true };
        }
        return { result: task ?? null };
      }
      case 'createTask': {
        const projectId = Number(params.project_id);
        if (!params.title) {
          return { result: false };
        }
        if (!this.project(projectId)) {
          return { result: 0 };
        }
        if (!this.canSee(caller, projectId)) {
          return { forbidden: true };
        }
        let due = 0;
        if (params.date_due !== undefined) {
          due = parseWall(params.date_due, this.offsetMinutes, this.now());
          if (due === null) {
            return { result: false };
          }
        }
        const task = {
          id: this.nextId++,
          title: params.title,
          project_id: projectId,
          is_active: 1,
          date_due: due,
          priority: 0,
          recurrence_status: 0,
          recurrence_trigger: 0,
          recurrence_factor: 0,
          recurrence_child: null,
        };
        this.tasks.push(task);
        return { result: task.id };
      }
      case 'updateTask': {
        const task = this.task(Number(params.id));
        if (!task) {
          return { result: false };
        }
        if (!this.canSee(caller, task.project_id)) {
          return { forbidden: true };
        }
        if (params.date_due !== undefined) {
          const due = parseWall(params.date_due, this.offsetMinutes, this.now());
          if (due === null) {
            return { result: false };
          }
          task.date_due = due;
        }
        return { result: true };
      }
      case 'closeTask': {
        const task = this.task(Number(params.task_id));
        if (!task) {
          return { result: false };
        }
        if (!this.canSee(caller, projectOf(task.id))) {
          return { forbidden: true };
        }
        // True even when the task was already closed, as on the real server.
        if (task.is_active === 1) {
          task.is_active = 0;
          if (task.recurrence_status === 1 && task.recurrence_trigger === 2) {
            const child = {
              ...task,
              id: this.nextId++,
              is_active: 1,
              date_due: task.date_due + task.recurrence_factor * 86_400,
              recurrence_parent: task.id,
              recurrence_child: null,
            };
            task.recurrence_child = child.id;
            task.recurrence_status = 2;
            this.tasks.push(child);
          }
        }
        return { result: true };
      }
      default:
        return { error: { code: -32601, message: 'Method not found' } };
    }
  }

  answer(caller, call) {
    const outcome = this.procedure(caller, call.method, call.params);
    if (outcome.forbidden) {
      return { jsonrpc: '2.0', error: { code: 403, message: 'Forbidden' }, id: call.id };
    }
    if (outcome.error) {
      return { jsonrpc: '2.0', error: outcome.error, id: call.id };
    }
    return { jsonrpc: '2.0', result: outcome.result, id: call.id };
  }

  handle(url, { method = 'GET', headers = {}, json: body } = {}) {
    const { pathname } = new URL(url);
    const calls = Array.isArray(body) ? body : [body];
    this.requests.push({ method, path: pathname, calls: calls.map((call) => call?.method) });
    if (pathname !== '/jsonrpc.php') {
      return { status: 200, headers: { 'content-type': 'text/html' }, body: '<!DOCTYPE html>' };
    }
    const caller = this.caller(headers.authorization);
    if (!caller) {
      return json(401, { jsonrpc: '2.0', error: { code: 401, message: 'Unauthorized' }, id: null });
    }
    if (!Array.isArray(body)) {
      const answer = this.answer(caller, body);
      if (answer.error?.code === 403) {
        return json(403, { jsonrpc: '2.0', error: answer.error, id: null });
      }
      return json(200, answer);
    }
    return json(
      200,
      body.map((call) => this.answer(caller, call)),
    );
  }
}

/** The network: one fake server per base URL; anything else does not answer. */
export function createNetwork(servers) {
  return {
    servers,
    async request(url, options = {}) {
      const base = Object.keys(servers).find((origin) => url.startsWith(`${origin}/`));
      const server = base ? servers[base] : null;
      if (!server || !server.online) {
        const error = new Error('connect ECONNREFUSED');
        error.code = 'ECONNREFUSED';
        throw error;
      }
      return server.handle(url, options);
    },
  };
}
