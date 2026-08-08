import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import {
  cancelPlan,
  getMyBilling,
  getPlans,
  getUsage,
  redeemCouponCode,
  resumePlan,
  upgradePlan,
} from "../controllers/billing.controller";

const router = express.Router();

// Public: plan catalog for the pricing page.
router.get("/plans", getPlans);

// Authenticated: billing + usage.
router.get("/me", [verifySess], getMyBilling);
router.get("/usage", [verifySess], getUsage);

// Plan lifecycle.
router.post("/upgrade", [verifySess], upgradePlan);
router.post("/cancel", [verifySess], cancelPlan);
router.post("/resume", [verifySess], resumePlan);

// Coupon redemption.
router.post("/redeem-coupon", [verifySess], redeemCouponCode);

export { router as billingRoutes };
