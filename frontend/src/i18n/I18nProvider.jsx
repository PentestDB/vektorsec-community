"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  createTranslator,
  DEFAULT_LOCALE,
  dictionaries,
  formatDate,
  formatNumber,
  resolveLocale,
  SUPPORTED_LOCALES,
  writeLocaleCookie,
} from "./index";

/**
 * Locale provider.
 *
 * The server reads the `vs_locale` cookie and passes it as `initialLocale`, so
 * the first paint is already in the right language. Switching updates the
 * cookie (server components and the next request see it), the context and
 * `<html lang>`.
 */
const I18nContext = createContext(null);

export function I18nProvider({ initialLocale = DEFAULT_LOCALE, children }) {
  const [locale, setLocaleState] = useState(() => resolveLocale(initialLocale));

  const setLocale = useCallback((next) => {
    const resolved = resolveLocale(next);
    setLocaleState(resolved);
    // Shared with the server: the cookie is what makes the next request (and the
    // first paint after a reload) already render in the chosen language.
    writeLocaleCookie(resolved);
  }, []);

  // Keep <html lang> in sync (accessibility, screen readers, hyphenation).
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const value = useMemo(() => {
    const translator = createTranslator(locale, dictionaries);
    return {
      locale,
      setLocale,
      locales: SUPPORTED_LOCALES,
      t: translator,
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Access the translator: `const { t, locale, setLocale } = useTranslation();`
 *
 * Falls back to a default-locale translator when used outside the provider
 * (e.g. in an isolated component test), so a missing provider can never crash a
 * page.
 */
export function useTranslation() {
  const context = useContext(I18nContext);
  if (context) return context;

  const fallback = createTranslator(DEFAULT_LOCALE, dictionaries);
  return { locale: DEFAULT_LOCALE, setLocale: () => {}, locales: SUPPORTED_LOCALES, t: fallback };
}

/**
 * Locale-aware number/date formatting bound to the active locale:
 *
 *   const { formatNumber, formatDate } = useFormatters();
 *   formatNumber(12500)                          // "12,500"
 *   formatDate(finding.createdAt)                // "1 Sep 2026"
 *
 * Use this instead of `value.toLocaleString()` / `toLocaleDateString()` so the
 * output follows the app language, not the browser's own settings.
 */
export function useFormatters() {
  const { locale } = useTranslation();
  return useMemo(
    () => ({
      locale,
      formatNumber: (value, options) => formatNumber(value, locale, options),
      formatDate: (value, options) => formatDate(value, locale, options),
      formatDateTime: (value, options) =>
        formatDate(value, locale, {
          dateStyle: "medium",
          timeStyle: "short",
          ...options,
        }),
    }),
    [locale],
  );
}

export default I18nProvider;
