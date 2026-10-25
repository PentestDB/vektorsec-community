/**
 * Pure helpers for the secondary session tabs (vpn / gui / burp / caido /
 * mythic / browser-agent).
 *
 * A tab's redux id is always `${sessionId}/${type}` and exactly one tab is
 * active at a time. Before this module existed the same find/map/push was
 * copied into five route pages and six sidebar handlers, so a change to the
 * rule had to be applied everywhere — or, more often, was not.
 *
 * Kept dependency-free so it can be unit tested on plain Node:
 *   cd frontend && node --test tests/
 */

/** Secondary tabs a session workspace can open next to the main chat. */
export const SESSION_TAB_TYPES = [
  "vpn",
  "gui",
  "burp",
  "caido",
  "mythic",
  "browser-agent",
];

/** Redux id of a secondary tab inside a session. */
export function sessionTabId(sessionId, type) {
  return `${sessionId}/${type}`;
}

/**
 * Build the next `sessions` array for opening `type` inside `sessionId`.
 *
 * Returns `null` when the tab is already the active one, so callers can skip
 * the dispatch (and the re-render) instead of writing a new array every time.
 * The input array is never mutated.
 */
export function buildSessionTabs(sessions, sessionId, type) {
  if (!sessionId || !type) return null;
  if (!Array.isArray(sessions)) return null;

  const id = sessionTabId(sessionId, type);
  const existing = sessions.find((session) => session.id === id);

  if (existing) {
    if (existing.is_active) return null;
    return sessions.map((session) => ({
      ...session,
      is_active: session.id === id,
    }));
  }

  return [
    ...sessions.map((session) => ({ ...session, is_active: false })),
    { id, is_main: false, is_active: true, type },
  ];
}

/**
 * Normalise a `sessions` payload coming from the API.
 *
 * An empty (or malformed) payload is valid — it simply means the user has no
 * open sessions left — so it must never be assumed to contain `sessions[0]`.
 * When the payload has no active tab, the main chat is activated (falling back
 * to the first entry).
 */
export function normalizeSessionTabs(sessions) {
  const list = Array.isArray(sessions) ? sessions.map((session) => ({ ...session })) : [];

  if (list.length > 0 && !list.some((session) => session.is_active)) {
    const fallback = list.find((session) => session.is_main) ?? list[0];
    fallback.is_active = true;
  }

  return list;
}

/** Next `sessions` array with `sessionId` as the only active tab. */
export function activateSessionTab(sessions, sessionId) {
  const list = Array.isArray(sessions) ? sessions : [];
  return list.map((session) => ({
    ...session,
    is_active: session.id === sessionId,
  }));
}

/**
 * Next `sessions` array after closing `sessionId`.
 *
 * Closing the last tab returns an empty array instead of throwing, and if the
 * closed tab was the active one the main chat (or the first remaining tab) takes
 * over. The input array is never mutated.
 */
export function closeSessionTab(sessions, sessionId) {
  const list = Array.isArray(sessions) ? sessions : [];
  const remaining = list
    .filter((session) => session.id !== sessionId)
    .map((session) => ({ ...session }));

  if (remaining.length === 0) return [];

  if (!remaining.some((session) => session.is_active)) {
    const fallback = remaining.find((session) => session.is_main) ?? remaining[0];
    fallback.is_active = true;
  }

  return remaining;
}
