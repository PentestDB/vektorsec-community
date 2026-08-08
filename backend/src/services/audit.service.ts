import { Request, Response } from "express";
import AuditLogModel from "../models/AuditLog/AuditLog.model";

/**
 * Log an audit event from an Express request.
 * Uses res.locals.userId / res.locals.user if available.
 */
export async function logAuditFromRequest(
  req: Request,
  res: Response,
  action: string,
  opts: {
    resourceType?: string;
    resourceId?: string;
    details?: Record<string, any>;
  } = {},
) {
  try {
    const userId = res?.locals?.userId || req.session?.user?.userId;
    const user = res?.locals?.user;


    const log = new AuditLogModel({
      userId: userId || undefined,
      email: user?.email || "",
      action,
      resourceType: opts.resourceType,
      resourceId: opts.resourceId,
      details: opts.details,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    await log.save();
  } catch (error) {
    console.error("[audit] Failed to log audit event:", error);
  }
}

/**
 * Log an audit event directly (no request context).
 */
export async function logAudit(
  userId: string | undefined,
  email: string,
  action: string,
  opts: {
    resourceType?: string;
    resourceId?: string;
    details?: Record<string, any>;
    ip?: string;
    userAgent?: string;
  } = {},
) {
  try {
    const log = new AuditLogModel({
      userId: userId || undefined,
      email,
      action,
      resourceType: opts.resourceType,
      resourceId: opts.resourceId,
      details: opts.details,
      ip: opts.ip,
      userAgent: opts.userAgent,
    });

    await log.save();
  } catch (error) {
    console.error("[audit] Failed to log audit event:", error);
  }
}
