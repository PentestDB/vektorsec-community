import { Router } from "express";
import { verifyAdmin } from "../middlewares/VerifyAdmin.middleware";
import {
  getEnabledMenuItems,
  listMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from "../controllers/menu.controller";

const router = Router();

// Public — enabled menu items for the frontend navigation.
router.get("/", getEnabledMenuItems);

// Admin — full CRUD.
router.get("/admin", verifyAdmin, listMenuItems);
router.post("/admin", verifyAdmin, createMenuItem);
router.put("/admin/:id", verifyAdmin, updateMenuItem);
router.delete("/admin/:id", verifyAdmin, deleteMenuItem);

export { router as menuRoutes };
