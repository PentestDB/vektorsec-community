import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import {
  uploadOpenVPNforUser,
  disconnectVPN,
  connectToVPN,
  checkUserOpenVPN,
  checkVPNStatus,
  uploadVPNProfile,
  listVPNProfiles,
  deleteVPNProfile,
  connectVPNProfile,
  disconnectVPNConnection,
  disconnectAllVPN,
  getVPNStatus,
} from "../controllers/vpn.controller";
import { uploadOpenVPNMiddleware } from "../middlewares/MulterMiddleware";

const router = express.Router();

// Legacy endpoints (backward-compatible)
router.post("/upload-openvpn", [verifySess, uploadOpenVPNMiddleware.single("openvpn")], uploadOpenVPNforUser);
router.post("/check-user-vpn", [verifySess], checkUserOpenVPN);
router.post("/check-openvpn-status", [verifySess], checkVPNStatus);
router.post("/connect-openvpn", [verifySess], connectToVPN);
router.post("/disconnect-openvpn", [verifySess], disconnectVPN);

// New multi-profile endpoints
router.post("/vpn/profiles/upload", [verifySess, uploadOpenVPNMiddleware.single("openvpn")], uploadVPNProfile);
router.get("/vpn/profiles", [verifySess], listVPNProfiles);
router.post("/vpn/profiles/delete", [verifySess], deleteVPNProfile);
router.post("/vpn/connect", [verifySess], connectVPNProfile);
router.post("/vpn/disconnect", [verifySess], disconnectVPNConnection);
router.post("/vpn/disconnect-all", [verifySess], disconnectAllVPN);
router.post("/vpn/status", [verifySess], getVPNStatus);

export { router as vpnRoutes };
