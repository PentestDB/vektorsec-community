import { Request, Response } from "express";
import mongoose from "mongoose";
import MenuItemModel from "../models/MenuItem/MenuItem.model";
import { logAuditFromRequest } from "../services/audit.service";

const toObjectId = (id: string): mongoose.Types.ObjectId | null =>
  mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;

const VALID_PLACEMENTS = new Set(["navbar", "header", "session", "both"]);

// The original hardcoded navigation — seeded into the DB on first run so the
// existing frontend menu items are manageable from the Admin Panel.
const DEFAULT_MENUS = [
  { label: "Home", url: "/", order: 0 },
  { label: "Pricing", url: "/pricing", order: 1 },
  { label: "Top Up", url: "/topup", order: 2 },
  { label: "Docs", url: "/docs", order: 3 },
  {
    label: "GitHub",
    url: "https://github.com/PentestDB",
    order: 4,
    openInNewTab: true,
  },
];

// Session-page sidebar navigation tabs. URLs use a {sessionId} placeholder
// that the frontend substitutes with the active session id at render time.
// Seeded into the DB alongside the navbar defaults so admins can manage them.
const DEFAULT_SESSION_MENUS = [
  {
    label: "Orchestrator",
    url: "/session/{sessionId}",
    order: -1,
  },
  {
    label: "Vulnerabilities",
    url: "/session/{sessionId}/vulnerabilities",
    order: 0,
  },
  { label: "VPN", url: "/session/{sessionId}/vpn", order: 1, locked: true },
  { label: "GUI", url: "/session/{sessionId}/gui", order: 2, locked: true },
  { label: "Burp", url: "/session/{sessionId}/burp", order: 3, locked: true },
  { label: "Caido", url: "/session/{sessionId}/caido", order: 4, locked: true },
  {
    label: "Browser Agent",
    url: "/session/{sessionId}/browser-agent",
    order: 5,
  },
];

async function ensureDefaultMenus(): Promise<void> {
  try {
    // Navbar links — seeded only when none exist yet (never overwrite an
    // admin-managed state, and do not re-seed after an admin deletes them).
    const navbarCount = await MenuItemModel.countDocuments({
      placement: { $in: ["navbar", "both"] },
    });
    if (navbarCount === 0) {
      const now = new Date();
      await MenuItemModel.insertMany(
        DEFAULT_MENUS.map((m) => ({
          label: m.label,
          url: m.url,
          order: m.order,
          enabled: true,
          openInNewTab: m.openInNewTab === true,
          locked: false,
          placement: "navbar",
          createdAt: now,
          updatedAt: now,
        }))
      );
      console.log("[menu] Seeded default navigation menu items");
    }

    // Session-page sidebar navigation — seeded independently so existing
    // deployments that already have navbar menus still get the session tabs.
    const sessionCount = await MenuItemModel.countDocuments({
      placement: "session",
    });
    if (sessionCount === 0) {
      const now = new Date();
      await MenuItemModel.insertMany(
        DEFAULT_SESSION_MENUS.map((m) => ({
          label: m.label,
          url: m.url,
          order: m.order,
          enabled: true,
          openInNewTab: false,
          locked: m.locked === true,
          placement: "session",
          createdAt: now,
          updatedAt: now,
        }))
      );
      console.log("[menu] Seeded default session navigation menu items");
    }
  } catch (err) {
    console.error("[menu] ensureDefaultMenus error:", err);
  }
}

function sanitizePlacement(value: unknown): string {
  const v = String(value || "navbar").toLowerCase();
  return VALID_PLACEMENTS.has(v) ? v : "navbar";
}

/** Public — enabled menu items, ordered by `order` then label. */
export const getEnabledMenuItems = async (req: Request, res: Response) => {
  try {
    await ensureDefaultMenus();
    const placement = String(req.query.placement || "navbar").toLowerCase();
    const filter: Record<string, any> = { enabled: true };
    if (placement === "navbar" || placement === "header") {
      filter.placement = { $in: [placement, "both"] };
    } else if (placement === "session") {
      filter.placement = { $in: ["session"] };
    }

    const docs = await MenuItemModel.find(filter)
      .sort({ order: 1, label: 1 })
      .lean();

    return res.status(200).json({ menus: docs });
  } catch (error) {
    console.error("[menu] getEnabledMenuItems error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/** Admin — list all menu items. */
export const listMenuItems = async (_req: Request, res: Response) => {
  try {
    await ensureDefaultMenus();
    const docs = await MenuItemModel.find().sort({ order: 1, label: 1 }).lean();
    return res.status(200).json({ menus: docs });
  } catch (error) {
    console.error("[menu] listMenuItems error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/** Admin — create a menu item. */
export const createMenuItem = async (req: Request, res: Response) => {
  try {
    const { label, url, order, enabled, openInNewTab, placement, locked } =
      req.body || {};

    if (!label || !String(label).trim()) {
      return res.status(400).json({ message: "Label is required" });
    }
    if (!url || !String(url).trim()) {
      return res.status(400).json({ message: "URL is required" });
    }

    const doc = await MenuItemModel.create({
      label: String(label).trim(),
      url: String(url).trim(),
      order: Number(order) || 0,
      enabled: enabled !== false,
      openInNewTab: openInNewTab === true,
      locked: locked === true,
      placement: sanitizePlacement(placement),
    });

    await logAuditFromRequest(req, res, "admin.menu_created", {
      resourceType: "menu",
      resourceId: doc._id.toString(),
      details: { label: doc.label },
    });

    return res.status(201).json({ message: "Menu item created", menu: doc });
  } catch (error) {
    console.error("[menu] createMenuItem error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/** Admin — update a menu item. */
export const updateMenuItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const objectId = toObjectId(id);
    if (!objectId) return res.status(400).json({ message: "Invalid menu item ID" });

    const body = req.body || {};
    const patch: Record<string, any> = { updatedAt: new Date() };

    if (body.label !== undefined) {
      if (!String(body.label).trim()) {
        return res.status(400).json({ message: "Label is required" });
      }
      patch.label = String(body.label).trim();
    }
    if (body.url !== undefined) {
      if (!String(body.url).trim()) {
        return res.status(400).json({ message: "URL is required" });
      }
      patch.url = String(body.url).trim();
    }
    if (body.order !== undefined) patch.order = Number(body.order) || 0;
    if (body.enabled !== undefined) patch.enabled = body.enabled !== false;
    if (body.openInNewTab !== undefined) patch.openInNewTab = body.openInNewTab === true;
    if (body.locked !== undefined) patch.locked = body.locked === true;
    if (body.placement !== undefined) patch.placement = sanitizePlacement(body.placement);

    const doc = await MenuItemModel.findByIdAndUpdate(objectId, patch, { new: true });
    if (!doc) return res.status(404).json({ message: "Menu item not found" });

    await logAuditFromRequest(req, res, "admin.menu_updated", {
      resourceType: "menu",
      resourceId: doc._id.toString(),
      details: { label: doc.label },
    });

    return res.status(200).json({ message: "Menu item updated", menu: doc });
  } catch (error) {
    console.error("[menu] updateMenuItem error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/** Admin — delete a menu item. */
export const deleteMenuItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const objectId = toObjectId(id);
    if (!objectId) return res.status(400).json({ message: "Invalid menu item ID" });

    const doc = await MenuItemModel.findByIdAndDelete(objectId);
    if (!doc) return res.status(404).json({ message: "Menu item not found" });

    await logAuditFromRequest(req, res, "admin.menu_deleted", {
      resourceType: "menu",
      resourceId: id,
      details: { label: doc.label },
    });

    return res.status(200).json({ message: "Menu item deleted" });
  } catch (error) {
    console.error("[menu] deleteMenuItem error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
