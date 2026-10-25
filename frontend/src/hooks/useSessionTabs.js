"use client";

import { useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { updateSessions } from "@/store/user.slice";
import { buildSessionTabs } from "@/utils/sessionTabs";

/**
 * Route helper: registers the tab when a secondary session page mounts. The
 * write happens inside an effect — never during render — and only when the
 * list really changes, so navigating back and forth stays a no-op.
 *
 * This replaces the `if (!session) dispatch(updateSessions(...))` block that
 * used to run in the render body of the vpn / gui / burp / caido / mythic /
 * browser-agent pages.
 */
export const useRegisterSessionTab = (sessionId, type) => {
  const dispatch = useDispatch();
  const { sessions } = useSelector((state) => state.user);

  useEffect(() => {
    const next = buildSessionTabs(sessions, sessionId, type);
    if (next) dispatch(updateSessions(next));
  }, [dispatch, sessionId, type, sessions]);
};

/**
 * Sidebar helper: `openTab(type)` registers the tab imperatively and returns
 * its id so the caller can navigate to `/session/${id}`.
 */
export const useSessionTabNav = (sessionId) => {
  const dispatch = useDispatch();
  const { sessions } = useSelector((state) => state.user);

  const openTab = useCallback(
    (type) => {
      const next = buildSessionTabs(sessions, sessionId, type);
      if (next) dispatch(updateSessions(next));
      return `${sessionId}/${type}`;
    },
    [dispatch, sessions, sessionId]
  );

  return { openTab };
};
