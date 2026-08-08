import { Request, Response } from "express";
import mongoose from "mongoose";
import AnnouncementModel from "../models/Announcement/Announcement.model";
import { logAuditFromRequest } from "../services/audit.service";

const toObjectId = (id: string): mongoose.Types.ObjectId | null =>
  mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;

/**
 * Public — return announcements that are enabled and currently within their
 * scheduled window (if any). Sorted newest-first.
 */
export const getActiveAnnouncements = async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const docs = await AnnouncementModel.find({
      enabled: true,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ announcements: docs });
  } catch (error) {
    console.error("[announcement] getActiveAnnouncements error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/** Admin — list all announcements (including disabled / scheduled). */
export const listAnnouncements = async (_req: Request, res: Response) => {
  try {
    const docs = await AnnouncementModel.find().sort({ createdAt: -1 }).lean();
    return res.status(200).json({ announcements: docs });
  } catch (error) {
    console.error("[announcement] listAnnouncements error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/** Admin — create an announcement. */
export const createAnnouncement = async (req: Request, res: Response) => {
  try {
    const { title, message, enabled, dismissible, startsAt, endsAt } =
      req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: "Title is required" });
    }

    const doc = await AnnouncementModel.create({
      title: String(title).trim(),
      message: message ? String(message) : "",
      enabled: enabled !== false,
      dismissible: dismissible !== false,
      startsAt: startsAt ? new Date(startsAt) : undefined,
      endsAt: endsAt ? new Date(endsAt) : undefined,
    });

    await logAuditFromRequest(req, res, "admin.announcement_created", {
      resourceType: "announcement",
      resourceId: doc._id.toString(),
      details: { title: doc.title },
    });

    return res.status(201).json({ message: "Announcement created", announcement: doc });
  } catch (error) {
    console.error("[announcement] createAnnouncement error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/** Admin — update an announcement. */
export const updateAnnouncement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const objectId = toObjectId(id);
    if (!objectId) return res.status(400).json({ message: "Invalid announcement ID" });

    const { title, message, enabled, dismissible, startsAt, endsAt } =
      req.body || {};

    const patch: Record<string, any> = { updatedAt: new Date() };
    if (title !== undefined) {
      if (!String(title).trim()) {
        return res.status(400).json({ message: "Title is required" });
      }
      patch.title = String(title).trim();
    }
    if (message !== undefined) patch.message = String(message);
    if (enabled !== undefined) patch.enabled = enabled !== false;
    if (dismissible !== undefined) patch.dismissible = dismissible !== false;
    if (startsAt !== undefined) patch.startsAt = startsAt ? new Date(startsAt) : null;
    if (endsAt !== undefined) patch.endsAt = endsAt ? new Date(endsAt) : null;

    const doc = await AnnouncementModel.findByIdAndUpdate(objectId, patch, {
      new: true,
    });
    if (!doc) return res.status(404).json({ message: "Announcement not found" });

    await logAuditFromRequest(req, res, "admin.announcement_updated", {
      resourceType: "announcement",
      resourceId: doc._id.toString(),
      details: { title: doc.title },
    });

    return res.status(200).json({ message: "Announcement updated", announcement: doc });
  } catch (error) {
    console.error("[announcement] updateAnnouncement error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/** Admin — delete an announcement. */
export const deleteAnnouncement = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const objectId = toObjectId(id);
    if (!objectId) return res.status(400).json({ message: "Invalid announcement ID" });

    const doc = await AnnouncementModel.findByIdAndDelete(objectId);
    if (!doc) return res.status(404).json({ message: "Announcement not found" });

    await logAuditFromRequest(req, res, "admin.announcement_deleted", {
      resourceType: "announcement",
      resourceId: id,
      details: { title: doc.title },
    });

    return res.status(200).json({ message: "Announcement deleted" });
  } catch (error) {
    console.error("[announcement] deleteAnnouncement error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
