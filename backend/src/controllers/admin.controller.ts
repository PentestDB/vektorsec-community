import { Request, Response } from "express";
import bcrypt from "bcrypt";
import UserModel from "../models/User/User.model";
import SessionsModel from "../models/Sessions/Sessions.model";
import PaymentOrderModel from "../models/PaymentOrder/PaymentOrder.model";

import SubscriptionModel from "../models/Subscription/Subscription.model";
import CouponModel from "../models/Coupons/Coupon.model";
import AuditLogModel from "../models/AuditLog/AuditLog.model";
import TelegramUserModel from "../models/TelegramUser/TelegramUser.model";
import UsageRecordModel from "../models/UsageRecord/UsageRecord.model";
import { logAuditFromRequest } from "../services/audit.service";
import { createMcpToken } from "../services/mcp-auth.service";
import { readEnvFile, updateEnvVars, deleteEnvVars } from "../utils/envWriter";
import { reloadEnv } from "../utils/loadConfig";
import { parseScopeString } from "../utils/scopeValidator";
import {
  getScopeGuardState,
  scopeGuardNotice,
  scopeGuardUnlockFailureDetail,
  scopeGuardUnlockWarning,
  SECURITY_CONTACT_URL,
  type ScopeGuardState,
} from "../utils/securityPolicy";



// ─── Scope Guard policy payload ─────────────────────────────────────

/**
 * Shared `scope` payload for GET/PUT `/api/admin/scope`.
 *
 * `locked` is the authoritative backend state (utils/securityPolicy.ts). The
 * `unlock` block explains an attempt that did **not** succeed — which of the
 * three conditions is still missing, the token verdict — so Admin → Security /
 * Admin → Scope can show the exact reason instead of a generic "locked".
 */
function buildScopePayload(env: Record<string, string | undefined>) {
  const state: ScopeGuardState = getScopeGuardState();
  return {
    enabled: state.locked || env.SCOPE_ENABLED === "1",
    strictMode: env.SCOPE_STRICT_MODE === "1",
    entriesRaw: env.SCOPE_ENTRIES || "",
    entries: parseScopeString(env.SCOPE_ENTRIES || ""),
    locked: state.locked,
    notice: scopeGuardNotice(state),
    contactUrl: SECURITY_CONTACT_URL,
    unlock: {
      attempted: state.unlockFailed,
      lockFlagOff: state.lockFlagOff,
      uiBuildUnlocked: state.uiBuildUnlocked,
      tokenPresent: state.token.present,
      tokenValid: state.token.valid,
      tokenMode: state.token.mode ?? null,
      tokenReason: state.token.reason ?? null,
      tokenClient: state.token.client ?? null,
      tokenExpiresAt: state.token.expiresAt ?? null,
      reason: state.reason,
      detail: state.unlockFailed ? scopeGuardUnlockFailureDetail(state) : null,
      message: scopeGuardUnlockWarning(state),
    },
  };
}

// ─── Dashboard Stats ────────────────────────────────────────────────

export const getDashboardStats = async (_req: Request, res: Response) => {
  try {
    const [
      totalUsers,
      activeUsers,
      blockedUsers,
      totalOrders,
      pendingOrders,
      confirmedOrders,
      totalRevenue,
      activeSubscriptions,
      totalTelegramUsers,
      totalPentestTasks,
      activeBotUsers24h,
      usageToday,
    ] = await Promise.all([
      UserModel.countDocuments(),
      UserModel.countDocuments({ isBlocked: { $ne: true } }),
      UserModel.countDocuments({ isBlocked: true }),
      PaymentOrderModel.countDocuments(),
      PaymentOrderModel.countDocuments({ status: "pending" }),
      PaymentOrderModel.countDocuments({ status: "confirmed" }),
      PaymentOrderModel.aggregate([
        { $match: { status: "confirmed" } },
        { $group: { _id: null, total: { $sum: "$amountUsd" } } },
      ]),
      SubscriptionModel.countDocuments({ status: "active" }),
      TelegramUserModel.countDocuments(),
      SessionsModel.countDocuments({ "messages.role": "tool" }),
      TelegramUserModel.countDocuments({
        lastSeenAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) },
      }),
      (async () => {
        const todayKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(
          new Date().getDate(),
        ).padStart(2, "0")}`;
        const records = await UsageRecordModel.find({ date: todayKey });
        return records.reduce(
          (acc, r) => {
            acc.requests += r.requests ?? 0;
            acc.tokensIn += r.tokensIn ?? 0;
            acc.tokensOut += r.tokensOut ?? 0;
            acc.costUsd += r.costUsd ?? 0;
            return acc;
          },
          { requests: 0, tokensIn: 0, tokensOut: 0, costUsd: 0 },
        );
      })(),
    ]);

    // Recent orders
    const recentOrders = await PaymentOrderModel.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("userId", "name email");

    // Recent users
    const recentUsers = await UserModel.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select("name email role plan isBlocked createdAt");

    return res.status(200).json({
      totalUsers,
      activeUsers,
      blockedUsers,
      totalOrders,
      pendingOrders,
      confirmedOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
      activeSubscriptions,
      totalTelegramUsers,
      // ── Pentest analytics metrics ───────────────────────────────
      totalPentestTasks,
      activeBotUsers24h,
      usageToday,
      recentOrders: recentOrders.map((o) => ({
        orderId: o.orderId,
        user: (o.userId as any)?.name || "Unknown",
        email: (o.userId as any)?.email || "",
        plan: o.plan,
        amountUsd: o.amountUsd,
        status: o.status,
        createdAt: o.createdAt,
      })),
      recentUsers: recentUsers.map((u) => ({
        uid: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        plan: u.plan,
        isBlocked: u.isBlocked,
        createdAt: (u as any).createdAt,
      })),
    });
  } catch (error) {
    console.error("[admin] getDashboardStats error:", error);
    return res.status(500).json({ message: "Failed to get dashboard stats" });
  }
};


// ─── User Management ────────────────────────────────────────────────

export const listUsers = async (req: Request, res: Response) => {
  try {
    const { search, role, plan, status, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));

    const filter: any = {};
    if (search) {
      const s = String(search);
      filter.$or = [
        { name: { $regex: s, $options: "i" } },
        { email: { $regex: s, $options: "i" } },
      ];
    }
    if (role) filter.role = role;
    if (plan) filter.plan = plan;
    if (status === "blocked") filter.isBlocked = true;
    if (status === "active") filter.isBlocked = { $ne: true };

    const [users, total] = await Promise.all([
      UserModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .select("name email role plan isBlocked blockedAt blockedReason firstLogin twoFactorEnabled createdAt lastLoginAt credits creditsUsed"),
      UserModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      users: users.map((u) => ({
        uid: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        plan: u.plan,
        isBlocked: u.isBlocked,
        blockedAt: u.blockedAt,
        blockedReason: u.blockedReason,
        firstLogin: u.firstLogin,
        twoFactorEnabled: u.twoFactorEnabled,
        createdAt: (u as any).createdAt,
        credits: u.credits,
        creditsUsed: u.creditsUsed,

      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("[admin] listUsers error:", error);
    return res.status(500).json({ message: "Failed to list users" });
  }
};

export const blockUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body || {};

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Prevent blocking yourself or other admins
    if (user.role === "admin") {
      return res.status(400).json({ message: "Cannot block an admin user" });
    }

    user.isBlocked = true;
    user.blockedAt = new Date();
    user.blockedReason = reason || "Blocked by admin";
    await user.save();

    await logAuditFromRequest(req, res, "admin.user_management", {
      resourceType: "user",
      resourceId: userId,
      details: { action: "block", reason },
    });


    return res.status(200).json({ message: "User blocked successfully" });
  } catch (error) {
    console.error("[admin] blockUser error:", error);
    return res.status(500).json({ message: "Failed to block user" });
  }
};

export const unblockUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isBlocked = false;
    user.blockedAt = undefined;
    user.blockedReason = undefined;
    await user.save();

    await logAuditFromRequest(req, res, "admin.user_management", {
      resourceType: "user",
      resourceId: userId,
      details: { action: "unblock" },
    });


    return res.status(200).json({ message: "User unblocked successfully" });
  } catch (error) {
    console.error("[admin] unblockUser error:", error);
    return res.status(500).json({ message: "Failed to unblock user" });
  }
};

export const updateUserRole = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!["admin", "pentester", "viewer", "user"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }


    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Prevent demoting yourself
    if (userId === res.locals.userId && role !== "admin") {
      return res.status(400).json({ message: "Cannot change your own role" });
    }

    user.role = role;
    await user.save();

    await logAuditFromRequest(req, res, "user.role_changed", {
      resourceType: "user",
      resourceId: userId,
      details: { newRole: role },
    });


    return res.status(200).json({ message: "User role updated", role });
  } catch (error) {
    console.error("[admin] updateUserRole error:", error);
    return res.status(500).json({ message: "Failed to update user role" });
  }
};

export const updateUserPlan = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { plan, planExpiresAt } = req.body;

    if (!["free", "pro", "team", "enterprise"].includes(plan)) {
      return res.status(400).json({ message: "Invalid plan" });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.plan = plan;
    if (planExpiresAt) {
      user.planExpiresAt = new Date(planExpiresAt);
    } else if (plan === "free") {
      user.planExpiresAt = undefined;
    }
    await user.save();

    await logAuditFromRequest(req, res, "billing.subscription_changed", {
      resourceType: "user",
      resourceId: userId,
      details: { plan },
    });


    return res.status(200).json({ message: "User plan updated", plan });
  } catch (error) {
    console.error("[admin] updateUserPlan error:", error);
    return res.status(500).json({ message: "Failed to update user plan" });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (userId === res.locals.userId) {
      return res.status(400).json({ message: "Cannot delete your own account" });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "admin") {
      return res.status(400).json({ message: "Cannot delete an admin user" });
    }

    await UserModel.findByIdAndDelete(userId);

    await logAuditFromRequest(req, res, "user.deleted", {
      resourceType: "user",
      resourceId: userId,
      details: { email: user.email },
    });


    return res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("[admin] deleteUser error:", error);
    return res.status(500).json({ message: "Failed to delete user" });
  }
};

export const resetUserPassword = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || typeof newPassword !== "string") {
      return res.status(400).json({ message: "New password is required" });
    }

    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ message: "New password must be at least 8 characters" });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    await logAuditFromRequest(req, res, "user.password_reset", {
      resourceType: "user",
      resourceId: userId,
      details: { email: user.email, by: res.locals.user?.email || res.locals.userId },
    });

    return res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("[admin] resetUserPassword error:", error);
    return res.status(500).json({ message: "Failed to reset user password" });
  }
};

const VALID_USER_ROLES = ["admin", "pentester", "viewer"];
const VALID_USER_PLANS = ["free", "pro", "team", "enterprise"];

/**
 * POST /admin/users
 * Create a new user account directly from the admin panel (add user).
 */
export const createUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role = "pentester", plan = "free" } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    if (!/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,20})+$/.test(cleanEmail)) {
      return res.status(400).json({ message: "Invalid email address" });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }
    if (!VALID_USER_ROLES.includes(role)) {
      return res.status(400).json({ message: `Role must be one of: ${VALID_USER_ROLES.join(", ")}` });
    }
    if (!VALID_USER_PLANS.includes(plan)) {
      return res.status(400).json({ message: `Plan must be one of: ${VALID_USER_PLANS.join(", ")}` });
    }

    const existing = await UserModel.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({ message: "A user with this email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new UserModel({
      name: String(name).trim(),
      email: cleanEmail,
      password: hashedPassword,
      role,
      plan,
      firstLogin: true,
    });
    await user.save();

    await logAuditFromRequest(req, res, "user.created", {
      resourceType: "user",
      resourceId: user._id,
      details: { email: user.email, role: user.role, plan: user.plan },
    });

    return res.status(201).json({ message: "User created successfully", uid: user._id });
  } catch (error: any) {
    console.error("[admin] createUser error:", error);
    if (error?.code === 11000) {
      return res.status(409).json({ message: "A user with this email already exists" });
    }
    return res.status(500).json({ message: "Failed to create user" });
  }
};

/**
 * POST /admin/users/:userId/reset-2fa
 * Disable two-factor authentication for a user (e.g. lost authenticator).
 */
export const resetUserTwoFactor = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    await user.save();

    await logAuditFromRequest(req, res, "user.two_factor_reset", {
      resourceType: "user",
      resourceId: userId,
      details: { email: user.email, by: res.locals.user?.email || res.locals.userId },
    });

    return res.status(200).json({ message: "Two-factor authentication reset for this user" });
  } catch (error) {
    console.error("[admin] resetUserTwoFactor error:", error);
    return res.status(500).json({ message: "Failed to reset 2FA" });
  }
};

// ─── Reports ────────────────────────────────────────────────────────

export const getReports = async (req: Request, res: Response) => {
  try {
    const { period = "30d" } = req.query;
    const days = period === "7d" ? 7 : period === "90d" ? 90 : period === "365d" ? 365 : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Revenue by day
    const revenueByDay = await PaymentOrderModel.aggregate([
      { $match: { status: "confirmed", confirmedAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$confirmedAt" } },
          total: { $sum: "$amountUsd" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Orders by status
    const ordersByStatus = await PaymentOrderModel.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    // Orders by channel
    const ordersByChannel = await PaymentOrderModel.aggregate([
      { $group: { _id: "$channel", count: { $sum: 1 } } },
    ]);

    // New users by day
    const newUsersByDay = await UserModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Top plans
    const topPlans = await PaymentOrderModel.aggregate([
      { $match: { status: "confirmed" } },
      { $group: { _id: "$plan", total: { $sum: "$amountUsd" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 10 },
    ]);

    // Subscriptions by channel
    const subscriptionsByChannel = await SubscriptionModel.aggregate([
      { $group: { _id: "$channel", count: { $sum: 1 } } },
    ]);

    // Total revenue in period
    const totalRevenueAgg = await PaymentOrderModel.aggregate([
      { $match: { status: "confirmed", confirmedAt: { $gte: since } } },
      { $group: { _id: null, total: { $sum: "$amountUsd" } } },
    ]);

    // New users in period
    const newUsers = await UserModel.countDocuments({ createdAt: { $gte: since } });

    // New orders in period
    const newOrders = await PaymentOrderModel.countDocuments({ createdAt: { $gte: since } });

    // Revenue by plan
    const revenueByPlanAgg = await PaymentOrderModel.aggregate([
      { $match: { status: "confirmed" } },
      { $group: { _id: "$plan", total: { $sum: "$amountUsd" } } },
    ]);

    // Revenue by channel
    const revenueByChannelAgg = await PaymentOrderModel.aggregate([
      { $match: { status: "confirmed" } },
      { $group: { _id: "$channel", total: { $sum: "$amountUsd" } } },
    ]);

    const totalRevenue = totalRevenueAgg[0]?.total || 0;
    const conversionRate = newUsers > 0 ? Math.round((newOrders / newUsers) * 100) : 0;

    const revenueByPlan: Record<string, number> = {};
    revenueByPlanAgg.forEach((r) => {
      revenueByPlan[r._id] = r.total;
    });

    const revenueByChannel: Record<string, number> = {};
    revenueByChannelAgg.forEach((r) => {
      revenueByChannel[r._id] = r.total;
    });

    // ── Usage records (per-user usage in period) ───────────────────
    const usageRecords = await UsageRecordModel.aggregate([
      { $match: { date: { $gte: since.toISOString().slice(0, 10) } } },
      {
        $group: {
          _id: "$userId",
          requests: { $sum: "$requests" },
          tokensIn: { $sum: "$tokensIn" },
          tokensOut: { $sum: "$tokensOut" },
          costUsd: { $sum: "$costUsd" },
        },
      },
      { $sort: { requests: -1 } },
      { $limit: 50 },
    ]);

    // Map usage records to user names/emails.
    const usageUserIds = usageRecords.map((r) => r._id);
    const usageUsers = usageUserIds.length
      ? await UserModel.find({ _id: { $in: usageUserIds } }).select("name email")
      : [];
    const usageUserMap = new Map(usageUsers.map((u) => [u._id.toString(), u]));

    const usage = usageRecords.map((r) => ({
      userId: r._id,
      name: usageUserMap.get(r._id.toString())?.name || "Unknown",
      email: usageUserMap.get(r._id.toString())?.email || "",
      requests: r.requests,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      totalTokens: r.tokensIn + r.tokensOut,
      costUsd: r.costUsd,
    }));

    // ── Activity log (recent audit entries with IP) ────────────────
    const activity = await AuditLogModel.find({ createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .limit(100)
      .select("userId email action resourceType resourceId ip userAgent details createdAt");

    const activityUserIds = [...new Set(activity.map((a) => a.userId).filter(Boolean))];
    const activityUsers = activityUserIds.length
      ? await UserModel.find({ _id: { $in: activityUserIds } }).select("name email")
      : [];
    const activityUserMap = new Map(activityUsers.map((u) => [u._id.toString(), u]));

    const activityLog = activity.map((a) => ({
      id: a._id,
      userId: a.userId,
      name: a.userId ? activityUserMap.get(String(a.userId))?.name || "Unknown" : "System",
      email: a.email || (a.userId ? activityUserMap.get(String(a.userId))?.email || "" : ""),
      action: a.action,
      resourceType: a.resourceType,
      resourceId: a.resourceId,
      ip: a.ip,
      userAgent: a.userAgent,
      details: a.details,
      createdAt: a.createdAt,
    }));

    return res.status(200).json({
      period,
      totalRevenue,
      newUsers,
      newOrders,
      conversionRate,
      revenueByPlan,
      revenueByChannel,
      revenueByDay,
      ordersByStatus,
      ordersByChannel,
      newUsersByDay,
      topPlans,
      subscriptionsByChannel,
      usage,
      activity: activityLog,
    });


  } catch (error) {
    console.error("[admin] getReports error:", error);
    return res.status(500).json({ message: "Failed to get reports" });
  }
};

// ─── Coupon Management ──────────────────────────────────────────────

export const listCoupons = async (_req: Request, res: Response) => {
  try {
    const coupons = await CouponModel.find().sort({ createdAt: -1 });
    return res.status(200).json({ coupons });
  } catch (error) {
    console.error("[admin] listCoupons error:", error);
    return res.status(500).json({ message: "Failed to list coupons" });
  }
};

export const createCoupon = async (req: Request, res: Response) => {
  try {
    const { couponIds, creditAmount, exploitBoxAmount, expiryDate, status, description, maxRedeem } = req.body;

    if (!couponIds || !Array.isArray(couponIds) || couponIds.length === 0) {
      return res.status(400).json({ message: "couponIds must be a non-empty array" });
    }

    const coupon = new CouponModel({
      couponIds,
      creditAmount: creditAmount || 0,
      exploitBoxAmount: exploitBoxAmount || 0,
      expiryDate: expiryDate ? new Date(expiryDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: status || "active",
      description: description || "",
      maxRedeem: maxRedeem || 10,
    });

    await coupon.save();

    await logAuditFromRequest(req, res, "billing.coupon_redeemed", {
      resourceType: "coupon",
      resourceId: coupon._id.toString(),
      details: { action: "create", couponIds },
    });


    return res.status(201).json({ message: "Coupon created", coupon });
  } catch (error) {
    console.error("[admin] createCoupon error:", error);
    return res.status(500).json({ message: "Failed to create coupon" });
  }
};

export const updateCoupon = async (req: Request, res: Response) => {
  try {
    const { couponId } = req.params;
    const updates = req.body;

    const coupon = await CouponModel.findById(couponId);
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    if (updates.couponIds) coupon.couponIds = updates.couponIds;
    if (updates.creditAmount !== undefined) coupon.creditAmount = updates.creditAmount;
    if (updates.exploitBoxAmount !== undefined) coupon.exploitBoxAmount = updates.exploitBoxAmount;
    if (updates.expiryDate) coupon.expiryDate = new Date(updates.expiryDate);
    if (updates.status) coupon.status = updates.status;
    if (updates.description !== undefined) coupon.description = updates.description;
    if (updates.maxRedeem !== undefined) coupon.maxRedeem = updates.maxRedeem;

    await coupon.save();

    return res.status(200).json({ message: "Coupon updated", coupon });
  } catch (error) {
    console.error("[admin] updateCoupon error:", error);
    return res.status(500).json({ message: "Failed to update coupon" });
  }
};

export const deleteCoupon = async (req: Request, res: Response) => {
  try {
    const { couponId } = req.params;

    const coupon = await CouponModel.findByIdAndDelete(couponId);
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    return res.status(200).json({ message: "Coupon deleted" });
  } catch (error) {
    console.error("[admin] deleteCoupon error:", error);
    return res.status(500).json({ message: "Failed to delete coupon" });
  }
};

// ─── Audit Logs ─────────────────────────────────────────────────────

export const listAuditLogs = async (req: Request, res: Response) => {
  try {
    const { action, userId, page = "1", limit = "50" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 50));

    const filter: any = {};
    if (action) filter.action = action;
    if (userId) filter.userId = userId;

    const [logs, total] = await Promise.all([
      AuditLogModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      AuditLogModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      logs,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("[admin] listAuditLogs error:", error);
    return res.status(500).json({ message: "Failed to list audit logs" });
  }
};

// ─── System Settings ────────────────────────────────────────────────

export const getSystemSettings = async (_req: Request, res: Response) => {
  try {
    const env = readEnvFile();
    return res.status(200).json({
      settings: {
        deployment: env.DEPLOYMENT || "LOCAL",
        mongoUri: env.MONGO_URI ? "configured" : "not set",
        redisUrl: env.REDIS_URL ? "configured" : "not set",
        telegramBotToken: env.TELEGRAM_BOT_TOKEN ? "configured" : "not set",
        pentestMcpAllowDangerous: env.PENTEST_MCP_ALLOW_DANGEROUS === "1",
        pentestMcpMaxOutputChars: Number(env.PENTEST_MCP_MAX_OUTPUT_CHARS || 60000),
        anthropicOAuthConnected: !!env.ANTHROPIC_OAUTH_ACCESS_TOKEN,
        siteName: env.SITE_NAME || "VektorSec",
        siteSubtitle: env.SITE_SUBTITLE || "",
        loginDisclaimer: env.LOGIN_DISCLAIMER || "",
        supportEmail: env.SUPPORT_EMAIL || "",
        maintenanceMode: env.MAINTENANCE_MODE === "1",
        allowRegistration: env.ALLOW_REGISTRATION !== "0",
        logRetentionDays: Number(env.LOG_RETENTION_DAYS || 30),
        defaultModel: env.DEFAULT_MODEL || "",
        telegramAutoApprove: env.TELEGRAM_AUTO_APPROVE === "1",
        telegramAdminChatId: env.TELEGRAM_ADMIN_CHAT_ID || "",
        scanTimeoutMinutes: Number(env.SCAN_TIMEOUT_MINUTES || 30),
        scopeBlacklist: env.SCOPE_BLACKLIST_ENTRIES || "",
        // ─── SEO / Sitemap (consumed by the frontend at runtime) ─────
        seoTitle: env.SEO_TITLE || "",
        seoDescription: env.SEO_DESCRIPTION || "",
        seoKeywords: env.SEO_KEYWORDS || "",
        seoSiteUrl: env.SEO_SITE_URL || "",
        seoOgImage: env.SEO_OG_IMAGE || "",
        seoTwitterHandle: env.SEO_TWITTER_HANDLE || "",
        seoIndexing: env.SEO_INDEXING !== "0",
        seoSitemapEnabled: env.SEO_SITEMAP_ENABLED !== "0",
        seoRobotsExtraDisallow: env.SEO_ROBOTS_EXTRA_DISALLOW || "",
        seoSitemapExtraRoutes: env.SEO_SITEMAP_EXTRA_ROUTES || "",
        // ─── Security ────────────────────────────────────────────────
        ssrfEnabled: env.SSRF_ENABLED !== "0",
        securityHeadersEnabled: env.SECURITY_HEADERS_ENABLED !== "0",
      },
    });
  } catch (error) {
    console.error("[admin] getSystemSettings error:", error);
    return res.status(500).json({ message: "Failed to get system settings" });
  }
};

export const updateSystemSettings = async (req: Request, res: Response) => {
  try {
    const {
      pentestMcpAllowDangerous,
      pentestMcpMaxOutputChars,
      siteName,
      siteSubtitle,
      loginDisclaimer,
      supportEmail,
      maintenanceMode,
      allowRegistration,
      logRetentionDays,
      defaultModel,
      telegramAutoApprove,
      telegramAdminChatId,
      scanTimeoutMinutes,
      scopeBlacklist,
      // SEO / sitemap
      seoTitle,
      seoDescription,
      seoKeywords,
      seoSiteUrl,
      seoOgImage,
      seoTwitterHandle,
      seoIndexing,
      seoSitemapEnabled,
      seoRobotsExtraDisallow,
      seoSitemapExtraRoutes,
      // Security
      ssrfEnabled,
      securityHeadersEnabled,
    } = req.body;

    const updates: Record<string, string> = {};
    if (typeof pentestMcpAllowDangerous === "boolean") {
      updates.PENTEST_MCP_ALLOW_DANGEROUS = pentestMcpAllowDangerous ? "1" : "0";
    }
    if (pentestMcpMaxOutputChars !== undefined) {
      updates.PENTEST_MCP_MAX_OUTPUT_CHARS = String(pentestMcpMaxOutputChars);
    }
    if (siteName !== undefined) {
      updates.SITE_NAME = String(siteName);
    }
    if (siteSubtitle !== undefined) {
      updates.SITE_SUBTITLE = String(siteSubtitle);
    }
    if (loginDisclaimer !== undefined) {
      updates.LOGIN_DISCLAIMER = String(loginDisclaimer);
    }
    if (supportEmail !== undefined) {
      updates.SUPPORT_EMAIL = String(supportEmail);
    }
    if (typeof maintenanceMode === "boolean") {
      updates.MAINTENANCE_MODE = maintenanceMode ? "1" : "0";
    }
    if (typeof allowRegistration === "boolean") {
      updates.ALLOW_REGISTRATION = allowRegistration ? "1" : "0";
    }
    if (logRetentionDays !== undefined) {
      updates.LOG_RETENTION_DAYS = String(logRetentionDays);
    }
    if (defaultModel !== undefined) {
      updates.DEFAULT_MODEL = String(defaultModel).trim();
    }
    if (typeof telegramAutoApprove === "boolean") {
      updates.TELEGRAM_AUTO_APPROVE = telegramAutoApprove ? "1" : "0";
    }
    if (telegramAdminChatId !== undefined) {
      updates.TELEGRAM_ADMIN_CHAT_ID = String(telegramAdminChatId).trim();
    }
    if (scanTimeoutMinutes !== undefined) {
      updates.SCAN_TIMEOUT_MINUTES = String(scanTimeoutMinutes);
    }
    if (scopeBlacklist !== undefined) {
      updates.SCOPE_BLACKLIST_ENTRIES = String(scopeBlacklist).trim();
    }
    // ─── SEO / Sitemap ───────────────────────────────────────────────
    if (seoTitle !== undefined) updates.SEO_TITLE = String(seoTitle).trim();
    if (seoDescription !== undefined) updates.SEO_DESCRIPTION = String(seoDescription).trim();
    if (seoKeywords !== undefined) updates.SEO_KEYWORDS = String(seoKeywords).trim();
    if (seoSiteUrl !== undefined) updates.SEO_SITE_URL = String(seoSiteUrl).trim();
    if (seoOgImage !== undefined) updates.SEO_OG_IMAGE = String(seoOgImage).trim();
    if (seoTwitterHandle !== undefined) updates.SEO_TWITTER_HANDLE = String(seoTwitterHandle).trim();
    if (typeof seoIndexing === "boolean") updates.SEO_INDEXING = seoIndexing ? "1" : "0";
    if (typeof seoSitemapEnabled === "boolean") updates.SEO_SITEMAP_ENABLED = seoSitemapEnabled ? "1" : "0";
    if (seoRobotsExtraDisallow !== undefined) updates.SEO_ROBOTS_EXTRA_DISALLOW = String(seoRobotsExtraDisallow).trim();
    if (seoSitemapExtraRoutes !== undefined) updates.SEO_SITEMAP_EXTRA_ROUTES = String(seoSitemapExtraRoutes).trim();
    // ─── Security ────────────────────────────────────────────────────
    if (typeof ssrfEnabled === "boolean") updates.SSRF_ENABLED = ssrfEnabled ? "1" : "0";
    if (typeof securityHeadersEnabled === "boolean") updates.SECURITY_HEADERS_ENABLED = securityHeadersEnabled ? "1" : "0";

    if (Object.keys(updates).length > 0) {
      updateEnvVars(updates);
      // Reload process.env so backend security toggles (e.g. SSRF_ENABLED)
      // take effect immediately without a restart.
      reloadEnv();
    }

    await logAuditFromRequest(req, res, "admin.system_settings", {
      resourceType: "system",
      details: { updated: Object.keys(updates) },
    });


    return res.status(200).json({ message: "System settings updated" });
  } catch (error) {
    console.error("[admin] updateSystemSettings error:", error);
    return res.status(500).json({ message: "Failed to update system settings" });
  }
};


// ─── Token Management (Admin) ───────────────────────────────────────

export const listAllMcpTokens = async (_req: Request, res: Response) => {
  try {
    const users = await UserModel.find({ "configs.mcpTokens.0": { $exists: true } })
      .select("name email configs.mcpTokens mcpTokenLimit")
      .limit(200);

    const tokens = users.flatMap((u) =>
      (u.configs.mcpTokens || []).map((t: any) => ({
        tokenId: t.tokenId,
        label: t.label,
        createdAt: t.createdAt,
        lastUsedAt: t.lastUsedAt,
        revokedAt: t.revokedAt || null,
        userId: u._id,
        userName: u.name,
        userEmail: u.email,
        tokenLimit: u.mcpTokenLimit ?? null,
      })),
    );

    tokens.sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return tb - ta;
    });

    return res.status(200).json({ tokens });
  } catch (error) {
    console.error("[admin] listAllMcpTokens error:", error);
    return res.status(500).json({ message: "Failed to list MCP tokens" });
  }
};

/**
 * Admin creates an MCP token on behalf of a user.
 * Body: { label?: string }
 */
export const createUserMcpToken = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { label } = req.body || {};

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const created = await createMcpToken(user, label || "Admin created");

    await logAuditFromRequest(req, res, "mcp.token_created", {
      resourceType: "user",
      resourceId: userId,
      details: { tokenId: created.tokenId, label: created.label },
    });

    return res.status(201).json({
      message: "MCP token created",
      token: {
        tokenId: created.tokenId,
        label: created.label,
        token: created.token,
        createdAt: created.createdAt,
      },
    });
  } catch (error) {
    console.error("[admin] createUserMcpToken error:", error);
    return res.status(500).json({ message: "Failed to create MCP token" });
  }
};

/**
 * Admin sets the MCP token limit override for a user.
 * Body: { limit?: number | null }
 */
export const setUserMcpTokenLimit = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { limit } = req.body || {};

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (limit === null || limit === undefined || limit === "") {
      user.mcpTokenLimit = undefined;
    } else {
      const num = Math.max(0, Math.floor(Number(limit)));
      if (Number.isNaN(num)) {
        return res.status(400).json({ message: "limit must be a valid number" });
      }
      user.mcpTokenLimit = num;
    }

    await user.save();

    await logAuditFromRequest(req, res, "mcp.token_limit_updated", {
      resourceType: "user",
      resourceId: userId,
      details: { limit: user.mcpTokenLimit ?? null },
    });

    return res.status(200).json({
      message: "MCP token limit updated",
      limit: user.mcpTokenLimit ?? null,
    });
  } catch (error) {
    console.error("[admin] setUserMcpTokenLimit error:", error);
    return res.status(500).json({ message: "Failed to update MCP token limit" });
  }
};


export const revokeUserMcpToken = async (req: Request, res: Response) => {
  try {
    const { userId, tokenId } = req.params;

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const tokens = user.configs.mcpTokens || [];
    const token = tokens.find((t: any) => t.tokenId === tokenId);
    if (!token) {
      return res.status(404).json({ message: "Token not found" });
    }

    token.revokedAt = new Date();
    await user.save();

    await logAuditFromRequest(req, res, "mcp.token_revoked", {
      resourceType: "user",
      resourceId: userId,
      details: { tokenId },
    });


    return res.status(200).json({ message: "Token revoked" });
  } catch (error) {
    console.error("[admin] revokeUserMcpToken error:", error);
    return res.status(500).json({ message: "Failed to revoke token" });
  }
};

// ─── Scope / Whitelist Management ───────────────────────────────────

export const getScopeConfig = async (_req: Request, res: Response) => {
  try {
    const env = readEnvFile();
    return res.status(200).json({ scope: buildScopePayload(env) });
  } catch (error) {
    console.error("[admin] getScopeConfig error:", error);
    return res.status(500).json({ message: "Failed to get scope config" });
  }
};

export const updateScopeConfig = async (req: Request, res: Response) => {
  try {
    const { enabled, strictMode, entriesRaw } = req.body || {};

    const updates: Record<string, string> = {};

    // Locked instances (utils/securityPolicy.ts): an explicit "disable" is
    // recorded and refused, never written to the env. Unlocked instances behave
    // as before. A partial unlock attempt (flag set, token missing/invalid)
    // keeps `locked = true`, so it is refused here as well.
    const locked = getScopeGuardState().locked;
    const disableRefused = locked && enabled === false;
    if (typeof enabled === "boolean" && !disableRefused) updates.SCOPE_ENABLED = enabled ? "1" : "0";
    if (typeof strictMode === "boolean") updates.SCOPE_STRICT_MODE = strictMode ? "1" : "0";
    if (typeof entriesRaw === "string") updates.SCOPE_ENTRIES = entriesRaw.trim();
    // Self-heal a stale "off" left behind by an older build.
    if (locked) updates.SCOPE_ENABLED = "1";

    if (Object.keys(updates).length > 0) {
      updateEnvVars(updates);
      reloadEnv();
    }

    const env = readEnvFile();
    const scope = buildScopePayload(env);
    const { unlock } = scope;

    await logAuditFromRequest(req, res, "admin.scope_config", {
      resourceType: "system",
      details: {
        updated: Object.keys(updates),
        entryCount: parseScopeString(entriesRaw ?? "").length,
        disableRefused,
        unlockAttempted: unlock.attempted,
        unlockFailedReason: unlock.attempted ? unlock.reason : null,
      },
    });

    // Tell the operator exactly what happened: "I set SCOPE_GUARD_LOCK=0 but the
    // page is still locked" is the most common support ticket, and it is almost
    // always an invalid/missing unlock token.
    const message = disableRefused
      ? `Scope Guard cannot be disabled in this build. Contact ${SECURITY_CONTACT_URL} for a build without it.`
      : unlock.attempted
        ? unlock.message ??
          "Scope Guard unlock attempt failed — the guard stays ENABLED (fail-closed)."
        : "Scope config updated";

    return res.status(200).json({ message, scope });
  } catch (error) {
    console.error("[admin] updateScopeConfig error:", error);
    return res.status(500).json({ message: "Failed to update scope config" });
  }
};

// ─── API Keys / Provider Settings ───────────────────────────────────

// Provider key metadata: env var name → display info.
// Icons are intentionally empty strings — emoji (surrogate-pair characters)
// break when copied/pasted between editors, so we keep the UI free of them.
const API_KEYS_CATALOG: { key: string; label: string; icon: string; placeholder: string; isPassword?: boolean }[] = [
  { key: "OPENAI_API_KEY", label: "OpenAI", icon: "", placeholder: "sk-..." },
  { key: "ANTHROPIC_API_KEY", label: "Anthropic", icon: "", placeholder: "sk-ant-..." },
  { key: "DEEPSEEK_API_KEY", label: "DeepSeek", icon: "", placeholder: "sk-..." },
  { key: "SHODAN_API_KEY", label: "Shodan", icon: "", placeholder: "Shodan API key" },
  { key: "VIRUSTOTAL_API_KEY", label: "VirusTotal", icon: "", placeholder: "VirusTotal API key" },
  { key: "NVD_API_KEY", label: "NVD (CVE)", icon: "", placeholder: "NVD API key (optional)" },
  { key: "OLLAMA_BASE_URL", label: "Ollama Base URL", icon: "", placeholder: "http://localhost:11434" },
  { key: "GOOGLE_API_KEY", label: "Google Custom Search", icon: "", placeholder: "Google API key" },
  { key: "CUSTOM_SEARCH_ENGINE_ID", label: "Google CSE ID", icon: "", placeholder: "Search engine ID" },
  { key: "GOOGLE_CLIENT_ID", label: "Google OAuth Client ID", icon: "", placeholder: "Google OAuth client ID" },
  { key: "GOOGLE_CLIENT_SECRET", label: "Google OAuth Client Secret", icon: "", placeholder: "Google OAuth client secret", isPassword: true },
  { key: "GITHUB_CLIENT_ID", label: "GitHub OAuth Client ID", icon: "", placeholder: "GitHub OAuth client ID" },
  { key: "GITHUB_CLIENT_SECRET", label: "GitHub OAuth Client Secret", icon: "", placeholder: "GitHub OAuth client secret", isPassword: true },
  { key: "RECAPTCHA_SITE_KEY", label: "reCAPTCHA Site Key", icon: "", placeholder: "Google reCAPTCHA site key (v2)" },
  { key: "RECAPTCHA_SECRET_KEY", label: "reCAPTCHA Secret Key", icon: "", placeholder: "Google reCAPTCHA secret (v2)", isPassword: true },
  { key: "GITHUB_TOKEN", label: "GitHub Token", icon: "", placeholder: "GitHub personal access token" },
  { key: "CAIDO_PAT", label: "Caido PAT", icon: "", placeholder: "Caido personal access token" },
  { key: "BURP_RPC_PORT", label: "Burp RPC Port", icon: "", placeholder: "50051" },
];

const API_KEY_VALUE_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "DEEPSEEK_API_KEY",
  "SHODAN_API_KEY",
  "VIRUSTOTAL_API_KEY",
  "NVD_API_KEY",
  "GOOGLE_API_KEY",
  "CUSTOM_SEARCH_ENGINE_ID",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "RECAPTCHA_SITE_KEY",
  "RECAPTCHA_SECRET_KEY",
  "GITHUB_TOKEN",
  "CAIDO_PAT",
];

export const getApiKeys = async (_req: Request, res: Response) => {
  try {
    const env = readEnvFile();
    const keys = API_KEYS_CATALOG.map((meta) => ({
      key: meta.key,
      label: meta.label,
      icon: meta.icon,
      placeholder: meta.placeholder,
      isPassword: meta.isPassword,
      // Only expose whether a value is configured — never the secret itself.
      configured: Boolean(env[meta.key]),
    }));
    return res.status(200).json({ keys });
  } catch (error) {
    console.error("[admin] getApiKeys error:", error);
    return res.status(500).json({ message: "Failed to get API keys" });
  }
};

export const updateApiKeys = async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const updates: Record<string, string> = {};

    for (const key of API_KEY_VALUE_KEYS) {
      if (key in body) {
        const val = String(body[key] ?? "").trim();
        if (val) {
          updates[key] = val;
        } else {
          // Empty string clears the key.
          updates[key] = "";
        }
      }
    }

    if (body.OLLAMA_BASE_URL !== undefined) {
      updates.OLLAMA_BASE_URL = String(body.OLLAMA_BASE_URL).trim() || "";
    }
    if (body.BURP_RPC_PORT !== undefined) {
      updates.BURP_RPC_PORT = String(body.BURP_RPC_PORT).trim() || "";
    }

    if (Object.keys(updates).length > 0) {
      updateEnvVars(updates);
      reloadEnv();
    }

    await logAuditFromRequest(req, res, "admin.api_keys_updated", {
      resourceType: "system",
      details: { updated: Object.keys(updates) },
    });

    return res.status(200).json({ message: "API keys updated", updated: Object.keys(updates) });
  } catch (error) {
    console.error("[admin] updateApiKeys error:", error);
    return res.status(500).json({ message: "Failed to update API keys" });
  }
};

// Add clear endpoint for individual keys (POST /admin/api-keys/clear)
export const clearApiKey = async (req: Request, res: Response) => {
  try {
    const { key } = req.body || {};
    if (!key || !API_KEY_VALUE_KEYS.includes(key)) {
      return res.status(400).json({ message: "Invalid or unsupported API key name" });
    }

    deleteEnvVars([key]);
    reloadEnv();

    await logAuditFromRequest(req, res, "admin.api_key_cleared", {
      resourceType: "system",
      details: { key },
    });

    return res.status(200).json({ message: `API key ${key} cleared` });
  } catch (error) {
    console.error("[admin] clearApiKey error:", error);
    return res.status(500).json({ message: "Failed to clear API key" });
  }
};


