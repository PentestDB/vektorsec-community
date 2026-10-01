"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  createTranslator,
  DEFAULT_LOCALE,
  dictionaries,
  LOCALE_COOKIE,
  resolveLocale,
  SUPPORTED_LOCALES,
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

function writeLocaleCookie(locale) {
  if (typeof document === "undefined") return;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

export function I18nProvider({ initialLocale = DEFAULT_LOCALE, children }) {
  const [locale, setLocaleState] = useState(() => resolveLocale(initialLocale));

  const setLocale = useCallback((next) => {
    const resolved = resolveLocale(next);
    setLocaleState(resolved);
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

export default I18nProvider;
