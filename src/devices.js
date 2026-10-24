// -----------------------------------------------------------------------------
// Gladys devices: one "Kanboard" device for every followed project together,
// and one per followed project.
//
// Identity: `overview` / `all` and `project` / `project-<id>`, the id Kanboard
// gives the project (stable, never its title): renaming a project keeps its
// device.
//
// Features (category/type couples of the core table, test/gladys-rules.test.js),
// definitions in src/kanboard/model.js:
//   - open, to do today, overdue: counter-sensor/integer;
//   - next task: text/text, its title ("None" when nothing is planned: a text
//     state is never empty).
//
// The devices are published with should_poll: false: the integration reads
// Kanboard on its own timer (src/hub.js), every 1 to 10 minutes.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

export const OVERVIEW_TYPE = 'overview';
export const PROJECT_TYPE = 'project';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  OPEN: 'open',
  TO_DO_TODAY: 'to_do_today',
  OVERDUE: 'overdue',
  NEXT_TASK: 'next_task',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.OPEN]: 'Open tasks',
    [FEATURE_KEYS.TO_DO_TODAY]: 'Tasks to do today',
    [FEATURE_KEYS.OVERDUE]: 'Overdue tasks',
    [FEATURE_KEYS.NEXT_TASK]: 'Next task',
  },
  fr: {
    [FEATURE_KEYS.OPEN]: 'Tâches ouvertes',
    [FEATURE_KEYS.TO_DO_TODAY]: "Tâches à faire aujourd'hui",
    [FEATURE_KEYS.OVERDUE]: 'Tâches en retard',
    [FEATURE_KEYS.NEXT_TASK]: 'Prochaine tâche',
  },
  de: {
    [FEATURE_KEYS.OPEN]: 'Offene Aufgaben',
    [FEATURE_KEYS.TO_DO_TODAY]: 'Aufgaben für heute',
    [FEATURE_KEYS.OVERDUE]: 'Überfällige Aufgaben',
    [FEATURE_KEYS.NEXT_TASK]: 'Nächste Aufgabe',
  },
  es: {
    [FEATURE_KEYS.OPEN]: 'Tareas abiertas',
    [FEATURE_KEYS.TO_DO_TODAY]: 'Tareas para hoy',
    [FEATURE_KEYS.OVERDUE]: 'Tareas atrasadas',
    [FEATURE_KEYS.NEXT_TASK]: 'Próxima tarea',
  },
};

// Published on "next task" when no open task has a due date ahead.
export const NO_TASK = { en: 'None', fr: 'Aucune', de: 'Keine', es: 'Ninguna' };

// Display bounds (the core never applies them on write).
const COUNTER_MAX = 10000;
const TEXT_MAX_LENGTH = 100;

const counter = (key, value) => ({
  key,
  definition: {
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    min: 0,
    max: COUNTER_MAX,
  },
  value,
});

// Order = display order in Gladys.
const FEATURES = [
  counter(FEATURE_KEYS.OPEN, (summary) => summary.open),
  counter(FEATURE_KEYS.TO_DO_TODAY, (summary) => summary.toDoToday),
  counter(FEATURE_KEYS.OVERDUE, (summary) => summary.overdue),
  {
    key: FEATURE_KEYS.NEXT_TASK,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
      read_only: true,
      has_feedback: false,
      keep_history: false,
      // NOT NULL in the core, even for a text (422 on "Add to Gladys" otherwise).
      min: 0,
      max: 0,
    },
    value: (summary, language) =>
      (summary.next ? summary.next.title : (NO_TASK[language] ?? NO_TASK.en)).slice(
        0,
        TEXT_MAX_LENGTH,
      ),
  },
];

export const overviewIds = (gladys) => gladys.externalIds(OVERVIEW_TYPE, 'all');

export const projectIds = (gladys, projectId) =>
  gladys.externalIds(PROJECT_TYPE, `project-${projectId}`);

function build(ids, name, language) {
  const names = NAMES[language] ?? NAMES.en;
  return {
    name,
    external_id: ids.device,
    should_poll: false,
    features: FEATURES.map(({ key, definition }) => ({
      ...definition,
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

export const overviewName = () => 'Kanboard';
export const projectName = (project) => `Kanboard ${project.title}`.slice(0, 60);

export const buildOverview = (gladys, language = 'en') =>
  build(overviewIds(gladys), overviewName(), language);

export const buildProject = (gladys, project, language = 'en') =>
  build(projectIds(gladys, project.id), projectName(project), language);

/**
 * The states of every feature of a device for a summary (src/kanboard/model.js),
 * in the `publishStates` format: `state` for a number, `text` for a text.
 * @returns {Array<{ device_feature_external_id: string, state?: number, text?: string }>}
 */
export function featureStates(ids, summary, language) {
  return FEATURES.map(({ key, value }) =>
    key === FEATURE_KEYS.NEXT_TASK
      ? { device_feature_external_id: ids.feature(key), text: value(summary, language) }
      : { device_feature_external_id: ids.feature(key), state: value(summary) },
  );
}
