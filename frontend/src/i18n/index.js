import en from "./locales/en.js";
import th from "./locales/th.js";

/**
 * Tiny, dependency-free i18n core.
 *
 * - `en` is the source of truth: a missing key in another locale falls back to
 *   English, and a key missing everywhere renders as the key itself (so it is
 *   obvious in the UI instead of blank).
 * - The choice is persisted in a cookie so the server can render the right
 *   language on the first paint (no hydration mismatch).
 */

export const SUPPORTED_LOCALES = ["en", "th"];
export const DEFAULT_LOCALE = "en";
export const LOCALE_COOKIE = "vs_locale";

/** Label + flag for the language switcher. */
export const LOCALE_META = {
  en: { label: "English", short: "EN", flag: "🇬🇧" },
  th: { label: "ไทย", short: "TH", flag: "🇹🇭" },
};

export const dictionaries = { en, th };

/** Normalise any input ("th-TH", "TH", "en_US") to a supported locale. */
export function resolveLocale(value) {
  if (!value || typeof value !== "string") return DEFAULT_LOCALE;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LOCALES.includes(base) ? base : DEFAULT_LOCALE;
}

/** Look up a dotted key ("nav.pricing") in a dictionary. */
export function lookup(dictionary, key) {
  if (!dictionary || typeof key !== "string") return undefined;
  return key.split(".").reduce((current, part) => {
    if (current && typeof current === "object") return current[part];
    return undefined;
  }, dictionary);
}

/**
 * Replace `{name}` placeholders.
 *
 * Unknown placeholders are left untouched so a typo is visible instead of
 * silently producing "undefined".
 */
export function interpolate(template, params) {
  if (typeof template !== "string") return template;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/**
 * Translate a key for a locale.
 *
 * @param {string} locale  active locale
 * @param {string} key     dotted key, e.g. "vulnerabilities.title"
 * @param {object} [params] values for `{placeholders}`
 * @param {object} [dicts] dictionaries to use (tests inject fixtures)
 */
export function getMessage(locale, key, params, dicts = dictionaries) {
  const active = resolveLocale(locale);
  const activeDict = dicts[active] ?? dicts[DEFAULT_LOCALE];

  const message =
    lookup(activeDict, key) ??
    (active === DEFAULT_LOCALE ? undefined : lookup(dicts[DEFAULT_LOCALE], key));

  if (message === undefined) return key;
  return interpolate(message, params);
}

/** Build a `t()` bound to one locale (used by the provider and by tests). */
export function createTranslator(locale, dicts = dictionaries) {
  const active = resolveLocale(locale);
  const t = (key, params) => getMessage(active, key, params, dicts);
  t.locale = active;
  return t;
}

/** BCP-47 tags used by `Intl` (number/date formatting). */
export const LOCALE_TAGS = { en: "en-US", th: "th-TH" };

/** Map a supported locale to an `Intl` tag ("th" → "th-TH"). */
export function intlTag(locale) {
  return LOCALE_TAGS[resolveLocale(locale)] ?? LOCALE_TAGS[DEFAULT_LOCALE];
}

/**
 * Read one value out of a cookie string.
 *
 * Works on `document.cookie` (browser) and on a `Cookie` header (server), so
 * both sides parse the same way. Returns `undefined` when the cookie is absent.
 */
export function readCookieValue(cookieString, name) {
  if (!cookieString || typeof cookieString !== "string") return undefined;
  for (const part of cookieString.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

/** Build the `vs_locale` cookie value (pure — shared by the client and tests). */
export function buildLocaleCookie(locale, { maxAge = 31536000 } = {}) {
  return `${LOCALE_COOKIE}=${resolveLocale(locale)}; path=/; max-age=${maxAge}; samesite=lax`;
}

/** Persist the locale in the browser; returns the value even during SSR. */
export function writeLocaleCookie(locale, options) {
  const value = buildLocaleCookie(locale, options);
  if (typeof document !== "undefined") document.cookie = value;
  return value;
}

/**
 * Resolve the active locale.
 *
 * Prefers an explicit cookie string (server: the `Cookie` header) and falls back
 * to `document.cookie` in the browser, then to English. This is what lets
 * non-React code (services, toasts) read the same locale the UI is rendering in.
 */
export function getLocaleFromCookie(cookieString) {
  const raw =
    cookieString ?? (typeof document !== "undefined" ? document.cookie : "");
  return resolveLocale(readCookieValue(raw, LOCALE_COOKIE));
}

/**
 * Translate from outside React (services, utils, `message.error(...)` toast text).
 *
 * `translate("common.save")` follows the cookie; pass `locale` when the caller
 * already knows it. React components should use `useTranslation()` instead, so a
 * language switch re-renders them.
 */
export function translate(key, params, locale) {
  return createTranslator(locale ?? getLocaleFromCookie())(key, params);
}

/**
 * `Intl.NumberFormat` that never throws: non-numeric input is returned as-is.
 * Use it instead of `value.toLocaleString()` so the digits follow the active
 * locale rather than the visitor's browser settings.
 */
export function formatNumber(value, locale = DEFAULT_LOCALE, options) {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) {
    return value === undefined || value === null ? "" : String(value);
  }
  try {
    return new Intl.NumberFormat(intlTag(locale), options).format(number);
  } catch {
    return String(number);
  }
}

/** Default shape for `formatDate`: "1 Sep 2026". */
export const DEFAULT_DATE_OPTIONS = { year: "numeric", month: "short", day: "numeric" };

/**
 * `Intl.DateTimeFormat` that never throws.
 *
 * Caller `options` are merged over the default short shape ("1 Sep 2026"), so a
 * caller can override just `timeZone` or `month`. Set a default key to
 * `undefined` to drop it, e.g. `{ year: "numeric", month: "long", day: undefined }`
 * → "September 2026".
 *
 * `calendar: "gregory"` is pinned so a Thai locale always shows the Christian
 * year (CC) like the rest of the product/API, instead of the Buddhist era that
 * some ICU/CLDR releases pick for `th-TH` by default.
 */
export function formatDate(value, locale = DEFAULT_LOCALE, options) {
  // Guard before `new Date(...)`: `new Date(null)` is the epoch, not "no value".
  if (value === undefined || value === null || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const shape = { calendar: "gregory", ...DEFAULT_DATE_OPTIONS, ...options };
  try {
    return new Intl.DateTimeFormat(intlTag(locale), shape).format(date);
  } catch {
    try {
      return new Intl.DateTimeFormat(intlTag(locale), options ?? DEFAULT_DATE_OPTIONS).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  }
}

