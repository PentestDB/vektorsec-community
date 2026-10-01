/**
 * Outbound notification channel adapters (Slack / Discord / LINE / generic
 * webhook).
 *
 * Pure functions only — no HTTP here — so the payload shapes and the filtering
 * rules can be unit tested. `notificationLog.service.ts` owns the delivery.
 */

export type NotificationKind = "slack" | "discord" | "line" | "generic";

export type NotificationSeverity = "info" | "warning" | "critical";

export interface NotificationEvent {
  /** Machine-readable event name, e.g. `payment_confirmed`, `agent_run_failed`. */
  type: string;
  /** Short headline. */
  title: string;
  /** Human-readable detail (may be multi-line). */
  message: string;
  severity?: NotificationSeverity;
  /** Subscription channel the event belongs to (telegram / online / platform). */
  channel?: string;
  /** Who the event concerns (chat id, user email, …). */
  recipient?: string;
  /** Extra structured context (never contains secrets). */
  metadata?: Record<string, unknown>;
}

export interface NotificationFilterOptions {
  /** Only these event types are forwarded (empty = all). */
  types?: string[];
  /** Minimum severity to forward. */
  minSeverity?: NotificationSeverity;
}

const SEVERITY_ORDER: Record<NotificationSeverity, number> = {
  info: 10,
  warning: 20,
  critical: 30,
};

/** Normalise `NOTIFY_WEBHOOK_KIND` (aliases included); null when unusable. */
export function parseNotificationKind(value: unknown): NotificationKind | null {
  if (value === undefined || value === null || value === "") return "generic";
  const normalised = String(value).trim().toLowerCase();

  if (["generic", "webhook", "json", "http"].includes(normalised)) return "generic";
  if (["slack", "slack-webhook"].includes(normalised)) return "slack";
  if (["discord", "discord-webhook"].includes(normalised)) return "discord";
  if (["line", "line-notify", "lineworks"].includes(normalised)) return "line";
  return null;
}

function severityOf(event: NotificationEvent): NotificationSeverity {
  const severity = (event.severity ?? "info") as NotificationSeverity;
  return SEVERITY_ORDER[severity] ? severity : "info";
}

/** The one-line text most providers expect. */
export function formatNotificationText(event: NotificationEvent): string {
  const icon =
    severityOf(event) === "critical" ? "🚨" : severityOf(event) === "warning" ? "⚠️" : "ℹ️";
  const lines = [`${icon} ${event.title}`, event.message];
  if (event.channel) lines.push(`Channel: ${event.channel}`);
  if (event.recipient) lines.push(`Recipient: ${event.recipient}`);
  return lines.join("\n");
}

/** Provider-specific request body. */
export function buildNotificationPayload(
  kind: NotificationKind,
  event: NotificationEvent,
): Record<string, unknown> {
  const text = formatNotificationText(event);

  switch (kind) {
    case "slack":
      return { text };
    case "discord":
      return { content: text };
    case "line":
      return { messages: [{ type: "text", text }] };
    default:
      return {
        event: event.type,
        title: event.title,
        message: event.message,
        severity: severityOf(event),
        channel: event.channel,
        recipient: event.recipient,
        metadata: event.metadata ?? {},
      };
  }
}

/**
 * Decide whether an event should leave the platform: type allow-list (when
 * configured) plus a minimum severity.
 */
export function shouldSendNotification(
  event: NotificationEvent,
  options: NotificationFilterOptions = {},
): boolean {
  const types = (options.types ?? []).filter(Boolean);
  if (types.length > 0 && !types.includes(event.type)) return false;

  const min = SEVERITY_ORDER[options.minSeverity ?? "info"] ?? SEVERITY_ORDER.info;
  return SEVERITY_ORDER[severityOf(event)] >= min;
}

/** `NOTIFY_TYPES=a,b,c` → ["a","b","c"] */
export function parseNotificationTypes(value: unknown): string[] {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
