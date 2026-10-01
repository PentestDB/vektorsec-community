import assert from "node:assert/strict";
import { test } from "node:test";

import en from "../src/i18n/locales/en.js";
import th from "../src/i18n/locales/th.js";
import { getMagnitudeModelIssue } from "../src/utils/magnitudeModels.js";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_META,
  SUPPORTED_LOCALES,
  buildLocaleCookie,
  createTranslator,
  formatDate,
  formatNumber,
  getLocaleFromCookie,
  getMessage,
  interpolate,
  intlTag,
  lookup,
  readCookieValue,
  resolveLocale,
  translate,
} from "../src/i18n/index.js";

/** Flatten a nested dictionary into "a.b.c" -> value pairs. */
function flatten(dict, prefix = "") {
  const out = {};
  for (const [key, value] of Object.entries(dict)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") {
      Object.assign(out, flatten(value, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

const enFlat = flatten(en);
const thFlat = flatten(th);

test("both locales expose exactly the same keys", () => {
  const enKeys = Object.keys(enFlat).sort();
  const thKeys = Object.keys(thFlat).sort();

  assert.deepEqual(
    thKeys.filter((key) => !enFlat[key]),
    [],
    "Thai dictionary has keys missing from English",
  );
  assert.deepEqual(
    enKeys.filter((key) => !thFlat[key]),
    [],
    "English dictionary has keys missing from Thai",
  );
});

test("no translation is empty or left as a placeholder", () => {
  for (const [locale, dict] of [["en", enFlat], ["th", thFlat]]) {
    for (const [key, value] of Object.entries(dict)) {
      assert.equal(typeof value, "string", `${locale}.${key} must be a string`);
      assert.ok(value.trim().length > 0, `${locale}.${key} is empty`);
      assert.doesNotMatch(value, /TODO|FIXME|XXX/, `${locale}.${key} looks unfinished`);
    }
  }
});

test("Thai translations are actually translated (not copied English)", () => {
  // A handful of keys that must differ — catches "forgot to translate" merges.
  for (const key of ["nav.home", "login.signIn", "common.save", "vulnerabilities.title"]) {
    assert.notEqual(thFlat[key], enFlat[key], `${key} is identical in both locales`);
  }
});

test("every locale has display metadata", () => {
  for (const locale of SUPPORTED_LOCALES) {
    assert.ok(LOCALE_META[locale], `missing LOCALE_META.${locale}`);
    assert.ok(LOCALE_META[locale].label && LOCALE_META[locale].short);
  }
  assert.equal(LOCALE_COOKIE, "vs_locale");
});

test("resolveLocale normalises browser locales and rejects junk", () => {
  assert.equal(resolveLocale("th-TH"), "th");
  assert.equal(resolveLocale("TH"), "th");
  assert.equal(resolveLocale("en_US"), "en");
  assert.equal(resolveLocale("de-DE"), DEFAULT_LOCALE);
  assert.equal(resolveLocale(""), DEFAULT_LOCALE);
  assert.equal(resolveLocale(undefined), DEFAULT_LOCALE);
  assert.equal(resolveLocale({}), DEFAULT_LOCALE);
});

test("lookup walks dotted keys and tolerates bad paths", () => {
  assert.equal(lookup(en, "nav.pricing"), "Pricing");
  assert.equal(lookup(en, "nope.nope"), undefined);
  assert.equal(lookup(undefined, "nav.pricing"), undefined);
});

test("interpolate replaces known placeholders and keeps unknown ones", () => {
  assert.equal(interpolate("Hello {name}", { name: "Vektor" }), "Hello Vektor");
  assert.equal(interpolate("{count} findings", { count: 3 }), "3 findings");
  assert.equal(interpolate("{count} findings"), "{count} findings");
  assert.equal(interpolate("plain"), "plain");
});

test("getMessage falls back to English, then to the key itself", () => {
  const fixtures = {
    en: { only: { english: "english value" } },
    th: { only: { thai: "ค่าไทย" } },
  };

  assert.equal(getMessage("th", "only.thai", undefined, fixtures), "ค่าไทย");
  assert.equal(getMessage("th", "only.english", undefined, fixtures), "english value");
  assert.equal(getMessage("en", "only.missing", undefined, fixtures), "only.missing");
});

test("getMessage interpolates parameters for the real dictionaries", () => {
  assert.equal(getMessage("en", "vulnerabilities.findingsCount", { count: 7 }), "7 findings");
  assert.equal(getMessage("th", "vulnerabilities.findingsCount", { count: 7 }), "7 รายการ");
});

test("createTranslator binds a locale and exposes it on the function", () => {
  const t = createTranslator("th");
  assert.equal(t.locale, "th");
  assert.equal(t("nav.home"), "หน้าแรก");

  const fallbackT = createTranslator("de");
  assert.equal(fallbackT.locale, DEFAULT_LOCALE);
  assert.equal(fallbackT("nav.home"), "Home");
});

test("every Browser Agent model issue maps to an existing translation key", () => {
  const models = [
    undefined,
    { provider: "anthropic-compatible", baseURL: "https://api.minimax.io" },
    { provider: "anthropic", baseURL: "https://proxy.internal" },
    { provider: "openai-compatible", baseURL: "" },
    { provider: "mistralai" },
    { provider: "openai" },
    { provider: "ollama" },
  ];

  const seen = new Set();
  for (const model of models) {
    const key = getMagnitudeModelIssue(model);
    if (key === null) continue;
    seen.add(key);
    assert.equal(typeof enFlat[key], "string", `${key} is missing from en`);
    assert.equal(typeof thFlat[key], "string", `${key} is missing from th`);
  }

  // All five rules are exercised above, so a new rule cannot ship untranslated.
  assert.deepEqual([...seen].sort(), [
    "browserAgent.modelIssueAnthropicBaseUrl",
    "browserAgent.modelIssueAnthropicCustomBaseUrl",
    "browserAgent.modelIssueNoModel",
    "browserAgent.modelIssueOpenAiCompatibleBaseUrl",
    "browserAgent.modelIssueUnsupportedProvider",
  ]);
});

test("readCookieValue parses document.cookie and Cookie headers", () => {
  assert.equal(readCookieValue("a=1; vs_locale=th; b=2", LOCALE_COOKIE), "th");
  assert.equal(readCookieValue("vs_locale=th-TH", LOCALE_COOKIE), "th-TH");
  assert.equal(readCookieValue("vs_locale=th", "other"), undefined);
  assert.equal(readCookieValue("novalue; vs_locale=en", LOCALE_COOKIE), "en");
  assert.equal(readCookieValue("", LOCALE_COOKIE), undefined);
  assert.equal(readCookieValue(undefined, LOCALE_COOKIE), undefined);
});

test("buildLocaleCookie writes the attributes the server reads back", () => {
  const value = buildLocaleCookie("th-TH");
  assert.ok(value.startsWith(`${LOCALE_COOKIE}=th;`), value);
  assert.match(value, /path=\//);
  assert.match(value, /max-age=\d+/);
  assert.match(value, /samesite=lax/);
  assert.match(buildLocaleCookie("de", { maxAge: 60 }), /max-age=60/);
});

test("getLocaleFromCookie resolves the locale and defaults to English", () => {
  assert.equal(getLocaleFromCookie(`${LOCALE_COOKIE}=th`), "th");
  assert.equal(getLocaleFromCookie(`${LOCALE_COOKIE}=th-TH`), "th");
  assert.equal(getLocaleFromCookie(`${LOCALE_COOKIE}=de`), DEFAULT_LOCALE);
  assert.equal(getLocaleFromCookie(""), DEFAULT_LOCALE);
  // No argument and no `document` (this runs in Node) → default locale.
  assert.equal(getLocaleFromCookie(), DEFAULT_LOCALE);
});

test("translate works outside React and honours an explicit locale", () => {
  assert.equal(translate("nav.home", undefined, "th"), "หน้าแรก");
  assert.equal(translate("nav.home", undefined, "en"), "Home");
  assert.equal(translate("vulnerabilities.findingsCount", { count: 2 }, "th"), "2 รายการ");
  // Falls back to the cookie, then to English.
  assert.equal(translate("nav.home"), "Home");
  assert.equal(translate("does.not.exist", undefined, "th"), "does.not.exist");
});

test("intlTag maps locales to Intl tags", () => {
  assert.equal(intlTag("th"), "th-TH");
  assert.equal(intlTag("th-TH"), "th-TH");
  assert.equal(intlTag("en"), "en-US");
  assert.equal(intlTag("de"), "en-US");
});

test("formatNumber and formatDate are locale-aware and never throw", () => {
  assert.equal(formatNumber(1000, "en"), "1,000");
  assert.equal(formatNumber("2500.5", "en"), "2,500.5");
  assert.equal(formatNumber(1000, "th"), "1,000");
  assert.equal(formatNumber(null, "th"), "");
  assert.equal(formatNumber("not a number", "th"), "not a number");

  const iso = "2026-09-01T00:00:00Z";
  // Default short shape; `day: undefined` opts out of the default day field.
  const monthYear = { timeZone: "UTC", year: "numeric", month: "long", day: undefined };
  assert.equal(formatDate(iso, "en", monthYear), "September 2026");
  assert.equal(formatDate(iso, "th", monthYear), "กันยายน 2026");
  // Overriding only the time zone keeps the default shape.
  assert.equal(formatDate(iso, "en", { timeZone: "UTC" }), "Sep 1, 2026");
  assert.match(formatDate(iso, "th", { timeZone: "UTC" }), /2026/);
  // `dateStyle`/`timeStyle` cannot be mixed with the component defaults.
  assert.equal(
    formatDate(iso, "en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }),
    "Sep 1, 2026, 12:00 AM",
  );
  assert.equal(formatDate(null, "th"), "");
  assert.equal(formatDate("not a date", "th"), "not a date");
});
