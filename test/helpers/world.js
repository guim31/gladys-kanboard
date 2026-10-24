// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Kanboard on a fake
// network, a temporary /data, a manual clock and the Paris time zone, with
// the integration wired on top through registerHandlers. No timer runs unless
// `timers: true` (with node:test mock timers): the tests read Kanboard with
// `world.hub.poll()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { FakeKanboard, TOKEN, USER, createNetwork } from './fakeKanboard.js';

// The integration logs its lifecycle; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const URL_1 = 'http://192.0.2.20:8080';
export const TIME_ZONE = 'Europe/Paris';
// The fixtures were captured on 24/10/2026 at 14:31 UTC; the tests start at
// 14:35 UTC (16:35 in Paris): two tasks overdue, three due today at 18:00,
// 20:00 and 22:00 Paris.
export const START = Date.UTC(2026, 9, 24, 14, 35, 0);

export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const BASE_CONFIG = { url: URL_1, username: 'jsonrpc', api_token: TOKEN, language: 'en' };

/**
 * @param {object} [options]
 * @param {FakeKanboard} [options.server]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 */
export async function createWorld({
  clock = createClock(),
  server,
  config = BASE_CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-kanboard-')),
  timings = {},
  timers = false,
} = {}) {
  const kanboard = server ?? new FakeKanboard({ now: clock.now });
  const network = createNetwork({ [URL_1]: kanboard });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings,
    now: clock.now,
    timeZone: TIME_ZONE,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, server: kanboard, app, hub: app.hub, clock, dataDir };
}

export const overviewId = (gladys) => gladys.externalIds('overview', 'all');
export const projectId = (gladys, id) => gladys.externalIds('project', `project-${id}`);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export { FakeKanboard, TOKEN, USER };
