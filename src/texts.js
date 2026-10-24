// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene action
// errors and results. Four languages, the four of the Gladys interface;
// German says "du", Spanish "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './kanboard/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your Kanboard in the configuration.',
    fr: "Saisissez l'adresse de votre Kanboard dans la configuration.",
    de: 'Gib die Adresse deines Kanboard in der Konfiguration ein.',
    es: 'Introduzca la dirección de su Kanboard en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.20:8080',
    fr: 'Adresse incomprise, ex. http://192.168.1.20:8080',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.20:8080',
    es: 'Dirección no válida, p. ej. http://192.168.1.20:8080',
  },
  noToken: {
    en: 'Enter the Kanboard API token (Settings, API) or a password in the configuration.',
    fr: "Saisissez le jeton d'API Kanboard (Settings, API) ou un mot de passe dans la configuration.",
    de: 'Gib in der Konfiguration das Kanboard-API-Token (Settings, API) oder ein Passwort ein.',
    es: 'Introduzca el token de API de Kanboard (Settings, API) o una contraseña en la configuración.',
  },
};

// One short explanation per error kind (src/kanboard/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Kanboard does not answer',
    fr: 'Kanboard ne répond pas',
    de: 'Kanboard antwortet nicht',
    es: 'Kanboard no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: tick "Accept self-signed certificates"',
    fr: 'certificat refusé : cochez « Accepter les certificats auto-signés »',
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsignierte Zertifikate akzeptieren“',
    es: 'certificado rechazado: marque «Aceptar certificados autofirmados»',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'username, token or password refused',
    fr: "nom d'utilisateur, jeton ou mot de passe refusé",
    de: 'Benutzername, Token oder Passwort abgelehnt',
    es: 'nombre de usuario, token o contraseña rechazado',
  },
  [ERROR_KINDS.FORBIDDEN]: {
    en: 'access forbidden to this user: see the documentation',
    fr: 'accès interdit à cet utilisateur : voir la documentation',
    de: 'Zugriff für diesen Benutzer verboten: Sieh in der Dokumentation nach',
    es: 'acceso prohibido a este usuario: consulte la documentación',
  },
  [ERROR_KINDS.NOT_KANBOARD]: {
    en: 'no Kanboard API at this address',
    fr: 'aucune API Kanboard à cette adresse',
    de: 'keine Kanboard-API unter dieser Adresse',
    es: 'no hay ninguna API de Kanboard en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.RATE_LIMIT]: {
    en: 'too many requests, retrying later',
    fr: 'trop de requêtes, nouvel essai plus tard',
    de: 'zu viele Anfragen, neuer Versuch später',
    es: 'demasiadas solicitudes, se reintentará más tarde',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (version, tasks, projects) =>
      `Kanboard ${version} OK: ${tasks} open task(s) in ${projects} followed project(s).`,
    failed: (reason) => `Kanboard: ${reason}.`,
  },
  fr: {
    ok: (version, tasks, projects) =>
      `Kanboard ${version} OK : ${tasks} tâche(s) ouverte(s) dans ${projects} projet(s) suivi(s).`,
    failed: (reason) => `Kanboard : ${reason}.`,
  },
  de: {
    ok: (version, tasks, projects) =>
      `Kanboard ${version} OK: ${tasks} offene Aufgabe(n) in ${projects} verfolgten Projekt(en).`,
    failed: (reason) => `Kanboard: ${reason}.`,
  },
  es: {
    ok: (version, tasks, projects) =>
      `Kanboard ${version} OK: ${tasks} tarea(s) abierta(s) en ${projects} proyecto(s) seguido(s).`,
    failed: (reason) => `Kanboard: ${reason}.`,
  },
};

// Logged and shown when a project typed in the configuration does not exist.
export const UNKNOWN_PROJECTS = {
  en: (names) => `Unknown project(s) ignored: ${names}.`,
  fr: (names) => `Projet(s) inconnu(s) ignoré(s) : ${names}.`,
  de: (names) => `Unbekannte(s) Projekt(e) ignoriert: ${names}.`,
  es: (names) => `Proyecto(s) desconocido(s) ignorado(s): ${names}.`,
};

// Errors of the scene actions and the widget buttons (shown in Gladys).
export const ACTION_TEXT = {
  notConfigured: {
    en: 'Kanboard is not configured.',
    fr: "Kanboard n'est pas configuré.",
    de: 'Kanboard ist nicht konfiguriert.',
    es: 'Kanboard no está configurado.',
  },
  emptyTask: {
    en: 'Give the title or the number of the task.',
    fr: 'Indiquez le titre ou le numéro de la tâche.',
    de: 'Gib den Titel oder die Nummer der Aufgabe an.',
    es: 'Indique el título o el número de la tarea.',
  },
  taskNotFound: {
    en: 'No open task has this title or number in Kanboard.',
    fr: 'Aucune tâche ouverte ne porte ce titre ou ce numéro dans Kanboard.',
    de: 'Keine offene Aufgabe in Kanboard hat diesen Titel oder diese Nummer.',
    es: 'Ninguna tarea abierta tiene este título o número en Kanboard.',
  },
  taskAmbiguous: {
    en: 'Several open tasks have this title: give its number (#12) instead.',
    fr: 'Plusieurs tâches ouvertes portent ce titre : indiquez plutôt son numéro (#12).',
    de: 'Mehrere offene Aufgaben haben diesen Titel: Gib stattdessen ihre Nummer an (#12).',
    es: 'Varias tareas abiertas tienen este título: indique su número (#12).',
  },
  emptyTitle: {
    en: 'Give the title of the new task.',
    fr: 'Indiquez le titre de la nouvelle tâche.',
    de: 'Gib den Titel der neuen Aufgabe an.',
    es: 'Indique el título de la nueva tarea.',
  },
  projectNotFound: {
    en: 'No project has this name or number in Kanboard.',
    fr: 'Aucun projet ne porte ce nom ou ce numéro dans Kanboard.',
    de: 'Kein Projekt in Kanboard hat diesen Namen oder diese Nummer.',
    es: 'Ningún proyecto tiene este nombre o número en Kanboard.',
  },
  projectAmbiguous: {
    en: 'Several projects have this name: give its number instead.',
    fr: 'Plusieurs projets portent ce nom : indiquez plutôt son numéro.',
    de: 'Mehrere Projekte haben diesen Namen: Gib stattdessen ihre Nummer an.',
    es: 'Varios proyectos tienen este nombre: indique su número.',
  },
  noProject: {
    en: 'Kanboard has no project to add the task to.',
    fr: "Kanboard n'a aucun projet où ajouter la tâche.",
    de: 'Kanboard hat kein Projekt, in das die Aufgabe kommen kann.',
    es: 'Kanboard no tiene ningún proyecto donde añadir la tarea.',
  },
  badDue: {
    en: 'Due date not understood: e.g. 2026-10-25 18:00, tomorrow 9:00, +3.',
    fr: 'Échéance incomprise : ex. 2026-10-25 18:00, demain 9h00, +3.',
    de: 'Fälligkeit nicht verstanden: z. B. 2026-10-25 18:00, morgen 9:00, +3.',
    es: 'Vencimiento no válido: p. ej. 2026-10-25 18:00, mañana 9:00, +3.',
  },
  alreadyDone: {
    en: 'This task was closed or changed meanwhile: the list is refreshed.',
    fr: 'Cette tâche a été fermée ou modifiée entre-temps : la liste est mise à jour.',
    de: 'Diese Aufgabe wurde inzwischen geschlossen oder geändert: Die Liste wird aktualisiert.',
    es: 'Esta tarea se ha cerrado o modificado entretanto: la lista se actualiza.',
  },
};

// Toasts and scene results (≤ 200 characters).
export const DONE_TEXT = {
  en: { done: (title) => `"${title}" closed.`, created: (title) => `"${title}" added.` },
  fr: {
    done: (title) => `« ${title} » fermée.`,
    created: (title) => `« ${title} » ajoutée.`,
  },
  de: {
    done: (title) => `„${title}“ geschlossen.`,
    created: (title) => `„${title}“ hinzugefügt.`,
  },
  es: {
    done: (title) => `«${title}» cerrada.`,
    created: (title) => `«${title}» añadida.`,
  },
};

// The sentence of the "Read today's tasks" scene action, for a message or a
// voice announcement.
const join = (titles, and) =>
  titles.length < 2 ? titles.join('') : `${titles.slice(0, -1).join(', ')} ${and} ${titles.at(-1)}`;

export const TODAY_TEXT = {
  en: {
    none: 'Nothing to do today.',
    list: (count, titles) => `${count} task(s) to do today: ${join(titles, 'and')}.`,
    overdue: (count) => ` ${count} overdue.`,
  },
  fr: {
    none: "Rien à faire aujourd'hui.",
    list: (count, titles) => `${count} tâche(s) à faire aujourd'hui : ${join(titles, 'et')}.`,
    overdue: (count) => ` ${count} en retard.`,
  },
  de: {
    none: 'Heute gibt es nichts zu tun.',
    list: (count, titles) => `${count} Aufgabe(n) für heute: ${join(titles, 'und')}.`,
    overdue: (count) => ` ${count} überfällig.`,
  },
  es: {
    none: 'No hay nada que hacer hoy.',
    list: (count, titles) => `${count} tarea(s) para hoy: ${join(titles, 'y')}.`,
    overdue: (count) => ` ${count} atrasada(s).`,
  },
};

export const LANGUAGE_FALLBACK = 'en';

export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** A multi-language object from a function of the language. */
export const allLanguages = (render) =>
  Object.fromEntries(Object.keys(INIT_FAILED).map((language) => [language, render(language)]));
