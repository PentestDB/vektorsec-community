"use client";

import { useQueryClient } from "react-query";
import { useCallback } from "react";

export const useSessionInvalidation = (sessionId) => {
  const queryClient = useQueryClient();

  const invalidateSession = useCallback(async () => {
    await queryClient.invalidateQueries(["get-session-data", sessionId]);
    await queryClient.invalidateQueries([
      "get-session-loop-history",
      sessionId,
    ]);
  }, [queryClient, sessionId]);

  return { invalidateSession };
};
