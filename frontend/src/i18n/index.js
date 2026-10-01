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
