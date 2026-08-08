import NotificationLog, {
  NotificationLogStatus,
} from "../models/NotificationLog/NotificationLog.model";

export interface LogNotificationInput {
  channel: string;
  recipient?: string;
  type?: string;
  status?: NotificationLogStatus;
  payload?: Record<string, any>;
  error?: string;
}

/**
 * Persist a notification delivery log for the admin Notification Logs panel.
 * Best-effort: never throws, never blocks the caller.
 */
export async function logNotification(input: LogNotificationInput): Promise<void> {
  try {
    await NotificationLog.create({
      channel: input.channel,
      recipient: input.recipient ?? "",
      type: input.type ?? "notification",
      status: input.status ?? "success",
      payload: input.payload ?? {},
      error: input.error,
    });
  } catch (err: any) {
    console.warn("[notificationLog] failed to persist log:", err?.message ?? err);
  }
}
