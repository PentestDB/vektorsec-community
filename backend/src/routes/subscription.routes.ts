import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import { requireAdmin } from "../middlewares/RBAC.middleware";
import {
  cancelSubscriptionHandler,
  checkAccess,
  expireDueHandler,
  getAllSubscriptions,
  getMyChannelSubscription,
  getMySubscriptions,
  getMyUsage,
  startTrialHandler,
  exportMyUsage,
} from "../controllers/subscription.controller";

const router = express.Router();

// Auth: current user's subscriptions.
router.get("/me", [verifySess], getMySubscriptions);
router.get("/me/:channel", [verifySess], getMyChannelSubscription);
router.get("/me/:channel/access", [verifySess], checkAccess);
router.get("/me/:channel/usage", [verifySess], getMyUsage);
router.get("/me/:channel/usage/export", [verifySess], exportMyUsage);
router.post("/me/:channel/trial", [verifySess], startTrialHandler);
router.post("/me/:channel/cancel", [verifySess], cancelSubscriptionHandler);

// Admin: subscription management.
router.get("/admin", [verifySess, requireAdmin], getAllSubscriptions);
router.post("/admin/expire-due", [verifySess, requireAdmin], expireDueHandler);

export { router as subscriptionRoutes };
