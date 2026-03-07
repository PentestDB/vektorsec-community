import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import { uploadOpenVPNforUser, disconnectVPN, connectToVPN, checkUserOpenVPN, checkVPNStatus } from "../controllers/vpn.controller";
import { uploadOpenVPNMiddleware } from "../middlewares/MulterMiddleware";

const router = express.Router();
router.post("/upload-openvpn", [verifySess, uploadOpenVPNMiddleware.single("openvpn")], uploadOpenVPNforUser);
router.post("/check-user-vpn", [verifySess], checkUserOpenVPN);
router.post("/connect-openvpn", [verifySess], connectToVPN);
router.post("/disconnect-openvpn", [verifySess], disconnectVPN);
router.post("/check-openvpn-status", [verifySess], checkVPNStatus);
export { router as vpnRoutes };
