// -----------------------------------------------------------------------------
// The Kanboard hub: reads the instance on a timer of the container, publishes
// the counters of every followed project when they change, fires the scene
// events (a task reaches its due time, a task is still open when its due day
// ends), and closes or creates tasks for the widget and the scene actions.
//
// Gladys never polls these devices (should_poll: false): the interval goes up
// to 10 minutes, beyond the fixed list of the core scheduler, and the scene
// events must fire even when no device was added. The timer also wakes up at
// the next due time and local midnight, so the events and
// the counters move on time whatever the interval.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { hostOf } from './config.js';
import { buildOverview, buildProject, featureStates, overviewIds, projectIds } from './devices.js';
import { ERROR_KINDS, KanboardClient, KanboardError } from './kanboard/client.js';
import {
  findByIdOrTitle,
  localDay,
  parseDue,
  parseProjects,
  parseTasks,
  resolveTimeZone,
  summarize,
} from './kanboard/model.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  DONE_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  TODAY_TEXT,
  UNKNOWN_PROJECTS,
  allLanguages,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'kanboard-hub' });

export const WIDGET_KEY = 'tasks_today';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  DUE: 'task_due',
  OVERDUE: 'task_overdue',
});

export const HUB_TIMINGS = {
  // A failed read is tried again this soon, whatever the interval.
  retryMs: 30_000,
  // ...but refused credentials only this rarely: Kanboard locks an account
  // after a few failed logins. A new configuration or "Test the connection"
  // reads at once.
  authRetryMs: 15 * 60_000,
  // Read this long after a due time or midnight, so the server agrees.
  wakeSlackMs: 2_000,
  // Never read more often than this, even for tasks due a second apart.
  minDelayMs: 10_000,
  // Re-send unchanged values this often: Gladys shows "no recent value" after 48 h.
  heartbeatMs: 12 * 60 * 60_000,
  // An event this late (Kanboard or the integration was down) is dropped.
  maxLateMs: 60 * 60_000,
};

// The reading after a command is awaited at most this long: the scene action
// and the widget button answer within their 20 s.
const REFRESH_WAIT_MS = 3_000;
// Titles read out by the "Read today's tasks" action.
const MAX_TITLES = 10;

const iso = (ms) => (ms === null ? '' : new Date(ms).toISOString());

export class KanboardHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/kanboard/http.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   * @param {string} [options.timeZone] defaults to TZ, set by the Gladys supervisor
   */
  constructor({ gladys, store, request, timers = true, timings, now, timeZone }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.timeZone = resolveTimeZone(timeZone ?? process.env.TZ);
    this.config = null;
    this.client = null;
    this.reset();
    this.saved = { scope: null, readAt: 0 };
    this.connection = null;
    this.devicesSignature = null;
    this.widgetSignature = null;
    this.transports = new Map();
    this.timer = null;
    this.polling = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  reset() {
    /** Every active project the credentials see. */
    this.projects = [];
    /** The followed ones (the configuration's list, or all). */
    this.followed = [];
    this.unknownProjects = [];
    /** Open tasks of the followed projects. */
    this.tasks = [];
    this.version = null;
    this.error = null;
    this.downSince = null;
    this.readAt = 0;
    this.connectedLogged = false;
  }

  // --- Logs ------------------------------------------------------------------
  // Info keeps the lifecycle only (connected, lost, back, user commands). A
  // problem that repeats is logged once, then at debug until it clears.

  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  get language() {
    return this.config?.language ?? 'en';
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = {
      scope: typeof saved.scope === 'string' ? saved.scope : null,
      readAt: Number.isFinite(saved.readAt) ? saved.readAt : 0,
      sent: Array.isArray(saved.sent) ? saved.sent.filter((id) => typeof id === 'string') : [],
    };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.connection = null;
    this.devicesSignature = null;
    this.transports.clear();
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const same =
      previous &&
      previous.url === config.url &&
      previous.username === config.username &&
      previous.token === config.token &&
      previous.allowSelfSigned === config.allowSelfSigned;
    if (!same) {
      this.reset();
      this.client =
        config.url && config.token
          ? new KanboardClient({
              url: config.url,
              username: config.username,
              token: config.token,
              insecure: config.allowSelfSigned,
              request: this.request,
            })
          : null;
    }
    // A new language or project list: the devices are published again.
    this.devicesSignature = null;
    this.gladys.forgetPublishedStates?.();
    await this.poll();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.polling?.catch(() => {});
    await this.store.flush();
  }

  schedule(delay) {
    clearTimeout(this.timer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.timer = setTimeout(() => {
      this.poll().catch((err) => this.problem('poll', 'Reading failed', err, 'error'));
    }, delay);
  }

  /** The interval, shortened to the next due time or local midnight. */
  nextDelay(readAt = this.now()) {
    if (this.error?.kind === ERROR_KINDS.AUTH) {
      return Math.max(this.config.pollIntervalMs, this.timings.authRetryMs);
    }
    if (this.error) {
      return Math.min(this.config.pollIntervalMs, this.timings.retryMs);
    }
    const now = this.now();
    // `readAt`: a moment that passed during the reading is still ahead of it.
    const moments = [localDay(readAt, this.timeZone).end];
    for (const task of this.tasks) {
      if (task.dueAt !== null && task.dueAt > readAt) {
        moments.push(task.dueAt);
      }
    }
    const ahead = moments.filter((moment) => moment + this.timings.wakeSlackMs > now);
    const wake = ahead.length === 0 ? 0 : Math.min(...ahead) - now + this.timings.wakeSlackMs;
    return Math.max(this.timings.minDelayMs, Math.min(this.config.pollIntervalMs, wake));
  }

  // --- Reading ---------------------------------------------------------------

  /** One reading at a time: a call during a reading waits for it, then reads. */
  poll() {
    const run = async () => {
      const readAt = this.now();
      try {
        await this.read();
      } finally {
        this.schedule(this.nextDelay(readAt));
      }
    };
    this.polling = (this.polling ?? Promise.resolve()).catch(() => {}).then(run);
    return this.polling;
  }

  async read() {
    if (!this.client) {
      await this.publishConnectionStatus();
      return;
    }
    const now = this.now();
    const { client } = this;
    try {
      const version = this.version ?? (await client.version());
      const projects = parseProjects(await client.projects());
      const followed = this.follow(projects);
      // One JSON-RPC batch: the open tasks of every followed project.
      const tasks = await client.openTasks(followed.map((project) => project.id));
      if (client !== this.client) {
        // The configuration changed during the reading: these are the old
        // instance's tasks; the new one is being read.
        return;
      }
      this.version = version;
      this.projects = projects;
      this.followed = followed;
      const ids = new Set(followed.map((project) => project.id));
      this.tasks = parseTasks(tasks).filter((task) => ids.has(task.projectId));
      this.readAt = now;
      this.recovered(now);
    } catch (err) {
      if (client !== this.client) {
        return;
      }
      this.failed(err, now);
    }
    if (this.readAt !== 0) {
      await this.publishDevices();
      if (!this.error) {
        await this.publishStates();
        await this.fireEvents(now);
      }
    }
    await this.publishTransports();
    await this.publishConnectionStatus();
    this.refreshWidget();
  }

  /** The followed projects: the configuration's list (names or numbers), or all. */
  follow(projects) {
    const wanted = this.config.projects;
    if (wanted.length === 0) {
      this.unknownProjects = [];
      return projects;
    }
    const found = new Map();
    const unknown = [];
    for (const query of wanted) {
      const { item } = findByIdOrTitle(projects, query);
      if (item) {
        found.set(item.id, item);
      } else {
        unknown.push(query);
      }
    }
    if (unknown.join('|') !== this.unknownProjects.join('|')) {
      this.unknownProjects = unknown;
      if (unknown.length > 0) {
        logger.warn(UNKNOWN_PROJECTS.en(unknown.join(', ')));
      }
    }
    return projects.filter((project) => found.has(project.id));
  }

  recovered(now) {
    const host = hostOf(this.config.url);
    if (this.downSince !== null) {
      const minutes = Math.round((now - this.downSince) / 60_000);
      this.resolved('read', `Kanboard at ${host} answers again after ${minutes} min`);
    }
    if (!this.connectedLogged) {
      this.connectedLogged = true;
      logger.info(
        `Connected to Kanboard ${this.version} at ${host}: ${this.tasks.length} open task(s) in ${this.followed.length} followed project(s)`,
      );
    }
    this.error = null;
    this.downSince = null;
  }

  failed(err, now) {
    const kind = err instanceof KanboardError ? err.kind : ERROR_KINDS.HTTP;
    this.error = { kind, message: err.message };
    this.downSince ??= now;
    this.problem(
      'read',
      `Kanboard at ${hostOf(this.config.url)}: ${err.message}`,
      undefined,
      'error',
    );
  }

  /** The followed project of a project device external id, null when none. */
  projectOf(externalId) {
    return (
      this.followed.find((project) => projectIds(this.gladys, project.id).device === externalId) ??
      null
    );
  }

  /** What a widget or a scene points at: every followed project, or one. */
  view(deviceExternalId) {
    if (!deviceExternalId || deviceExternalId === overviewIds(this.gladys).device) {
      return { project: null, unknown: false };
    }
    const project = this.projectOf(deviceExternalId);
    return { project, unknown: !project };
  }

  summary(projectId = null) {
    const now = this.now();
    return summarize(this.tasks, { now, day: localDay(now, this.timeZone), projectId });
  }

  projectTitle(projectId) {
    return this.projects.find((project) => project.id === projectId)?.title ?? `#${projectId}`;
  }

  // --- Publishing to Gladys --------------------------------------------------

  devices() {
    const list = [buildOverview(this.gladys, this.language)];
    const titles = new Map();
    for (const project of this.followed) {
      titles.set(project.title, (titles.get(project.title) ?? 0) + 1);
    }
    for (const project of this.followed) {
      // Two projects may share a name: the number tells them apart.
      const title =
        titles.get(project.title) > 1 ? `${project.title} #${project.id}` : project.title;
      list.push(buildProject(this.gladys, { ...project, title }, this.language));
    }
    return list;
  }

  async publishDevices() {
    const devices = this.devices();
    const signature = JSON.stringify(devices);
    if (signature === this.devicesSignature) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.devicesSignature = signature;
      this.resolved('devices');
    } catch (err) {
      this.problem('devices', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab. */
  async rediscover() {
    this.devicesSignature = null;
    await this.poll();
  }

  /** The user added a device: the states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    this.gladys.forgetPublishedStates?.(device?.external_id);
    if (!this.error && this.readAt !== 0) {
      await this.publishStates();
    }
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  states() {
    const states = featureStates(overviewIds(this.gladys), this.summary(), this.language);
    for (const project of this.followed) {
      states.push(
        ...featureStates(
          projectIds(this.gladys, project.id),
          this.summary(project.id),
          this.language,
        ),
      );
    }
    return states;
  }

  async publishStates() {
    try {
      // Only the changes, and every value again after `heartbeatMs`.
      await this.gladys.publishChangedStates(this.states(), {
        heartbeat: this.timings.heartbeatMs,
      });
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States refused: ${err.message}`);
    }
  }

  async publishTransports() {
    if (this.readAt === 0) {
      return;
    }
    const transport = this.error ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.LOCAL;
    const entries = this.devices()
      .map((device) => ({ external_id: device.external_id, transport }))
      .filter((entry) => this.transports.get(entry.external_id) !== entry.transport);
    if (entries.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(entries);
      for (const entry of entries) {
        this.transports.set(entry.external_id, entry.transport);
      }
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  connectionStatus() {
    if (!this.config.url) {
      return {
        connected: false,
        message: this.config.urlTyped ? CONNECTION_TEXT.invalidUrl : CONNECTION_TEXT.noUrl,
      };
    }
    if (!this.config.token) {
      return { connected: false, message: CONNECTION_TEXT.noToken };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  refreshWidget() {
    const signature = JSON.stringify([
      this.error?.kind ?? null,
      this.tasks,
      this.followed,
      localDay(this.now(), this.timeZone).start,
    ]);
    if (signature !== this.widgetSignature) {
      this.widgetSignature = signature;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  // --- Scene events ----------------------------------------------------------

  /**
   * The moments crossed since the previous successful reading (persisted under
   * /data, so a restart neither repeats nor loses one): a due time, the end
   * of the due day. A due date moved into the past by hand
   * is not a crossing: nothing fires for it.
   */
  async fireEvents(now) {
    const scope = this.config.url;
    if (this.saved.scope !== scope || this.saved.readAt === 0) {
      // First reading of this instance: what already passed is not news.
      this.saved = { scope, readAt: now, sent: [] };
      this.store.save(this.saved);
      return;
    }
    // Events already sent at the instant a refused one was rewound to.
    const already = new Set(this.saved.sent ?? []);
    const from = Math.max(this.saved.readAt, now - this.timings.maxLateMs);
    const crossed = (moment) => moment !== null && moment > from && moment <= now;
    const events = [];
    for (const task of this.tasks) {
      const base = this.eventData(task);
      if (crossed(task.dueAt)) {
        events.push({ at: task.dueAt, key: TRIGGERS.DUE, data: base });
      }
      if (task.dueAt !== null) {
        const dayEnd = localDay(task.dueAt, this.timeZone).end;
        if (crossed(dayEnd)) {
          events.push({ at: dayEnd, key: TRIGGERS.OVERDUE, data: base });
        }
      }
    }
    events.sort((a, b) => a.at - b.at);
    let readAt = now;
    let sent = [];
    const fired = [];
    for (const { at, key, data } of events) {
      const id = `${key}:${data.task_id}:${at}`;
      if (already.has(id)) {
        continue;
      }
      if (!(await this.fire(key, data))) {
        // Gladys refused (restarting?): this event and the next ones are
        // tried again at the next reading, within the hour; those of the
        // same instant already sent are remembered, not sent twice.
        readAt = at - 1;
        sent = [
          ...fired.filter((item) => item.at === at).map((item) => item.id),
          ...[...already].filter((item) => item.endsWith(`:${at}`)),
        ];
        break;
      }
      fired.push({ at, id });
    }
    if (readAt > this.saved.readAt || sent.length !== (this.saved.sent ?? []).length) {
      this.saved = { scope, readAt: Math.max(readAt, this.saved.readAt), sent };
      this.store.save(this.saved);
    }
  }

  eventData(task) {
    return {
      task: task.title,
      task_id: task.id,
      project: projectIds(this.gladys, task.projectId).device,
      project_name: this.projectTitle(task.projectId),
      priority: task.priority,
      due_date: iso(task.dueAt),
    };
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.resolved('scene-event');
      return true;
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
      return false;
    }
  }

  // --- Commands --------------------------------------------------------------

  /** A Kanboard error, in words for the user (the server's text stays in the logs). */
  explain(err) {
    if (!(err instanceof KanboardError)) {
      return err;
    }
    const language = this.language;
    const colon = language === 'fr' ? ' : ' : ': ';
    const status = err.status && err.status !== 200 ? ` (HTTP ${err.status})` : '';
    return new Error(`Kanboard${colon}${pick(ERROR_TEXT[err.kind], language)}${status}`, {
      cause: err,
    });
  }

  requireClient() {
    if (!this.client) {
      throw new Error(pick(ACTION_TEXT.notConfigured, this.language));
    }
    return this.client;
  }

  /** Read again now, and wait for it a little (the toast should not lag). */
  async refreshSoon() {
    const refresh = this.poll().catch(() => {});
    let timer;
    await Promise.race([
      refresh,
      new Promise((resolve) => {
        timer = setTimeout(resolve, REFRESH_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
  }

  /** Every active project the credentials see, read now. */
  async freshProjects() {
    return parseProjects(await this.requireClient().projects());
  }

  /**
   * Close an open task, by number or exact title, as the user of the
   * credentials.
   * @param {string|number} query
   * @param {object} [options]
   * @param {number|null} [options.expectedDue] the due time the user saw (widget
   *   button): a different one means the task changed meanwhile.
   * @returns {Promise<{ task: object, projectName: string, nextDue: number|null }>}
   */
  complete(query, options = {}) {
    // One at a time: two taps on the same button must not both pass the
    // "still open" check before either closes the task.
    const run = () => this.completeNow(query, options);
    this.completing = (this.completing ?? Promise.resolve()).catch(() => {}).then(run);
    return this.completing;
  }

  async completeNow(query, { expectedDue } = {}) {
    const client = this.requireClient();
    let task;
    let projects;
    let nextDue = null;
    try {
      projects = await this.freshProjects();
      const visible = new Set(projects.map((project) => project.id));
      // A number: that task alone, no need to read every project.
      const number = String(query ?? '')
        .trim()
        .match(/^#?(\d+)$/);
      let item = null;
      let reason;
      if (number) {
        const [byId] = parseTasks([await client.task(Number(number[1])).catch(() => null)]);
        item = byId && visible.has(byId.projectId) ? byId : null;
      }
      if (!item) {
        // A fresh list: the task may have been created a minute ago.
        const open = parseTasks(await client.openTasks([...visible]));
        ({ item, reason } = findByIdOrTitle(open, query));
      }
      if (!item && expectedDue !== undefined) {
        // A widget button: the task was closed meanwhile (a second tap).
        throw new KanboardError(ERROR_KINDS.HTTP, 'task no longer open', 409, 'stale');
      }
      if (!item) {
        const key = { empty: 'emptyTask', ambiguous: 'taskAmbiguous' }[reason] ?? 'taskNotFound';
        throw new Error(pick(ACTION_TEXT[key], this.language));
      }
      task = item;
      if (expectedDue !== undefined && task.dueAt !== expectedDue) {
        throw new KanboardError(ERROR_KINDS.HTTP, 'due date changed', 409, 'stale');
      }
      await client.close(task.id);
      // A task repeating "when closed" leaves a new one, due later.
      const closed = await client.task(task.id).catch(() => null);
      const childId = Number(closed?.recurrence_child);
      if (Number.isInteger(childId) && childId > 0) {
        const [child] = parseTasks([await client.task(childId).catch(() => null)]);
        nextDue = child?.dueAt ?? null;
      }
    } catch (err) {
      if (err instanceof KanboardError && err.code === 'stale') {
        this.poll().catch(() => {});
        throw new Error(pick(ACTION_TEXT.alreadyDone, this.language), { cause: err });
      }
      throw this.explain(err);
    }
    logger.info(`Task #${task.id} closed from Gladys`);
    await this.refreshSoon();
    return {
      task,
      projectName:
        projects.find((project) => project.id === task.projectId)?.title ??
        this.projectTitle(task.projectId),
      nextDue,
    };
  }

  /**
   * Find a project by number or name among every project the credentials
   * see. Empty: the first followed project (the first one by name).
   */
  async findProject(query) {
    const projects = await this.freshProjects();
    if (String(query ?? '').trim() === '') {
      const followed = new Set(this.follow(projects).map((project) => project.id));
      const first = projects.find((project) => followed.has(project.id)) ?? projects[0];
      if (!first) {
        throw new Error(pick(ACTION_TEXT.noProject, this.language));
      }
      return first;
    }
    const { item, reason } = findByIdOrTitle(projects, query);
    if (!item) {
      const key = reason === 'ambiguous' ? 'projectAmbiguous' : 'projectNotFound';
      throw new Error(pick(ACTION_TEXT[key], this.language));
    }
    return item;
  }

  /**
   * Create a task in a project, by number or name (empty: the first followed
   * project), with an optional due date as typed (see parseDue).
   */
  async create(title, projectQuery, dueText) {
    const client = this.requireClient();
    const wanted = String(title ?? '').trim();
    if (!wanted) {
      throw new Error(pick(ACTION_TEXT.emptyTitle, this.language));
    }
    const dueAt = parseDue(dueText, { now: this.now(), timeZone: this.timeZone });
    if (dueAt === undefined) {
      throw new Error(pick(ACTION_TEXT.badDue, this.language));
    }
    let project;
    let created;
    try {
      project = await this.findProject(projectQuery);
      created = await client.createTask(project.id, wanted.slice(0, 250), {
        dueAt,
        timeZone: this.timeZone,
      });
    } catch (err) {
      throw this.explain(err);
    }
    logger.info(`Task #${created.id} created in project #${project.id} from Gladys`);
    await this.refreshSoon();
    const [saved] = parseTasks([{ is_active: 1, ...created }]);
    return {
      id: created.id,
      title: saved?.title ?? wanted,
      project,
      dueAt: saved ? saved.dueAt : dueAt,
    };
  }

  /**
   * Today's tasks, as a sentence for a message or a voice announcement, for
   * every followed project or one (number or name).
   */
  async today(projectQuery) {
    this.requireClient();
    await this.poll();
    if (this.error) {
      throw this.explain(new KanboardError(this.error.kind, this.error.message));
    }
    let projectId = null;
    if (String(projectQuery ?? '').trim() !== '') {
      const { item, reason } = findByIdOrTitle(this.followed, projectQuery);
      if (!item) {
        const key = reason === 'ambiguous' ? 'projectAmbiguous' : 'projectNotFound';
        throw new Error(pick(ACTION_TEXT[key], this.language));
      }
      projectId = item.id;
    }
    const summary = this.summary(projectId);
    const texts = TODAY_TEXT[this.language] ?? TODAY_TEXT.en;
    const titles = summary.today.slice(0, MAX_TITLES).map((task) => task.title);
    const more = summary.today.length - titles.length;
    if (more > 0) {
      titles.push(`+${more}`);
    }
    const text =
      summary.toDoToday === 0
        ? texts.none
        : texts.list(summary.toDoToday, titles) +
          (summary.overdue > 0 ? texts.overdue(summary.overdue) : '');
    return {
      count: summary.toDoToday,
      overdue: summary.overdue,
      text: text.slice(0, 1000),
    };
  }

  /** The toast of a command, in the four languages. */
  static doneMessage(title, kind = 'done') {
    return allLanguages((language) => DONE_TEXT[language][kind](title).slice(0, 200));
  }

  /** The "Test the connection" action: read now, report. */
  async testConnection() {
    this.version = null;
    await this.poll();
    const status = this.connectionStatus();
    if (!status.connected) {
      const message = allLanguages((language) =>
        REPORT_TEXT[language].failed(pick(status.message, language)),
      );
      throw new Error(message[this.language]);
    }
    return allLanguages((language) => {
      const unknown =
        this.unknownProjects.length > 0
          ? ` ${UNKNOWN_PROJECTS[language](this.unknownProjects.join(', '))}`
          : '';
      return `${REPORT_TEXT[language].ok(this.version, this.tasks.length, this.followed.length)}${unknown}`;
    });
  }
}
