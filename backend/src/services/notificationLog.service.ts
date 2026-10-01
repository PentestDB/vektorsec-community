import NotificationLog, {
  NotificationLogStatus,
} from "../models/NotificationLog/NotificationLog.model";
import { logger } from "../utils/logger";
import {
  buildNotificationPayload,
  NotificationEvent,
  parseNotificationKind,
  parseNotificationTypes,
  shouldSendNotification,
} from "../utils/notificationChannels";

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
    logger.warn("failed to persist notification log", { err, channel: input.channel });
  }
}

export interface ExternalNotificationResult {
  sent: boolean;
  skipped?: "not-configured" | "filtered";
  status?: number;
  error?: string;
}

/**
 * Fan an event out to an external channel (Slack / Discord / LINE / generic).
 *
 * Configuration (backend/.env):
 *   NOTIFY_WEBHOOK_URL        target URL — feature is off when unset
 *   NOTIFY_WEBHOOK_KIND       slack | discord | line | generic (default generic)
 *   NOTIFY_MIN_SEVERITY       info | warning | critical (default info)
 *   NOTIFY_TYPES              comma-separated event allow-list (default all)
 *
 * Best-effort: failures are logged and returned, never thrown.
 */
export async function dispatchExternalNotification(
  event: NotificationEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<ExternalNotificationResult> {
  const url = process.env.NOTIFY_WEBHOOK_URL?.trim();
  if (!url) return { sent: false, skipped: "not-configured" };

  const kind = parseNotificationKind(process.env.NOTIFY_WEBHOOK_KIND);
  if (!kind) {
    logger.warn("unknown NOTIFY_WEBHOOK_KIND; notification skipped", {
      value: process.env.NOTIFY_WEBHOOK_KIND,
    });
    return { sent: false, error: "unknown webhook kind" };
  }

  const types = parseNotificationTypes(process.env.NOTIFY_TYPES);
  const minSeverity = (process.env.NOTIFY_MIN_SEVERITY ?? "info") as any;
  if (!shouldSendNotification(event, { types, minSeverity })) {
    return { sent: false, skipped: "filtered" };
  }

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildNotificationPayload(kind, event)),
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      logger.warn("external notification rejected", {
        event: event.type,
        kind,
        status: response.status,
      });
      return { sent: false, status: response.status };
    }

    logger.info("external notification delivered", { event: event.type, kind });
    return { sent: true, status: response.status };
  } catch (err: any) {
    // Never leak the webhook URL (it is a credential).
    logger.warn("external notification failed", { event: event.type, kind, err });
    return { sent: false, error: err?.message ?? String(err) };
  }
}
