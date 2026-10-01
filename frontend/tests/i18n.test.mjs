import assert from "node:assert/strict";
import { test } from "node:test";

import en from "../src/i18n/locales/en.js";
import th from "../src/i18n/locales/th.js";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_META,
  SUPPORTED_LOCALES,
  createTranslator,
  getMessage,
  interpolate,
  lookup,
  resolveLocale,
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
