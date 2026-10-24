// -----------------------------------------------------------------------------
// The hub against the in-memory Kanboard (real answers of kanboard/kanboard
// v1.2.56): counters, followed projects, scene events, the scene actions and
// the error cases. The clock starts on 24/10/2026 at 16:35 in Paris.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_CONFIG,
  FakeKanboard,
  START,
  TOKEN,
  URL_1,
  USER,
  createClock,
  createWorld,
  overviewId,
  projectId,
} from './helpers/world.js';

const at = (h, m = 0, s = 0) => Date.UTC(2026, 9, 24, h, m, s); // UTC, 24/10/2026

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const counters = (w, ids) => ({
  open: w.fake.lastState(ids.feature('open')),
  toDo: w.fake.lastState(ids.feature('to_do_today')),
  overdue: w.fake.lastState(ids.feature('overdue')),
  next: w.fake.lastState(ids.feature('next_task')),
});

const keys = (w) => w.fake.sceneEvents.map((event) => `${event.key}:${event.data.task_id}`);

const USER_CONFIG = { ...BASE_CONFIG, username: USER.username, api_token: USER.password };

test('the counters of every followed project together and of each one', async (t) => {
  const w = await world(t);
  assert.deepEqual(counters(w, overviewId(w.gladys)), {
    open: 8,
    toDo: 5,
    overdue: 2,
    next: 'Acheter du pain',
  });
  assert.deepEqual(counters(w, projectId(w.gladys, 1)), {
    open: 6,
    toDo: 4,
    overdue: 2,
    next: 'Sortir les poubelles',
  });
  assert.deepEqual(counters(w, projectId(w.gladys, 2)), {
    open: 2,
    toDo: 1,
    overdue: 0,
    next: 'Acheter du pain',
  });
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.name),
    ['Kanboard', 'Kanboard Courses', 'Kanboard Maison'],
    'the archived project is left out',
  );
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('one request for the projects, one batch for the tasks', async (t) => {
  const w = await world(t);
  const before = w.server.requests.length;
  await w.hub.poll();
  assert.deepEqual(
    w.server.requests.slice(before).map((request) => request.calls.join('+')),
    ['getAllProjects', 'getAllTasks+getAllTasks'],
  );
});

test('a user account: its own projects only, through getMyProjects', async (t) => {
  const w = await world(t, { config: USER_CONFIG });
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.name),
    ['Kanboard', 'Kanboard Maison'],
  );
  assert.equal(counters(w, overviewId(w.gladys)).open, 6);
  assert.ok(w.server.requests.some((request) => request.calls.includes('getMyProjects')));
  const other = await w.fake.sceneAction('complete_task', { task: '#8' });
  assert.match(other.error, /No open task/, 'a task of a project it cannot see');
});

test('only the followed projects, by name or number; unknown ones are reported', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, projects: 'maison; 3, Atelier' } });
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.name),
    ['Kanboard', 'Kanboard Maison'],
  );
  assert.equal(counters(w, overviewId(w.gladys)).open, 6, 'the overview follows them too');
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, true, ack.error);
  assert.equal(
    ack.data.message.en,
    'Kanboard v1.2.56 OK: 6 open task(s) in 1 followed project(s). Unknown project(s) ignored: 3, Atelier.',
  );
});

test('two projects with the same name get distinct device names', async (t) => {
  const server = new FakeKanboard({ now: createClock().now });
  server.projects.find((project) => project.id === 2).name = 'Maison';
  const w = await world(t, { server });
  assert.deepEqual(w.fake.discoveredDevices.map((device) => device.name).slice(1), [
    'Kanboard Maison #1',
    'Kanboard Maison #2',
  ]);
});

test('the day turns at local midnight, not UTC midnight', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  clock.time = at(21, 30); // 23:30 in Paris
  await w.hub.poll();
  assert.equal(counters(w, overviewId(w.gladys)).toDo, 5);
  assert.equal(counters(w, overviewId(w.gladys)).overdue, 5);
  clock.time = at(22, 30); // 00:30 in Paris on the 25th, still the 24th in UTC
  await w.hub.poll();
  assert.equal(counters(w, overviewId(w.gladys)).toDo, 6, 'the plants are due on the 25th');
});

test('nothing fires at the first reading; due times and midnight fire once', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  assert.deepEqual(w.fake.sceneEvents, [], 'what already passed is not news');

  clock.time = at(16, 0, 2);
  await w.hub.poll();
  await w.hub.poll();
  assert.deepEqual(keys(w), ['task_due:8']);
  assert.deepEqual(w.fake.sceneEvents[0].data, {
    task: 'Acheter du pain',
    task_id: 8,
    project: projectId(w.gladys, 2).device,
    project_name: 'Courses',
    priority: 0,
    due_date: '2026-10-24T16:00:00.000Z',
  });

  clock.time = at(18, 0, 2);
  await w.hub.poll();
  clock.time = at(20, 0, 2);
  await w.hub.poll();
  assert.deepEqual(keys(w).slice(1), ['task_due:1', 'task_due:3']);

  clock.time = at(22, 0, 2); // midnight in Paris: three tasks of the 24th left open
  await w.hub.poll();
  await w.hub.poll();
  assert.deepEqual(keys(w).slice(3), ['task_overdue:8', 'task_overdue:1', 'task_overdue:3']);
});

test('a task closed before its due time fires nothing', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  const ack = await w.fake.sceneAction('complete_task', { task: 'sortir LES poubelles' });
  assert.equal(ack.success, true, ack.error);
  clock.time = at(22, 0, 2);
  await w.hub.poll();
  assert.ok(!keys(w).some((key) => key.endsWith(':1')), keys(w).join());
});

test('a due date moved into the past by hand is no crossing', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  w.server.task(9).date_due = at(14, 0) / 1000;
  clock.advance(60_000);
  await w.hub.poll();
  assert.deepEqual(w.fake.sceneEvents, []);
  assert.equal(counters(w, overviewId(w.gladys)).overdue, 3);
});

test('the events survive a restart, without repeats, and are dropped when too late', async (t) => {
  const clock = createClock();
  const first = await createWorld({ clock });
  await first.app.stop();
  // Down from 14:35 to 18:10 UTC: the bread (16:00) is more than an hour old,
  // dropped; the bins (18:00) fire.
  clock.time = at(18, 10);
  const second = await createWorld({ clock, dataDir: first.dataDir });
  t.after(() => second.app.stop());
  assert.deepEqual(keys(second), ['task_due:1']);
  await second.app.stop();
  const third = await createWorld({ clock, dataDir: first.dataDir });
  t.after(() => third.app.stop());
  assert.deepEqual(third.fake.sceneEvents, [], 'nothing twice');

  await third.app.stop();
  clock.time = at(23, 30); // midnight passed 90 minutes ago: too late to be useful
  const fourth = await createWorld({ clock, dataDir: first.dataDir });
  t.after(() => fourth.app.stop());
  assert.deepEqual(fourth.fake.sceneEvents, []);
});

test('complete_task: by title or number; a task repeating when closed gives its next due date', async (t) => {
  const w = await world(t);
  const ok = await w.fake.sceneAction('complete_task', { task: '  SORTIR les poubelles ' });
  assert.equal(ok.success, true, ok.error);
  assert.deepEqual(ok.data.outputs, {
    task: 'Sortir les poubelles',
    task_id: 1,
    project_name: 'Maison',
    next_due_date: '',
  });
  assert.equal(w.server.task(1).is_active, 0);
  assert.equal(counters(w, overviewId(w.gladys)).toDo, 4, 'the counters follow at once');

  Object.assign(w.server.task(9), {
    recurrence_status: 1,
    recurrence_trigger: 2,
    recurrence_factor: 7,
  });
  const repeating = await w.fake.sceneAction('complete_task', { task: '#9' });
  assert.equal(repeating.success, true, repeating.error);
  assert.equal(repeating.data.outputs.next_due_date, '2026-11-02T09:00:00.000Z');
  assert.equal(counters(w, projectId(w.gladys, 2)).open, 2, 'the new occurrence is open');

  assert.equal((await w.fake.sceneAction('complete_task', { task: 5 })).data.outputs.task_id, 5);
  const closed = await w.fake.sceneAction('complete_task', { task: '#1' });
  assert.match(closed.error, /No open task/, 'already closed');
  const empty = await w.fake.sceneAction('complete_task', { task: ' ' });
  assert.match(empty.error, /title or the number/);
  w.server.task(2).title = 'Acheter du pain';
  const twice = await w.fake.sceneAction('complete_task', { task: 'acheter du pain' });
  assert.match(twice.error, /Several open tasks/);
});

test('create_task: in a project by name or number, or in the first followed one', async (t) => {
  const w = await world(t);
  const ok = await w.fake.sceneAction('create_task', {
    title: ' Acheter du lait ',
    project: 'courses',
  });
  assert.equal(ok.success, true, ok.error);
  assert.deepEqual(ok.data.outputs, {
    task: 'Acheter du lait',
    task_id: 100,
    project_name: 'Courses',
    due_date: '',
  });
  assert.equal(w.server.task(100).date_due, 0);
  assert.equal(counters(w, projectId(w.gladys, 2)).open, 3);

  const first = await w.fake.sceneAction('create_task', { title: 'Appeler mamie' });
  assert.equal(first.data.outputs.project_name, 'Courses', 'first by name');
  const byNumber = await w.fake.sceneAction('create_task', { title: 'Tondre', project: '#1' });
  assert.equal(byNumber.data.outputs.project_name, 'Maison');

  const archived = await w.fake.sceneAction('create_task', { title: 'x', project: 'Archives' });
  assert.match(archived.error, /No project has this name/);
  const empty = await w.fake.sceneAction('create_task', { title: '  ' });
  assert.match(empty.error, /title of the new task/);
});

test('create_task: the due date is typed in the time zone of Gladys, whatever Kanboard uses', async (t) => {
  const w = await world(t);
  // Kanboard in UTC: the wall time sent (Paris) is corrected once.
  const utc = await w.fake.sceneAction('create_task', {
    title: 'Vidange',
    due_date: 'demain 9h30',
  });
  assert.equal(utc.success, true, utc.error);
  assert.equal(utc.data.outputs.due_date, '2026-10-25T08:30:00.000Z', '09:30 in Paris (CET)');
  assert.equal(
    w.server.task(utc.data.outputs.task_id).date_due * 1000,
    Date.parse(utc.data.outputs.due_date),
  );

  // Kanboard in the same zone as Gladys: no correction needed.
  w.server.offsetMinutes = 120;
  const before = w.server.requests.length;
  const paris = await w.fake.sceneAction('create_task', { title: 'Pain', due_date: '19:15' });
  assert.equal(paris.data.outputs.due_date, '2026-10-24T17:15:00.000Z', 'today, 19:15 in Paris');
  assert.ok(
    !w.server.requests.slice(before).some((request) => request.calls.includes('updateTask')),
  );

  const noTime = await w.fake.sceneAction('create_task', { title: 'A', due_date: '2026-10-30' });
  assert.equal(noTime.data.outputs.due_date, '2026-10-30T17:00:00.000Z', '18:00 by default');
  const evening = await w.fake.sceneAction('create_task', { title: 'C', due_date: '24/10/2026' });
  assert.equal(
    evening.data.outputs.due_date,
    '2026-10-24T16:00:00.000Z',
    '18:00 Paris, still ahead',
  );
  const bad = await w.fake.sceneAction('create_task', { title: 'B', due_date: 'next week' });
  assert.match(bad.error, /Due date not understood/);
});

test('read_today: a sentence for a message or a voice announcement', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, language: 'fr' } });
  const all = await w.fake.sceneAction('read_today', {});
  assert.equal(all.success, true, all.error);
  assert.deepEqual(all.data.outputs, {
    count: 5,
    overdue: 2,
    text: "5 tâche(s) à faire aujourd'hui : Changer le filtre de la VMC, Vider le bac à compost, Acheter du pain, Sortir les poubelles et Lancer le lave-vaisselle. 2 en retard.",
  });
  const courses = await w.fake.sceneAction('read_today', { project: 'Courses' });
  assert.equal(courses.data.outputs.text, "1 tâche(s) à faire aujourd'hui : Acheter du pain.");
  const unknown = await w.fake.sceneAction('read_today', { project: 'Atelier' });
  assert.match(unknown.error, /Aucun projet/);
});

test('the scene actions answer in the language of the configuration', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, language: 'de' } });
  const missing = await w.fake.sceneAction('complete_task', { task: 'nichts' });
  assert.match(missing.error, /Keine offene Aufgabe/);
});

test('credentials refused, or a project forbidden, say so without the secret', async (t) => {
  const refused = await world(t, { config: { ...BASE_CONFIG, api_token: 'wrong' } });
  assert.equal(refused.fake.connectionStatus.connected, false);
  assert.match(refused.fake.connectionStatus.message.en, /token or password refused/);
  assert.equal(refused.fake.discoveredDevices.length, 0);

  const server = new FakeKanboard({ now: createClock().now });
  server.canSee = (caller, id) => id !== 2;
  const forbidden = await world(t, { server });
  assert.match(forbidden.fake.connectionStatus.message.en, /access forbidden/);
  const ack = await forbidden.fake.action('test_connection', {});
  assert.equal(ack.success, false);
  assert.ok(!ack.error.includes(TOKEN));

  const appOnly = await world(t, { config: { ...USER_CONFIG, username: 'jsonrpc' } });
  assert.match(appOnly.fake.connectionStatus.message.en, /refused/);
});

test('an address that is not Kanboard, or that does not answer', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, url: 'http://192.0.2.99:8080' } });
  assert.match(w.fake.connectionStatus.message.en, /does not answer/);
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, false);
  assert.equal(ack.error, 'Kanboard: Kanboard does not answer.');

  const server = new FakeKanboard({ now: createClock().now });
  server.handle = () => ({ status: 200, headers: {}, body: '<!DOCTYPE html>' });
  const html = await world(t, { server });
  assert.match(html.fake.connectionStatus.message.en, /no Kanboard API/);

  const other = new FakeKanboard({ now: createClock().now });
  other.handle = () => ({ status: 200, headers: {}, body: '{"status":"ok"}' });
  const json = await world(t, { server: other });
  assert.match(json.fake.connectionStatus.message.en, /no Kanboard API/);
});

test('no configuration: a clear status, no request', async (t) => {
  const w = await world(t, { config: { url: '', api_token: '' } });
  assert.match(w.fake.connectionStatus.message.en, /Enter the address/);
  assert.equal(w.server.requests.length, 0);
  const typo = await world(t, { config: { url: 'http://', api_token: TOKEN } });
  assert.match(typo.fake.connectionStatus.message.en, /Address not understood/);
  const noToken = await world(t, { config: { url: URL_1, api_token: ' ' } });
  assert.match(noToken.fake.connectionStatus.message.en, /API token/);
});

test('an outage keeps the devices and marks them unreachable, then back', async (t) => {
  const w = await world(t);
  w.server.online = false;
  await w.hub.poll();
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.equal(w.hub.tasks.length, 8, 'last known tasks kept');
  w.server.online = true;
  await w.hub.poll();
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('the states are published again when a device is added', async (t) => {
  const w = await world(t);
  const before = w.fake.states.length;
  await w.fake.deviceCreated(w.fake.discoveredDevices[0]);
  assert.ok(w.fake.states.length > before);
});

test('a reading of the old instance during a reconfiguration is dropped', async (t) => {
  const w = await world(t);
  const original = w.server.handle.bind(w.server);
  let release;
  // The next request of the old instance hangs until the new config is applied.
  w.server.handle = (...args) =>
    new Promise((resolve) => {
      release = () => {
        w.server.handle = original;
        resolve(original(...args));
      };
    });
  w.server.task(5).title = 'Seen only by the old reading';
  const reading = w.hub.poll();
  for (let i = 0; i < 100 && !release; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  const updated = w.fake.configUpdated({ ...w.fake.config, url: 'http://192.0.2.99:8080' });
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await Promise.all([reading, updated]);
  assert.deepEqual(w.hub.tasks, [], 'nothing of the old instance kept');
  assert.equal(w.fake.connectionStatus.connected, false);
});

test('refused credentials are tried again rarely: Kanboard locks accounts', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, api_token: 'wrong' } });
  assert.equal(w.hub.nextDelay(), 15 * 60_000);
  w.server.online = false;
  await w.fake.configUpdated({ ...w.fake.config, api_token: TOKEN });
  assert.equal(w.hub.nextDelay(), 30_000, 'an outage is retried soon');
});

test('events of the same instant: one refused, the others not sent twice', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  w.server.task(3).date_due = at(18, 0) / 1000;
  const publish = w.gladys.publishSceneEvent.bind(w.gladys);
  let refuse = true;
  t.mock.method(w.gladys, 'publishSceneEvent', async (key, data) => {
    if (refuse && data.task_id === 3) {
      throw new Error('Gladys is restarting');
    }
    return publish(key, data);
  });
  clock.time = at(18, 0, 2);
  await w.hub.poll();
  refuse = false;
  clock.advance(60_000);
  await w.hub.poll();
  await w.hub.poll();
  assert.deepEqual(keys(w), ['task_due:1', 'task_due:3']);
});

test('ids sent as strings (Kanboard on an older PHP) are understood', async (t) => {
  const server = new FakeKanboard({ now: createClock().now });
  for (const item of [...server.projects, ...server.tasks]) {
    for (const key of ['id', 'project_id', 'is_active', 'date_due', 'priority']) {
      if (typeof item[key] === 'number') {
        item[key] = String(item[key]);
      }
    }
  }
  const w = await world(t, { server });
  assert.equal(counters(w, overviewId(w.gladys)).open, 8);
  assert.equal(w.fake.discoveredDevices.length, 3);
});

test('the fixtures start where the tests expect them', () => {
  assert.equal(new Date(START).toISOString(), '2026-10-24T14:35:00.000Z');
  assert.equal(URL_1, 'http://192.0.2.20:8080');
});

test('an event Gladys refuses is tried again at the next reading, the others not repeated', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  const publish = w.gladys.publishSceneEvent.bind(w.gladys);
  let refuse = true;
  t.mock.method(w.gladys, 'publishSceneEvent', async (key, data) => {
    if (refuse && data.task_id === 3) {
      throw new Error('Gladys is restarting');
    }
    return publish(key, data);
  });
  w.server.task(3).date_due = at(18, 0, 1) / 1000;
  clock.time = at(18, 0, 2);
  await w.hub.poll();
  assert.deepEqual(keys(w), ['task_due:1']);
  refuse = false;
  clock.advance(60_000);
  await w.hub.poll();
  assert.deepEqual(keys(w).slice(1), ['task_due:3']);
});

test('two taps on the same button close the task once', async (t) => {
  const w = await world(t);
  const due = at(18, 0);
  const tap = () => w.fake.widgetAction('tasks_today', 'done_3', { id: 1, due }, { settings: {} });
  const [first, second] = await Promise.all([tap(), tap()]);
  assert.deepEqual([first.success, second.success].sort(), [false, true]);
  assert.match([first, second].find((ack) => !ack.success).error, /closed or changed meanwhile/);
  assert.equal(w.server.task(1).is_active, 0);
});
