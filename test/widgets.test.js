// -----------------------------------------------------------------------------
// The "today's tasks" widget: content within the core budget (validated by
// the SDK's validateWidgetContent), the overview and project views, the
// "close" buttons, and the degraded states.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { BASE_CONFIG, createClock, createWorld, overviewId, projectId } from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, settings = {}, language = 'en') {
  const ack = await w.fake.widgetGet('tasks_today', { settings, language, units: 'metric' });
  assert.equal(ack.success, true, ack.error);
  const { content: tree } = ack.data;
  assert.deepEqual(validateWidgetContent(tree), [], 'within the core vocabulary and budget');
  return tree;
}

const ofType = (data, type) => data.components.filter((component) => component.type === type);
const at = (h, m = 0) => Date.UTC(2026, 9, 24, h, m);

test('the overview: tiles, the tasks of the day with their project, four buttons', async (t) => {
  const w = await world(t);
  const data = await content(w);
  assert.ok(data.components.length <= 8);
  assert.deepEqual(
    ofType(data, 'value').map((tile) => tile.value),
    [5, 2],
  );
  assert.deepEqual(
    ofType(data, 'status')[0].items.map((row) => [row.label, row.value, row.color]),
    [
      ['Changer le filtre de la VMC', 'Overdue · Maison', 'danger'],
      ['Vider le bac à compost', 'Overdue · Maison', 'danger'],
      ['Acheter du pain', '18:00 · Courses', 'neutral'],
      ['Sortir les poubelles', '20:00 · Maison', 'neutral'],
      ['Lancer le lave-vaisselle', '22:00 · Maison', 'neutral'],
    ],
  );
  assert.deepEqual(
    ofType(data, 'button').map((button) => [button.action.key, button.action.params.id]),
    [
      ['done_1', 4],
      ['done_2', 6],
      ['done_3', 8],
      ['done_4', 1],
    ],
  );
  assert.deepEqual(await content(w, { device: overviewId(w.gladys).device }), data);
});

test('a project view shows only its tasks, in the language of the user; high priority stands out', async (t) => {
  const w = await world(t);
  const data = await content(w, { device: projectId(w.gladys, 2).device }, 'fr');
  assert.deepEqual(
    ofType(data, 'status')[0].items.map((row) => [row.label, row.value]),
    [['Acheter du pain', '18:00']],
  );
  assert.equal(ofType(data, 'value')[0].label, 'À faire');

  w.server.task(1).priority = 3; // the highest priority of the project
  await w.hub.poll();
  const home = await content(w, { device: projectId(w.gladys, 1).device });
  const bins = ofType(home, 'status')[0].items.find((row) => row.label === 'Sortir les poubelles');
  assert.equal(bins.color, 'warning');
});

test('nothing today: a sentence and the next task', async (t) => {
  const w = await world(t);
  w.server.task(8).is_active = 0;
  await w.hub.poll();
  const data = await content(w, { device: projectId(w.gladys, 2).device }, 'fr');
  assert.equal(ofType(data, 'text')[0].text, "Plus rien à faire aujourd'hui.");
  assert.deepEqual(
    ofType(data, 'status')[0].items.map((row) => [row.label, row.value]),
    [['Racheter du café', 'Prochaine · lun. 26 oct.']],
  );
});

test('a "close" button closes the task and answers a toast', async (t) => {
  const w = await world(t);
  const due = Date.UTC(2026, 9, 22, 8, 0);
  const ack = await w.fake.widgetAction('tasks_today', 'done_1', { id: 4, due }, { settings: {} });
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.message.fr, '« Changer le filtre de la VMC » fermée.');
  assert.equal(w.server.task(4).is_active, 0);
  const bad = await w.fake.widgetAction('tasks_today', 'done_9', { id: 4 }, { settings: {} });
  assert.equal(bad.success, false);
});

test('a button showing an old due date does not close a task moved meanwhile', async (t) => {
  const w = await world(t);
  w.server.task(8).date_due += 86_400; // moved to tomorrow in Kanboard
  const ack = await w.fake.widgetAction(
    'tasks_today',
    'done_3',
    { id: 8, due: at(16) },
    { settings: {} },
  );
  assert.equal(ack.success, false);
  assert.match(ack.error, /closed or changed meanwhile/);
  assert.equal(w.server.task(8).is_active, 1);
});

test('degraded states: not configured, unknown project, Kanboard down', async (t) => {
  const empty = await world(t, { config: { url: '', api_token: '' } });
  assert.match((await content(empty)).components[0].text, /Enter the address/);

  const w = await world(t, { config: { ...BASE_CONFIG, projects: 'Maison' } });
  const gone = await content(w, { device: projectId(w.gladys, 2).device });
  assert.match(gone.components[0].text, /no longer followed/);

  w.server.online = false;
  await w.hub.poll();
  const stale = await content(w);
  assert.equal(stale.components[0].variant, 'caption');
  assert.deepEqual(ofType(stale, 'button'), [], 'no button while Kanboard is down');

  const clock = createClock();
  const down = await createWorld({ clock, connect: false });
  t.after(() => down.app.stop());
  down.server.online = false;
  await down.gladys.connect();
  await down.app.ready;
  assert.match((await content(down)).components[0].text, /does not answer/);
});
