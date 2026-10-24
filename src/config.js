// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One Kanboard instance (its address, and the application API token or the
// credentials of one of its users), read on a timer of the container.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['60', '120', '300', '600'];

export const DEFAULT_CONFIG = {
  url: '',
  username: 'jsonrpc',
  api_token: '',
  projects: '',
  allow_self_signed: false,
  poll_interval: '300',
  language: 'fr',
};

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10:8080`), or the URL copied from the browser
 * (`https://kanboard.example.org/board/2`). HTTP by default. A path prefix
 * is kept (Kanboard in a sub-folder `/kanboard`), `jsonrpc.php`, `index.php`
 * and the known screens of the web app are dropped, the query string too
 * (`?controller=BoardViewController&…` without URL rewriting).
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/prefix]`, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  const path = url.pathname
    .replace(/\/(jsonrpc|index)\.php(\/.*)?$/, '')
    .replace(
      /\/(board|project|projects|task|dashboard|list|calendar|search|login|user|users|settings|analytics|gantt)(\/.*)?$/,
      '',
    )
    .replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

/**
 * The projects to follow, as typed: names or numbers separated by commas or
 * semicolons. Empty: every project.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function parseProjectList(raw) {
  if (typeof raw !== 'string') {
    return [];
  }
  return [
    ...new Set(
      raw
        .split(/[,;\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

const bool = (value) => value === true || value === 'true';

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const typed = typeof source.url === 'string' ? source.url.trim() : '';
  const poll = String(source.poll_interval ?? '');
  return {
    url: parseServerUrl(typed),
    urlTyped: typed !== '',
    username:
      typeof source.username === 'string' && source.username.trim() !== ''
        ? source.username.trim()
        : DEFAULT_CONFIG.username,
    // Tokens are kept as typed, minus the blanks a copy and paste adds around them.
    token: typeof source.api_token === 'string' ? source.api_token.trim() : '',
    projects: parseProjectList(source.projects),
    allowSelfSigned: bool(source.allow_self_signed),
    pollIntervalMs:
      Number(POLL_INTERVALS.includes(poll) ? poll : DEFAULT_CONFIG.poll_interval) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
