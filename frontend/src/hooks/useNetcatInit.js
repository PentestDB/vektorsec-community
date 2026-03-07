"use client";

import { useMutation, useQueryClient } from "react-query";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { notification } from "antd";
import { updateSessions } from "@/store/user.slice";
import { initiateNetcatSession } from "@/services/copilot.service";
import { getErrorMessage } from "./useErrorMessage";

export const useNetcatInit = (sessionId, sessions) => {
  const router = useRouter();
  const dispatch = useDispatch();
  const queryClient = useQueryClient();

  const initiateNetcatMutation = useMutation(initiateNetcatSession, {
    onSuccess: (data) => {
      const netcatSessionId = data?.netcatSessionId;
      if (!netcatSessionId) return;

      const updatedSessions = [
        ...sessions,
        {
          id: netcatSessionId,
          is_main: false,
          is_active: true,
          type: "netcat",
        },
      ];
      dispatch(updateSessions(updatedSessions));
      queryClient.invalidateQueries(["get-session-data", sessionId]);
      router.push(`/session/${sessionId}/netcat/${netcatSessionId}`);
    },
    onError: (error) => {
      notification.error({
        message: "Failed to initiate netcat session",
        description: getErrorMessage(error),
      });
    },
  });

  const initiateNetcat = (access = "full") => {
    initiateNetcatMutation.mutate({ session_id: sessionId, access });
  };

  return {
    initiateNetcat,
    isLoading: initiateNetcatMutation.isLoading,
  };
};
