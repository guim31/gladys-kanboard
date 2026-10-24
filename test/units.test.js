// -----------------------------------------------------------------------------
// Unit tests of the pure parts: the address and the project list typed by the
// user, the parsing of real Kanboard answers, the counters, the search by
// number or title, the due date typed in a scene action, the JSON-RPC client.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeConfig, parseProjectList, parseServerUrl } from '../src/config.js';
import { KanboardClient, zonedWall } from '../src/kanboard/client.js';
import {
  findByIdOrTitle,
  localDay,
  parseDue,
  parseProjects,
  parseTasks,
  summarize,
} from '../src/kanboard/model.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/kanboard/${name}.json`, import.meta.url), 'utf8'));
const realTasks = () => [...fixture('real-tasks-open-1'), ...fixture('real-tasks-open-2')];

test('the address: bare host, copied browser URL, jsonrpc.php, sub-folder', () => {
  assert.equal(parseServerUrl('192.0.2.10:8080'), 'http://192.0.2.10:8080');
  assert.equal(
    parseServerUrl(' https://kanboard.example.org/board/2 '),
    'https://kanboard.example.org',
  );
  assert.equal(parseServerUrl('http://192.0.2.10/jsonrpc.php'), 'http://192.0.2.10');
  assert.equal(
    parseServerUrl('https://example.org/kanboard/?controller=BoardViewController&project_id=2'),
    'https://example.org/kanboard',
  );
  assert.equal(
    parseServerUrl('https://example.org/kanboard/index.php'),
    'https://example.org/kanboard',
  );
  assert.equal(parseServerUrl('https://user:pass@example.org'), null, 'no credentials');
  assert.equal(parseServerUrl('ftp://example.org'), null);
  assert.equal(parseServerUrl(''), null);
});

test('the followed projects and the defaults', () => {
  assert.deepEqual(parseProjectList(' Maison, 3 ;Maison,, '), ['Maison', '3']);
  const config = normalizeConfig({ url: '192.0.2.10', api_token: ' abc ', poll_interval: '7' });
  assert.equal(config.token, 'abc');
  assert.equal(config.username, 'jsonrpc');
  assert.equal(config.pollIntervalMs, 300_000);
  assert.equal(config.language, 'fr');
  assert.deepEqual(config.projects, []);
  assert.equal(normalizeConfig({ username: ' alice ' }).username, 'alice');
});

test('real projects: archived ones left out, by name, priority bounds', () => {
  const projects = parseProjects(fixture('real-projects'));
  assert.deepEqual(
    projects.map((project) => [
      project.id,
      project.title,
      project.priorityDefault,
      project.priorityEnd,
    ]),
    [
      [2, 'Courses', 0, 3],
      [1, 'Maison', 0, 3],
    ],
  );
  assert.equal(parseProjects(fixture('real-my-projects')).length, 1);
});

test('real tasks: 0 is no date, seconds to milliseconds, undated last', () => {
  const tasks = parseTasks(realTasks());
  assert.equal(tasks.length, 8);
  assert.equal(tasks.find((task) => task.id === 5).dueAt, null);
  assert.equal(tasks.at(-1).id, 5, 'undated last');
  assert.equal(tasks.find((task) => task.id === 1).dueAt, Date.UTC(2026, 9, 24, 18, 0));
  assert.equal(tasks.find((task) => task.id === 4).priority, 3);
  assert.deepEqual(parseTasks([{ id: 1, is_active: 0 }, null, { title: 'no id' }]), []);
});

test('the counters of a day, overdue included in "to do today"', () => {
  const tasks = parseTasks(realTasks());
  const now = Date.UTC(2026, 9, 24, 14, 35);
  const day = localDay(now, 'Europe/Paris');
  assert.equal(new Date(day.start).toISOString(), '2026-10-23T22:00:00.000Z');
  assert.equal(new Date(day.end).toISOString(), '2026-10-24T22:00:00.000Z');
  const all = summarize(tasks, { now, day });
  assert.deepEqual([all.open, all.toDoToday, all.overdue, all.next.id], [8, 5, 2, 8]);
  const shop = summarize(tasks, { now, day, projectId: 2 });
  assert.deepEqual([shop.open, shop.toDoToday, shop.overdue], [2, 1, 0]);
});

test('find by number or exact title', () => {
  const items = [
    { id: 3, title: 'Café' },
    { id: 12, title: 'Sortir les  poubelles' },
    { id: 14, title: 'cafe' },
    { id: 20, title: '12' },
  ];
  assert.equal(findByIdOrTitle(items, '#12').item.id, 12);
  assert.equal(findByIdOrTitle(items, 12).item.id, 12);
  assert.equal(findByIdOrTitle(items, 'sortir LES poubelles').item.id, 12);
  assert.equal(findByIdOrTitle(items, 'CAFÉ').reason, 'ambiguous');
  assert.equal(findByIdOrTitle(items, '#99').reason, 'not_found');
  assert.equal(findByIdOrTitle(items, '').reason, 'empty');
});

test('the due date typed in a scene action, in the time zone of Gladys', () => {
  const now = Date.UTC(2026, 9, 24, 14, 35); // Saturday 24/10, 16:35 in Paris
  const due = (text) => {
    const ms = parseDue(text, { now, timeZone: 'Europe/Paris' });
    return ms === null || ms === undefined ? ms : new Date(ms).toISOString();
  };
  assert.equal(due(''), null);
  assert.equal(due('  '), null);
  assert.equal(due('2026-10-24 19:15'), '2026-10-24T17:15:00.000Z', 'summer time');
  assert.equal(due('2026-10-25 09:30'), '2026-10-25T08:30:00.000Z', 'winter time, the next day');
  assert.equal(due('2026-10-25T09:30'), '2026-10-25T08:30:00.000Z');
  assert.equal(due('25/10/2026'), '2026-10-25T17:00:00.000Z', '18:00 without a time');
  assert.equal(due('today'), '2026-10-24T16:00:00.000Z');
  assert.equal(due('Aujourd’hui 20h'), '2026-10-24T18:00:00.000Z');
  assert.equal(due('demain 9h30'), '2026-10-25T08:30:00.000Z');
  assert.equal(due('Morgen 7:05'), '2026-10-25T06:05:00.000Z');
  assert.equal(due('mañana'), '2026-10-25T17:00:00.000Z');
  assert.equal(due('+3'), '2026-10-27T17:00:00.000Z');
  assert.equal(due('8:00'), '2026-10-24T06:00:00.000Z', 'a time alone: today');
  assert.equal(due('2026-02-30'), undefined);
  assert.equal(due('25:00'), undefined);
  assert.equal(due('next week'), undefined);
  assert.equal(due('18'), undefined);
});

test('the wall time sent to Kanboard', () => {
  assert.equal(zonedWall(Date.UTC(2026, 9, 25, 8, 30), 'Europe/Paris'), '2026-10-25 09:30');
  assert.equal(zonedWall(Date.UTC(2026, 9, 25, 8, 30), 'UTC'), '2026-10-25 08:30');
});

test('the client: Basic credentials, JSON-RPC errors, batches', async () => {
  const sent = [];
  const answers = [];
  const client = new KanboardClient({
    url: 'http://192.0.2.10',
    username: 'jsonrpc',
    token: 's3cret',
    request: async (url, options) => {
      sent.push({ url, ...options });
      return answers.shift();
    },
  });
  answers.push({ status: 200, body: '{"jsonrpc":"2.0","result":"v1.2.56","id":1}' });
  assert.equal(await client.version(), 'v1.2.56');
  assert.equal(sent[0].url, 'http://192.0.2.10/jsonrpc.php');
  assert.equal(
    sent[0].headers.authorization,
    `Basic ${Buffer.from('jsonrpc:s3cret').toString('base64')}`,
  );
  assert.equal(sent[0].json.method, 'getVersion');

  answers.push({
    status: 200,
    body: '{"jsonrpc":"2.0","error":{"code":-32602,"message":"Invalid params"},"id":2}',
  });
  await assert.rejects(client.task(1), { kind: 'http', code: -32602 });

  answers.push({ status: 200, body: '{"jsonrpc":"2.0","result":0,"id":3}' });
  await assert.rejects(client.createTask(42, 'x'), { code: 'refused' });

  answers.push({ status: 200, body: '[]' });
  await assert.rejects(client.openTasks([1]), { kind: 'not_kanboard' });
  assert.deepEqual(await client.openTasks([]), [], 'no request for no project');

  answers.push({ status: 200, body: '{"jsonrpc":"2.0","result":false,"id":5}' });
  await assert.rejects(client.close(1), { code: 'refused' });

  answers.push({ status: 302, body: '' });
  await assert.rejects(client.version(), { kind: 'redirect' });
});
