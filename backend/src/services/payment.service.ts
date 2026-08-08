import crypto from "crypto";
import PaymentGateway, {
  PaymentChannel,
  PaymentGatewayDoc,
} from "../models/PaymentGateway/PaymentGateway.model";
import PaymentOrder, {
  PaymentOrderDoc,
  PaymentOrderInterval,
  SubscriptionChannel,
} from "../models/PaymentOrder/PaymentOrder.model";
import TopUpPackage from "../models/TopUpPackage/TopUpPackage.model";
import UserModel from "../models/User/User.model";
import { getPlan, isPlanId, PlanId } from "../config/plans";
import { setUserPlan } from "./billing.service";
import { activateSubscription } from "./subscription.service";


/** Default gateway channels that can be configured by an admin. */
export const DEFAULT_CHANNELS: PaymentChannel[] = [
  "googlepay",
  "alipay",
  "linepay",
  "paypal",
  "crypto_eth",
  "crypto_btc",
  "crypto_bnb",
];

export const CHANNEL_LABELS: Record<PaymentChannel, string> = {
  googlepay: "Google Pay",
  alipay: "Alipay",
  linepay: "LINE Pay",
  paypal: "PayPal",
  crypto_eth: "Crypto (ETH)",
  crypto_btc: "Crypto (BTC)",
  crypto_bnb: "Crypto (BNB)",
};


/** Order validity window (minutes). */
const ORDER_TTL_MINUTES = 60;

function generateOrderId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `ORD-${ts}-${rand}`;
}

/**
 * Ensure the default gateway rows exist so the admin can configure them.
 * Called once at server startup.
 */
export async function ensureDefaultGateways(): Promise<void> {
  for (const channel of DEFAULT_CHANNELS) {
    const existing = await PaymentGateway.findOne({ channel });
    if (!existing) {
      await PaymentGateway.create({
        channel,
        label: CHANNEL_LABELS[channel],
        enabled: false,
        sortOrder: DEFAULT_CHANNELS.indexOf(channel),
      });
    }
  }
}

/**
 * List enabled gateways (public, for the checkout page).
 * Sensitive fields (secret) are stripped.
 */
export async function listEnabledGateways(): Promise<Partial<PaymentGatewayDoc>[]> {
  const gateways = await PaymentGateway.find({ enabled: true }).sort({ sortOrder: 1 });
  return gateways.map((g) => {
    const obj = g.toObject();
    delete (obj as any).secret;
    return obj;
  });
}

/**
 * List all gateways (admin only).
 */
export async function listAllGateways(): Promise<PaymentGatewayDoc[]> {
  return PaymentGateway.find().sort({ sortOrder: 1 });
}

/**
 * Upsert a gateway configuration (admin only).
 */
export async function upsertGateway(
  channel: PaymentChannel,
  data: {
    label?: string;
    enabled?: boolean;
    instructions?: string;
    merchantId?: string;
    secret?: string;
    cryptoWallet?: { address?: string; network?: string; memo?: string };
    logo?: string;
    logoColor?: string;
    sortOrder?: number;
  },
): Promise<PaymentGatewayDoc> {
  const existing = await PaymentGateway.findOne({ channel });
  if (existing) {
    existing.label = data.label ?? existing.label;
    if (typeof data.enabled === "boolean") existing.enabled = data.enabled;
    existing.instructions = data.instructions ?? existing.instructions;
    existing.merchantId = data.merchantId ?? existing.merchantId;
    if (data.secret) existing.secret = data.secret;
    if (data.cryptoWallet) {
      existing.cryptoWallet = {
        address: data.cryptoWallet.address ?? existing.cryptoWallet?.address ?? "",
        network: data.cryptoWallet.network ?? existing.cryptoWallet?.network ?? "",
        memo: data.cryptoWallet.memo ?? existing.cryptoWallet?.memo ?? "",
      };
    }
    existing.logo = data.logo ?? existing.logo;
    existing.logoColor = data.logoColor ?? existing.logoColor;
    if (typeof data.sortOrder === "number") existing.sortOrder = data.sortOrder;
    return existing.save();
  }
  return PaymentGateway.create({
    channel,
    label: data.label ?? CHANNEL_LABELS[channel],
    enabled: data.enabled ?? false,
    instructions: data.instructions,
    merchantId: data.merchantId,
    secret: data.secret,
    logo: data.logo,
    logoColor: data.logoColor,

    cryptoWallet: data.cryptoWallet,
    sortOrder: data.sortOrder ?? 0,
  });
}

/**
 * Create a payment order for a plan upgrade.
 * Returns the order plus the payment instructions for the chosen channel.
 */
export async function createPaymentOrder(
  userId: string,
  plan: string,
  interval: PaymentOrderInterval,
  channel: PaymentChannel,
  subscriptionChannel?: SubscriptionChannel,
): Promise<{ order: PaymentOrderDoc; instructions: any }> {
  if (!(await isPlanId(plan))) {
    throw new Error("Invalid plan");
  }
  if (plan === "free") {
    throw new Error("Free plan does not require payment");
  }

  const gateway = await PaymentGateway.findOne({ channel, enabled: true });
  if (!gateway) {
    throw new Error("Selected payment channel is not available");
  }

  const planDef = await getPlan(plan as PlanId);
  const amountUsd = interval === "annual" ? planDef.priceAnnual : planDef.priceMonthly;
  if (amountUsd <= 0) {
    throw new Error("This plan has no price for the selected interval");
  }

  const order = await PaymentOrder.create({
    orderId: generateOrderId(),
    userId,
    plan,
    interval,
    amountUsd,
    channel,
    subscriptionChannel,
    status: "pending",
    expiresAt: new Date(Date.now() + ORDER_TTL_MINUTES * 60 * 1000),
  });


  // Build channel-specific payment instructions.
  let instructions: any = {
    orderId: order.orderId,
    amountUsd: order.amountUsd,
    channel,
    channelLabel: gateway.label,
    expiresAt: order.expiresAt,
  };

  if (channel.startsWith("crypto_")) {
    instructions.cryptoWallet = (gateway.cryptoWallet ?? {
      address: "",
      network: "",
    }) as any;
    instructions.instructions =
      gateway.instructions ||
      `Send exactly ${amountUsd} USD worth of ${gateway.label} to the wallet address above. ` +
        `Include the order ID ${order.orderId} in the memo/note if required.`;
  } else {
    instructions.merchantId = (gateway.merchantId ?? "") as any;
    instructions.instructions =
      gateway.instructions || `Complete the ${gateway.label} payment using the merchant details above.`;
  }

  return { order, instructions };
}

// ─── Top-up packages & token credit ─────────────────────────────

/**
 * List enabled top-up packages (public, for the top-up page).
 */
export async function listEnabledTopUpPackages() {
  return TopUpPackage.find({ enabled: true }).sort({ sortOrder: 1 }).lean();
}

/**
 * List all top-up packages (admin only).
 */
export async function listAllTopUpPackages() {
  return TopUpPackage.find().sort({ sortOrder: 1 }).lean();
}

/**
 * Create or update a top-up package (admin only).
 */
export async function upsertTopUpPackage(data: {
  packageId: string;
  name: string;
  description?: string;
  priceUsd: number;
  tokens: number;
  enabled?: boolean;
  sortOrder?: number;
}) {
  const { packageId } = data;
  if (!packageId || !packageId.trim()) throw new Error("packageId is required");
  if (Number(data.priceUsd) <= 0) throw new Error("Price must be greater than 0");
  if (Number(data.tokens) <= 0) throw new Error("Tokens must be greater than 0");

  const existing = await TopUpPackage.findOne({ packageId });
  if (existing) {
    existing.name = data.name ?? existing.name;
    if (data.description !== undefined) existing.description = data.description;
    existing.priceUsd = Number(data.priceUsd);
    existing.tokens = Number(data.tokens);
    if (typeof data.enabled === "boolean") existing.enabled = data.enabled;
    if (typeof data.sortOrder === "number") existing.sortOrder = data.sortOrder;
    return existing.save();
  }
  return TopUpPackage.create({
    packageId,
    name: data.name,
    description: data.description,
    priceUsd: Number(data.priceUsd),
    tokens: Number(data.tokens),
    enabled: data.enabled ?? true,
    sortOrder: data.sortOrder ?? 0,
  });
}

/**
 * Delete a top-up package (admin only).
 */
export async function deleteTopUpPackage(packageId: string) {
  const result = await TopUpPackage.deleteOne({ packageId });
  if (result.deletedCount === 0) throw new Error("Top-up package not found");
  return result;
}

/**
 * Create a payment order for a token top-up.
 */
export async function createTopUpOrder(
  userId: string,
  packageId: string,
  channel: PaymentChannel,
): Promise<{ order: PaymentOrderDoc; instructions: any }> {
  const pkg = await TopUpPackage.findOne({ packageId, enabled: true });
  if (!pkg) throw new Error("Top-up package not found or disabled");

  const gateway = await PaymentGateway.findOne({ channel, enabled: true });
  if (!gateway) throw new Error("Selected payment channel is not available");

  const amountUsd = pkg.priceUsd;
  if (amountUsd <= 0) throw new Error("This package has no price");

  const order = await PaymentOrder.create({
    orderId: generateOrderId(),
    userId,
    plan: "topup",
    interval: "topup",
    amountUsd,
    channel,
    topupPackageId: pkg.packageId,
    topupTokens: pkg.tokens,
    status: "pending",
    expiresAt: new Date(Date.now() + ORDER_TTL_MINUTES * 60 * 1000),
  });

  let instructions: any = {
    orderId: order.orderId,
    amountUsd: order.amountUsd,
    channel,
    channelLabel: gateway.label,
    expiresAt: order.expiresAt,
    topupPackageId: pkg.packageId,
    topupTokens: pkg.tokens,
  };

  if (channel.startsWith("crypto_")) {
    instructions.cryptoWallet = (gateway.cryptoWallet ?? {
      address: "",
      network: "",
    }) as any;
    instructions.instructions =
      gateway.instructions ||
      `Send exactly ${amountUsd} USD worth of ${gateway.label} to the wallet address above. ` +
        `Include the order ID ${order.orderId} in the memo/note if required.`;
  } else {
    instructions.merchantId = (gateway.merchantId ?? "") as any;
    instructions.instructions =
      gateway.instructions || `Complete the ${gateway.label} payment using the merchant details above.`;
  }

  return { order, instructions };
}

/**
 * Credit tokens to a user's wallet. Uses the existing `credits` field on User.
 */
export async function creditTokensToUser(userId: string, tokens: number) {
  if (!tokens || tokens <= 0) return;
  await UserModel.findByIdAndUpdate(userId, { $inc: { credits: tokens } });
}

/**
 * Get a user's current token credit balance.
 */
export async function getTokenBalance(userId: string) {
  const user = await UserModel.findById(userId).select("credits creditsUsed");
  return {
    credits: user?.credits ?? 0,
    creditsUsed: user?.creditsUsed ?? 0,
  };
}

/**
 * Get a user's own order by orderId.
 */
export async function getOrderForUser(userId: string, orderId: string): Promise<PaymentOrderDoc | null> {
  return PaymentOrder.findOne({ orderId, userId });
}

/**
 * List a user's own orders (most recent first).
 */
export async function listOrdersForUser(userId: string): Promise<PaymentOrderDoc[]> {
  return PaymentOrder.find({ userId }).sort({ createdAt: -1 });
}

/**
 * List all orders (admin only).
 */
export async function listAllOrders(filter?: { status?: string }): Promise<PaymentOrderDoc[]> {
  const query: any = {};
  if (filter?.status) query.status = filter.status;
  return PaymentOrder.find(query).sort({ createdAt: -1 });
}

/**
 * Mark an order as paid (admin action). Optionally confirm immediately.
 */
export async function markOrderPaid(
  orderId: string,
  adminUserId: string,
  opts: { channelReference?: string; adminNote?: string; confirm?: boolean },
): Promise<PaymentOrderDoc> {
  const order = await PaymentOrder.findOne({ orderId });
  if (!order) throw new Error("Order not found");
  if (order.status === "confirmed" || order.status === "refunded") {
    throw new Error(`Order is already ${order.status}`);
  }

  order.status = "paid";
  order.paidAt = new Date();
  if (opts.channelReference) order.channelReference = opts.channelReference;
  if (opts.adminNote) order.adminNote = opts.adminNote;

  if (opts.confirm) {
    order.status = "confirmed";
    order.confirmedAt = new Date();
    order.confirmedBy = adminUserId as any;
    // Token top-up orders credit the user's wallet instead of activating a plan.
    if (order.interval === "topup") {
      await creditTokensToUser(order.userId.toString(), order.topupTokens ?? 0);
    } else {
      // Activate the plan for the user.
      await setUserPlan(order.userId.toString(), order.plan, {
        interval: order.interval,
        actorId: adminUserId,
        reason: "payment_confirmed",
      });
      // Create/upgrade the subscription record for the target channel.
      if (order.subscriptionChannel) {
        await activateSubscription(order.userId.toString(), order.subscriptionChannel, order.plan, {
          paymentOrderId: order.orderId,
          autoRenew: order.interval === "monthly",
          periodDays: order.interval === "annual" ? 365 : 30,
        });
      }
    }
  }

  return order.save();
}


/**
 * Confirm a paid order and activate the plan (admin action).
 */
export async function confirmOrder(
  orderId: string,
  adminUserId: string,
  opts: { channelReference?: string; adminNote?: string },
): Promise<PaymentOrderDoc> {
  const order = await PaymentOrder.findOne({ orderId });
  if (!order) throw new Error("Order not found");
  if (order.status === "confirmed") throw new Error("Order is already confirmed");
  if (order.status === "refunded") throw new Error("Order is refunded");

  order.status = "confirmed";
  order.confirmedAt = new Date();
  order.confirmedBy = adminUserId as any;
  if (opts.channelReference) order.channelReference = opts.channelReference;
  if (opts.adminNote) order.adminNote = opts.adminNote;

  // Token top-up orders credit the user's wallet instead of activating a plan.
  if (order.interval === "topup") {
    await creditTokensToUser(order.userId.toString(), order.topupTokens ?? 0);
  } else {
    await setUserPlan(order.userId.toString(), order.plan, {
      interval: order.interval,
      actorId: adminUserId,
      reason: "payment_confirmed",
    });

    // Create/upgrade the subscription record for the target channel.
    if (order.subscriptionChannel) {
      await activateSubscription(order.userId.toString(), order.subscriptionChannel, order.plan, {
        paymentOrderId: order.orderId,
        autoRenew: order.interval === "monthly",
        periodDays: order.interval === "annual" ? 365 : 30,
      });
    }
  }

  return order.save();
}

/**
 * Cancel an order (user or admin).
 */

export async function cancelOrder(orderId: string, userId: string): Promise<PaymentOrderDoc> {
  const order = await PaymentOrder.findOne({ orderId, userId });
  if (!order) throw new Error("Order not found");
  if (order.status !== "pending") {
    throw new Error(`Cannot cancel an order in status "${order.status}"`);
  }
  order.status = "canceled";
  return order.save();
}

/**
 * Expire stale pending orders (called periodically or on read).
 */
export async function expireStaleOrders(): Promise<number> {
  const result = await PaymentOrder.updateMany(
    { status: "pending", expiresAt: { $lt: new Date() } },
    { $set: { status: "expired" } },
  );
  return result.modifiedCount;
}
