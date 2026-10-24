// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `tasks_today`.
//
// The use case: the kitchen tablet shows what is left to do today, and a tap
// closes a task without opening Kanboard. For every followed project, or
// for one (a project device chosen in the widget settings).
//
// Budget (8 components, 2 texts): two tiles (to do today, overdue), one
// status list (the tasks of the day, overdue first, with their time and
// project) and a "close" button for each of the four most urgent ones.
// Nothing left: a sentence and the next task. The figures are values, not
// bound to device features, so the widget works before any device is added.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { KanboardHub, WIDGET_KEY } from './hub.js';
import { pick } from './texts.js';

// Action keys of the buttons: permanent once published (unique, the core
// drops a button whose key is taken).
export const DONE_ACTIONS = ['done_1', 'done_2', 'done_3', 'done_4'];
const MAX_ROWS = 10;

export const TEXT = {
  configure: {
    en: 'Enter the address of your Kanboard and an API token in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre Kanboard et un jeton d'API dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines Kanboard und ein API-Token in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su Kanboard y un token de API en la configuración de la integración.',
  },
  unknown: {
    en: 'This project is no longer followed: choose another device in the widget settings.',
    fr: "Ce projet n'est plus suivi : choisissez un autre appareil dans les réglages du widget.",
    de: 'Dieses Projekt wird nicht mehr verfolgt: Wähle ein anderes Gerät in den Widget-Einstellungen.',
    es: 'Este proyecto ya no se sigue: elija otro dispositivo en la configuración del widget.',
  },
  noAnswer: {
    en: 'Kanboard does not answer: see the Configuration screen of the integration.',
    fr: "Kanboard ne répond pas : voir l'écran Configuration de l'intégration.",
    de: 'Kanboard antwortet nicht: Sieh dir die Konfiguration der Integration an.',
    es: 'Kanboard no responde: consulte la pantalla de configuración de la integración.',
  },
  stale: {
    en: 'Kanboard does not answer: last known tasks.',
    fr: 'Kanboard ne répond pas : dernières tâches connues.',
    de: 'Kanboard antwortet nicht: zuletzt bekannte Aufgaben.',
    es: 'Kanboard no responde: últimas tareas conocidas.',
  },
  nothing: {
    en: 'Nothing left to do today.',
    fr: "Plus rien à faire aujourd'hui.",
    de: 'Heute gibt es nichts mehr zu tun.',
    es: 'No queda nada por hacer hoy.',
  },
  toDo: { en: 'To do today', fr: 'À faire', de: 'Heute zu tun', es: 'Para hoy' },
  overdue: { en: 'Overdue', fr: 'En retard', de: 'Überfällig', es: 'Atrasadas' },
  next: { en: 'Next', fr: 'Prochaine', de: 'Nächste', es: 'Próxima' },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

function format(hub, ms, language, options) {
  return new Intl.DateTimeFormat(LOCALES[language] ?? 'en-GB', {
    timeZone: hub.timeZone,
    ...options,
  }).format(new Date(ms));
}

/**
 * Kanboard priorities go from a start to an end set per project (0 to 3 by
 * default): the highest one, above the default, is shown as high.
 */
function isHigh(hub, task) {
  const project = hub.projects.find((item) => item.id === task.projectId);
  return Boolean(
    project &&
    project.priorityEnd > project.priorityDefault &&
    task.priority >= project.priorityEnd,
  );
}

/** The status row of a task of the day: overdue, or its time; and its project. */
function taskRow(hub, task, { now, showProject, language }) {
  const late = task.dueAt < now;
  const high = isHigh(hub, task);
  const when = late
    ? t(TEXT.overdue, language)
    : format(hub, task.dueAt, language, { hour: '2-digit', minute: '2-digit' });
  const where = showProject ? hub.projectTitle(task.projectId) : null;
  return {
    label: fit(task.title, 40),
    icon: late ? 'alert-circle' : high ? 'alert-triangle' : 'clock',
    value: fit(where ? `${when} · ${where}` : when, 40),
    color: late ? WIDGET_COLORS.DANGER : high ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
  };
}

async function get(hub, { settings, language = 'en' }) {
  if (!hub.client) {
    return message(TEXT.configure, language);
  }
  if (hub.error && hub.readAt === 0) {
    return message(TEXT.noAnswer, language);
  }
  const { project, unknown } = hub.view(settings?.device || null);
  if (unknown) {
    return message(TEXT.unknown, language);
  }
  const now = hub.now();
  const summary = hub.summary(project ? project.id : null);
  const components = [];
  if (hub.error) {
    components.push({ type: 'text', variant: 'caption', text: t(TEXT.stale, language) });
  }
  components.push(
    { type: 'value', value: summary.toDoToday, label: t(TEXT.toDo, language), icon: 'list' },
    {
      type: 'value',
      value: summary.overdue,
      label: t(TEXT.overdue, language),
      icon: 'alert-circle',
      color: summary.overdue > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
    },
  );
  if (summary.today.length === 0) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.nothing, language) });
    if (summary.next) {
      const day = format(hub, summary.next.dueAt, language, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
      components.push({
        type: 'status',
        items: [
          {
            label: fit(summary.next.title, 40),
            icon: 'calendar',
            value: fit(`${t(TEXT.next, language)} · ${day}`, 40),
            color: WIDGET_COLORS.NEUTRAL,
          },
        ],
      });
    }
    return { ttl_seconds: 300, components };
  }
  components.push({
    type: 'status',
    items: summary.today
      .slice(0, MAX_ROWS)
      .map((task) => taskRow(hub, task, { now, showProject: !project, language })),
  });
  if (!hub.error) {
    // The due time travels with the button: a tap on a widget showing an old
    // due date must not close a task that was moved meanwhile.
    summary.today.slice(0, DONE_ACTIONS.length).forEach((task, index) => {
      components.push({
        type: 'button',
        label: fit(task.title, 24),
        icon: 'check',
        style: 'secondary',
        action: { key: DONE_ACTIONS[index], params: { id: task.id, due: task.dueAt } },
      });
    });
  }
  return { ttl_seconds: 300, components };
}

async function action(hub, { actionKey, params = {} }) {
  if (!DONE_ACTIONS.includes(actionKey) || !Number.isInteger(params.id)) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  const { task } = await hub.complete(params.id, {
    expectedDue: Number.isFinite(params.due) ? params.due : undefined,
  });
  return { message: KanboardHub.doneMessage(task.title) };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
