import { Router } from "express";
import { verifyAdmin } from "../middlewares/VerifyAdmin.middleware";
import {
  getActiveAnnouncements,
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from "../controllers/announcement.controller";

const router = Router();

// Public — active announcements for the frontend popup.
router.get("/active", getActiveAnnouncements);

// Admin — full CRUD.
router.get("/admin", verifyAdmin, listAnnouncements);
router.post("/admin", verifyAdmin, createAnnouncement);
router.put("/admin/:id", verifyAdmin, updateAnnouncement);
router.delete("/admin/:id", verifyAdmin, deleteAnnouncement);

export { router as announcementRoutes };
