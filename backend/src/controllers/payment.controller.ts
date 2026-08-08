import { Request, Response } from "express";
import {
  cancelOrder,
  confirmOrder,
  createPaymentOrder,
  createTopUpOrder,
  creditTokensToUser,
  DEFAULT_CHANNELS,
  deleteTopUpPackage,
  expireStaleOrders,
  getTokenBalance,
  listAllGateways,
  listAllOrders,
  listAllTopUpPackages,
  listEnabledGateways,
  listEnabledTopUpPackages,
  listOrdersForUser,
  markOrderPaid,
  upsertGateway,
  upsertTopUpPackage,
} from "../services/payment.service";
import { PaymentChannel } from "../models/PaymentGateway/PaymentGateway.model";
import {
  PaymentOrderInterval,
  SubscriptionChannel,
} from "../models/PaymentOrder/PaymentOrder.model";


function isChannel(value: string): value is PaymentChannel {
  return DEFAULT_CHANNELS.includes(value as PaymentChannel);
}


/**
 * GET /api/payment/gateways
 * Public: list enabled payment channels for the checkout page.
 */
export async function getEnabledGateways(req: Request, res: Response) {
  try {
    const gateways = await listEnabledGateways();
    return res.status(200).json({ gateways });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load gateways" });
  }
}

/**
 * GET /api/payment/admin/gateways
 * Admin: list all gateways (including disabled) with config.
 */
export async function getAllGateways(req: Request, res: Response) {
  try {
    const gateways = await listAllGateways();
    return res.status(200).json({ gateways });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load gateways" });
  }
}

/**
 * POST /api/payment/admin/gateways
 * Admin: create or update a gateway configuration.
 * Body: { channel, label?, enabled?, instructions?, merchantId?, secret?, cryptoWallet?, logo?, logoColor?, sortOrder? }
 */
export async function saveGateway(req: Request, res: Response) {
  try {
    const { channel, label, enabled, instructions, merchantId, secret, cryptoWallet, logo, logoColor, sortOrder } =
      req.body ?? {};
    if (!channel || !isChannel(channel)) {
      return res.status(400).json({ message: "Invalid channel" });
    }

    const gateway = await upsertGateway(channel, {
      label,
      enabled,
      instructions,
      merchantId,
      secret,
      cryptoWallet,
      logo,
      logoColor,
      sortOrder,
    });


    return res.status(200).json({ gateway });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to save gateway" });
  }
}

/**
 * POST /api/payment/order
 * Authenticated: create a payment order for a plan upgrade.
 * Body: { plan, interval?, channel }
 */
export async function createOrder(req: Request, res: Response) {
  try {
    const userId = res.locals.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { plan, interval, channel, subscriptionChannel } = req.body ?? {};
    if (!plan || !channel) {
      return res.status(400).json({ message: "plan and channel are required" });
    }
    if (!isChannel(channel)) {
      return res.status(400).json({ message: "Invalid channel" });
    }
    const orderInterval: PaymentOrderInterval = interval === "annual" ? "annual" : "monthly";

    // Validate subscriptionChannel if provided.
    let subChannel: SubscriptionChannel | undefined;
    if (subscriptionChannel) {
      if (!["telegram", "online", "platform"].includes(subscriptionChannel)) {
        return res.status(400).json({ message: "Invalid subscriptionChannel" });
      }
      subChannel = subscriptionChannel as SubscriptionChannel;
    }

    const { order, instructions } = await createPaymentOrder(
      userId,
      plan,
      orderInterval,
      channel,
      subChannel,
    );


    return res.status(201).json({ order, instructions });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || "Failed to create order" });
  }
}

/**
 * GET /api/payment/orders
 * Authenticated: list the current user's orders.
 */
export async function getMyOrders(req: Request, res: Response) {
  try {
    const userId = res.locals.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    await expireStaleOrders();
    const orders = await listOrdersForUser(userId);
    return res.status(200).json({ orders });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load orders" });
  }
}

/**
 * GET /api/payment/orders/:orderId
 * Authenticated: get a single order (own order only).
 */
export async function getOrder(req: Request, res: Response) {
  try {
    const userId = res.locals.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { orderId } = req.params;
    const order = await listOrdersForUser(userId).then((orders) =>
      orders.find((o) => o.orderId === orderId),
    );
    if (!order) return res.status(404).json({ message: "Order not found" });

    return res.status(200).json({ order });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load order" });
  }
}

/**
 * POST /api/payment/orders/:orderId/cancel
 * Authenticated: cancel a pending order.
 */
export async function cancelMyOrder(req: Request, res: Response) {
  try {
    const userId = res.locals.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { orderId } = req.params;
    const order = await cancelOrder(orderId, userId);
    return res.status(200).json({ order });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || "Failed to cancel order" });
  }
}

/**
 * GET /api/payment/admin/orders
 * Admin: list all orders, optionally filtered by status.
 */
export async function getAllOrders(req: Request, res: Response) {
  try {
    const { status } = req.query;
    await expireStaleOrders();
    const orders = await listAllOrders({ status: status as string | undefined });
    return res.status(200).json({ orders });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load orders" });
  }
}

/**
 * POST /api/payment/admin/orders/:orderId/paid
 * Admin: mark an order as paid (optionally confirm immediately).
 * Body: { channelReference?, adminNote?, confirm? }
 */
export async function markPaid(req: Request, res: Response) {
  try {
    const adminUserId = res.locals.userId;
    if (!adminUserId) return res.status(401).json({ message: "Unauthorized" });

    const { orderId } = req.params;
    const { channelReference, adminNote, confirm } = req.body ?? {};

    const order = await markOrderPaid(orderId, adminUserId, {
      channelReference,
      adminNote,
      confirm: !!confirm,
    });

    return res.status(200).json({ order });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || "Failed to mark order as paid" });
  }
}

/**
 * POST /api/payment/admin/orders/:orderId/confirm
 * Admin: confirm a paid order and activate the plan.
 * Body: { channelReference?, adminNote? }
 */
export async function confirm(req: Request, res: Response) {
  try {
    const adminUserId = res.locals.userId;
    if (!adminUserId) return res.status(401).json({ message: "Unauthorized" });

    const { orderId } = req.params;
    const { channelReference, adminNote } = req.body ?? {};

    const order = await confirmOrder(orderId, adminUserId, {
      channelReference,
      adminNote,
    });

    return res.status(200).json({ order });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || "Failed to confirm order" });
  }
}

// ─── Top-up packages & token credit ─────────────────────────────

/**
 * GET /api/payment/topup/packages
 * Public: list enabled top-up packages.
 */
export async function getTopUpPackages(req: Request, res: Response) {
  try {
    const packages = await listEnabledTopUpPackages();
    return res.status(200).json({ packages });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load top-up packages" });
  }
}

/**
 * GET /api/payment/credits
 * Authenticated: current user's token balance.
 */
export async function getMyCredits(req: Request, res: Response) {
  try {
    const userId = res.locals.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const balance = await getTokenBalance(userId);
    return res.status(200).json({ balance });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load credits" });
  }
}

/**
 * POST /api/payment/topup/order
 * Authenticated: create a token top-up order.
 * Body: { packageId, channel }
 */
export async function createTopUpOrderHandler(req: Request, res: Response) {
  try {
    const userId = res.locals.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { packageId, channel } = req.body ?? {};
    if (!packageId || !channel) {
      return res.status(400).json({ message: "packageId and channel are required" });
    }
    if (!isChannel(channel)) {
      return res.status(400).json({ message: "Invalid channel" });
    }

    const result = await createTopUpOrder(userId, packageId, channel);
    return res.status(201).json(result);
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || "Failed to create top-up order" });
  }
}

/**
 * GET /api/payment/admin/topup/packages
 * Admin: list all top-up packages.
 */
export async function getTopUpPackagesAdmin(req: Request, res: Response) {
  try {
    const packages = await listAllTopUpPackages();
    return res.status(200).json({ packages });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to load top-up packages" });
  }
}

/**
 * POST /api/payment/admin/topup/packages
 * Admin: create or update a top-up package.
 * Body: { packageId, name, description?, priceUsd, tokens, enabled?, sortOrder? }
 */
export async function saveTopUpPackage(req: Request, res: Response) {
  try {
    const pkg = await upsertTopUpPackage(req.body ?? {});
    return res.status(200).json({ package: pkg });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || "Failed to save top-up package" });
  }
}

/**
 * DELETE /api/payment/admin/topup/packages/:packageId
 * Admin: delete a top-up package.
 */
export async function removeTopUpPackage(req: Request, res: Response) {
  try {
    const { packageId } = req.params;
    await deleteTopUpPackage(packageId);
    return res.status(200).json({ message: `Top-up package "${packageId}" deleted` });
  } catch (error: any) {
    return res.status(400).json({ message: error?.message || "Failed to delete top-up package" });
  }
}

/**
 * POST /api/payment/admin/topup/credit
 * Admin: manually credit tokens to a user (used for manual top-ups).
 * Body: { userId, tokens, note? }
 */
export async function adminCreditTokens(req: Request, res: Response) {
  try {
    const adminUserId = res.locals.userId;
    if (!adminUserId) return res.status(401).json({ message: "Unauthorized" });

    const { userId, tokens } = req.body ?? {};
    if (!userId || !tokens || Number(tokens) <= 0) {
      return res.status(400).json({ message: "userId and tokens are required" });
    }
    await creditTokensToUser(userId, Number(tokens));
    const balance = await getTokenBalance(userId);
    return res.status(200).json({
      message: `Credited ${Number(tokens)} tokens`,
      balance,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || "Failed to credit tokens" });
  }
}
