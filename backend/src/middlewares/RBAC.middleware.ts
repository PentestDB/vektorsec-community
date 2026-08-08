import { Request, Response, NextFunction } from "express";
import UserModel from "../models/User/User.model";

/**
 * Role-Based Access Control (RBAC) middleware.
 *
 * Roles:
 *  - "admin"     : Full access, can manage users, billing, and system settings
 *  - "pentester" : Can create/run sessions, workspaces, and use agent tools
 *  - "viewer"    : Read-only access to sessions, workspaces, and findings
 *
 * The role is stored on the User document. Default role for new users is
 * "pentester". The first registered user is automatically promoted to "admin".
 */

export type UserRole = "admin" | "pentester" | "viewer";

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  viewer: 1,
  pentester: 2,
  admin: 3,
};

export function hasRole(userRole: UserRole | undefined, required: UserRole): boolean {
  if (!userRole) return false;
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[required];
}

/**
 * Require a minimum role. Attach the current user to res.locals.user.
 * Must be used AFTER verifySess (which sets res.locals.userId).
 */
export function requireRole(required: UserRole) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = res.locals.userId;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const user = await UserModel.findById(userId);
      if (!user) {
        return res.status(403).json({ message: "User not found" });
      }

      const role = (user as any).role as UserRole | undefined;
      if (!hasRole(role, required)) {
        return res.status(403).json({
          message: `Insufficient permissions. Required role: ${required}`,
        });
      }

      res.locals.user = user;
      next();
    } catch (err) {
      console.error("[RBAC] Error checking role:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}

/** Convenience middlewares. */
export const requireAdmin = requireRole("admin");
export const requirePentester = requireRole("pentester");
export const requireViewer = requireRole("viewer");
