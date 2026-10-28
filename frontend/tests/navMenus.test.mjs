import assert from "node:assert/strict";
import { test } from "node:test";

import { HOME_MENU, isHomeMenu, withHomeLink } from "../src/utils/navMenus.js";

// Admin-managed entries without a home link (Content → Menu Links lets an
// admin delete "/", which is the bug `withHomeLink` guards against).
const MENUS = [
  { labelKey: "nav.pricing", url: "/pricing", order: 0 },
  { labelKey: "nav.docs", url: "/docs", order: 1 },
];

test("isHomeMenu matches internal links to the landing page only", () => {
  assert.equal(isHomeMenu({ url: "/" }), true);
  assert.equal(isHomeMenu({ url: "//" }), true);
  assert.equal(isHomeMenu({ url: "/pricing" }), false);
  assert.equal(isHomeMenu({ url: "" }), false);
  assert.equal(isHomeMenu({ url: "/", openInNewTab: true }), false);
  assert.equal(isHomeMenu({}), false);
  assert.equal(isHomeMenu(null), false);
  assert.equal(isHomeMenu(undefined), false);
});

test("an admin-managed home entry is kept as-is", () => {
  const menus = [{ label: "Home", url: "/" }, ...MENUS];
  assert.deepEqual(withHomeLink(menus), menus);
  // Nothing is duplicated when the admin already provides a home link.
  assert.equal(withHomeLink(menus).length, menus.length);
});

test("the built-in home entry is prepended when the list lost it", () => {
  const out = withHomeLink(MENUS);
  assert.equal(out.length, MENUS.length + 1);
  assert.equal(out[0], HOME_MENU);
  assert.deepEqual(out.slice(1), MENUS);
  // The caller's array is never mutated.
  assert.equal(MENUS.length, 2);
});

test("an unreachable menu API falls back to the default list", () => {
  const defaults = [{ labelKey: "nav.home", url: "/", order: 0 }, ...MENUS];
  assert.deepEqual(withHomeLink(undefined, defaults), defaults);
  assert.deepEqual(withHomeLink(null, defaults), defaults);
  assert.equal(withHomeLink(null, MENUS)[0], HOME_MENU);
  assert.deepEqual(withHomeLink(undefined), [HOME_MENU]);
});

test("junk entries are dropped without losing the home link", () => {
  const out = withHomeLink([null, undefined, { url: "/docs" }], MENUS);
  assert.deepEqual(
    out.map((m) => m.url),
    ["/", "/docs"],
  );
});
