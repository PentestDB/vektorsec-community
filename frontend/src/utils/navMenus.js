/**
 * Helpers for the public navbar menu list.
 *
 * The navbar is driven by admin-managed entries (Content -> Menu Links) with a
 * built-in list as the fallback. Because admins can delete the entry for "/",
 * the home link is re-inserted here so the landing page always stays reachable
 * from the navbar and the mobile sidebar.
 *
 * Kept dependency-free so it can be unit tested on plain Node:
 *   cd frontend && node --test tests/
 */

/** Built-in descriptor of the home entry (label is resolved through i18n). */
export const HOME_MENU = { labelKey: "nav.home", url: "/", order: -1 };

/** True when a menu entry points at the landing page. */
export function isHomeMenu(menu) {
  if (!menu || menu.openInNewTab) return false;
  return /^\/+$/.test(String(menu.url ?? ""));
}

/**
 * Return `menus` unchanged when it already links home, otherwise prepend the
 * built-in Home entry. A non-array (menu API unreachable) falls back to
 * `fallback` — which is itself guaranteed to contain a home link.
 */
export function withHomeLink(menus, fallback = []) {
  const list = Array.isArray(menus)
    ? menus.filter(Boolean)
    : Array.isArray(fallback)
    ? fallback.filter(Boolean)
    : [];
  return list.some(isHomeMenu) ? list : [HOME_MENU, ...list];
}
