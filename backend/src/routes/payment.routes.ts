import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import { requireAdmin } from "../middlewares/RBAC.middleware";
import {
  cancelMyOrder,
  confirm,
  createOrder,
  createTopUpOrderHandler,
  getAllGateways,
  getAllOrders,
  getEnabledGateways,
  getMyCredits,
  getMyOrders,
  getOrder,
  getTopUpPackages,
  getTopUpPackagesAdmin,
  markPaid,
  removeTopUpPackage,
  saveGateway,
  saveTopUpPackage,
  adminCreditTokens,
} from "../controllers/payment.controller";

const router = express.Router();

// Public: enabled payment channels for the checkout page.
router.get("/gateways", getEnabledGateways);

// Public: enabled top-up packages for the top-up page.
router.get("/topup/packages", getTopUpPackages);

// Authenticated: order lifecycle.
router.post("/order", [verifySess], createOrder);
router.get("/orders", [verifySess], getMyOrders);
router.get("/orders/:orderId", [verifySess], getOrder);
router.post("/orders/:orderId/cancel", [verifySess], cancelMyOrder);

// Authenticated: token top-up + balance.
router.post("/topup/order", [verifySess], createTopUpOrderHandler);
router.get("/credits", [verifySess], getMyCredits);

// Admin: gateway configuration.
router.get("/admin/gateways", [verifySess, requireAdmin], getAllGateways);
router.post("/admin/gateways", [verifySess, requireAdmin], saveGateway);

// Admin: order management.
router.get("/admin/orders", [verifySess, requireAdmin], getAllOrders);
router.post("/admin/orders/:orderId/paid", [verifySess, requireAdmin], markPaid);
router.post("/admin/orders/:orderId/confirm", [verifySess, requireAdmin], confirm);

// Admin: top-up package management.
router.get("/admin/topup/packages", [verifySess, requireAdmin], getTopUpPackagesAdmin);
router.post("/admin/topup/packages", [verifySess, requireAdmin], saveTopUpPackage);
router.delete("/admin/topup/packages/:packageId", [verifySess, requireAdmin], removeTopUpPackage);

// Admin: manually credit tokens.
router.post("/admin/topup/credit", [verifySess, requireAdmin], adminCreditTokens);

export { router as paymentRoutes };
