import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import {
  buildNotificationPayload,
  formatNotificationText,
  NotificationEvent,
  parseNotificationKind,
  parseNotificationTypes,
  shouldSendNotification,
} from "../src/utils/notificationChannels";
import { dispatchExternalNotification } from "../src/services/notificationLog.service";

const event: NotificationEvent = {
  type: "payment_confirmed",
  title: "Payment confirmed",
  message: "Order #42 activated the Pro plan.",
  severity: "info",
  channel: "online",
  recipient: "customer@example.com",
  metadata: { orderId: "42" },
};

const ENV_KEYS = ["NOTIFY_WEBHOOK_URL", "NOTIFY_WEBHOOK_KIND", "NOTIFY_MIN_SEVERITY", "NOTIFY_TYPES"];
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

let server: Server;
let webhookUrl: string;
let received: Array<{ body: any; headers: Record<string, any> }> = [];
let nextStatus = 200;

before(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      received.push({
        body: raw ? JSON.parse(raw) : null,
        headers: req.headers as Record<string, any>,
      });
      res.writeHead(nextStatus, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: nextStatus < 400 }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  webhookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

test("parseNotificationKind accepts aliases and rejects nonsense", () => {
  assert.equal(parseNotificationKind(undefined), "generic");
  assert.equal(parseNotificationKind(""), "generic");
  assert.equal(parseNotificationKind("webhook"), "generic");
  assert.equal(parseNotificationKind("Slack"), "slack");
  assert.equal(parseNotificationKind("discord-webhook"), "discord");
  assert.equal(parseNotificationKind("line-notify"), "line");
  assert.equal(parseNotificationKind("carrier-pigeon"), null);
});

test("buildNotificationPayload matches each provider's contract", () => {
  const slack = buildNotificationPayload("slack", event) as { text: string };
  assert.match(slack.text, /Payment confirmed/);
  assert.match(slack.text, /Order #42/);

  const discord = buildNotificationPayload("discord", event) as { content: string };
  assert.match(discord.content, /Payment confirmed/);

  const line = buildNotificationPayload("line", event) as {
    messages: Array<{ type: string; text: string }>;
  };
  assert.equal(line.messages[0].type, "text");
  assert.match(line.messages[0].text, /Payment confirmed/);

  const generic = buildNotificationPayload("generic", event) as Record<string, any>;
  assert.equal(generic.event, "payment_confirmed");
  assert.equal(generic.severity, "info");
  assert.equal(generic.recipient, "customer@example.com");
  assert.deepEqual(generic.metadata, { orderId: "42" });
});

test("formatNotificationText flags severity with an icon", () => {
  assert.match(formatNotificationText(event), /^ℹ️/);
  assert.match(formatNotificationText({ ...event, severity: "warning" }), /^⚠️/);
  assert.match(formatNotificationText({ ...event, severity: "critical" }), /^🚨/);
  assert.match(formatNotificationText(event), /Channel: online/);
});

test("shouldSendNotification honours the type allow-list and minimum severity", () => {
  assert.equal(shouldSendNotification(event), true);
  assert.equal(shouldSendNotification(event, { types: ["agent_run_failed"] }), false);
  assert.equal(shouldSendNotification(event, { types: ["payment_confirmed"] }), true);
  assert.equal(shouldSendNotification(event, { minSeverity: "warning" }), false);
  assert.equal(
    shouldSendNotification({ ...event, severity: "critical" }, { minSeverity: "warning" }),
    true,
  );
});

test("parseNotificationTypes trims and drops empty entries", () => {
  assert.deepEqual(parseNotificationTypes("a, b ,,c"), ["a", "b", "c"]);
  assert.deepEqual(parseNotificationTypes(undefined), []);
});

test("dispatchExternalNotification is a no-op when no webhook is configured", async () => {
  delete process.env.NOTIFY_WEBHOOK_URL;
  assert.deepEqual(await dispatchExternalNotification(event), {
    sent: false,
    skipped: "not-configured",
  });
});

test("dispatchExternalNotification posts the provider payload", async () => {
  received = [];
  process.env.NOTIFY_WEBHOOK_URL = webhookUrl;
  process.env.NOTIFY_WEBHOOK_KIND = "slack";

  const result = await dispatchExternalNotification(event);

  assert.deepEqual(result, { sent: true, status: 200 });
  assert.equal(received.length, 1);
  assert.match(received[0].body.text, /Payment confirmed/);
  assert.equal(received[0].headers["content-type"], "application/json");
});

test("dispatchExternalNotification respects NOTIFY_TYPES / NOTIFY_MIN_SEVERITY", async () => {
  received = [];
  process.env.NOTIFY_WEBHOOK_URL = webhookUrl;
  process.env.NOTIFY_WEBHOOK_KIND = "generic";
  process.env.NOTIFY_TYPES = "agent_run_failed";
  process.env.NOTIFY_MIN_SEVERITY = "info";

  const result = await dispatchExternalNotification(event);
  assert.deepEqual(result, { sent: false, skipped: "filtered" });
  assert.equal(received.length, 0);
});

test("dispatchExternalNotification reports a non-2xx response without throwing", async () => {
  received = [];
  nextStatus = 500;
  delete process.env.NOTIFY_TYPES;
  process.env.NOTIFY_WEBHOOK_URL = webhookUrl;

  const result = await dispatchExternalNotification(event);
  assert.equal(result.sent, false);
  assert.equal(result.status, 500);

  nextStatus = 200;
});

test("dispatchExternalNotification swallows transport errors", async () => {
  process.env.NOTIFY_WEBHOOK_URL = webhookUrl;

  const failingFetch = (async () => {
    throw new Error("connection reset");
  }) as unknown as typeof fetch;

  const result = await dispatchExternalNotification(event, failingFetch);
  assert.equal(result.sent, false);
  assert.match(result.error ?? "", /connection reset/);
});

test("dispatchExternalNotification rejects an unknown webhook kind", async () => {
  process.env.NOTIFY_WEBHOOK_URL = webhookUrl;
  process.env.NOTIFY_WEBHOOK_KIND = "pigeon";

  const result = await dispatchExternalNotification(event);
  assert.equal(result.sent, false);
  assert.match(result.error ?? "", /unknown webhook kind/);
});
