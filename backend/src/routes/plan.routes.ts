import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import { requireAdmin } from "../middlewares/RBAC.middleware";
import {
  createPlanHandler,
  deletePlanHandler,
  getAdminPlans,
  getPublicPlans,
  updatePlanHandler,
} from "../controllers/plan.controller";

const router = express.Router();

// Public: enabled plans for the pricing page / checkout.
router.get("/", getPublicPlans);

// Admin: plan management.
router.get("/admin", [verifySess, requireAdmin], getAdminPlans);
router.post("/admin", [verifySess, requireAdmin], createPlanHandler);
router.put("/admin/:planId", [verifySess, requireAdmin], updatePlanHandler);
router.delete("/admin/:planId", [verifySess, requireAdmin], deletePlanHandler);

export { router as planRoutes };
