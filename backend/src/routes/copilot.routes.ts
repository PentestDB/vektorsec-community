import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import {
  completeCopilotSubprocess,
  createCopilotSession,
  createCopilotSubprocess,
  // disconnectTunnel,
  getCopilotSession,
  getNetcatOutput,
  sendNetcatInput,
  startNetcat,
  stopNetcat,
  // checkTunnelStatus,
  // storeNetcatOutputData,
  initiateNetcat,
  getNetcatData,
  getUserSessions,
  getSessionInfo,
  downloadCommandFiles,
  // connectToTunnel,
  getSessionHistory,
  deleteCopilotSession,
  uploadOpenVPNforUser,
  // connectOpenVPN,
  // disconnectOpenVPN,
  checkUserOpenVPN,
  getVNCCredentials,
  getTodoListSession,
  getUserInfo,
  updateTodoListSession,
  connectToVPN,
  checkVPNStatus,
  disconnectVPN,
  // importOpenVPNConfig,
  // checkOpenVPNstatus,
} from "../controllers/copilot.controller";
import {
  uploadImageMiddleware,
  uploadOpenVPNMiddleware,
} from "../middlewares/MulterMiddleware";

const router = express.Router();

router.post("/create_session", [verifySess], createCopilotSession);

router.post("/get_user_sessions", [verifySess], getUserSessions);

router.post("/get_session_info", [verifySess], getSessionInfo);

router.post("/get_session", [verifySess], getCopilotSession);

router.post("/get_session_history", [verifySess], getSessionHistory);

router.post("/create_subprocess", [verifySess], createCopilotSubprocess);

router.post("/complete_subprocess", [verifySess], completeCopilotSubprocess);

router.post("/delete_session", [verifySess], deleteCopilotSession);

router.post("/get_session_todo_list", [verifySess], getTodoListSession);

router.get("/get_user_details", [verifySess], getUserInfo);

router.post("/update-todo-list", [verifySess], updateTodoListSession);

// router.post("/store-command-output", [verifySess], storePluginOutputData);
// Tunnel
// router.get("/check_tunnel", [verifySess], checkTunnelStatus);

// router.post("/connect_tunnel", [verifySess], connectToTunnel);

// router.post("/disconnect_tunnel", [verifySess], disconnectTunnel);

// OpenVPN
router.post(
  "/upload_openvpn",
  [verifySess, uploadOpenVPNMiddleware.single("openvpn")],
  uploadOpenVPNforUser
);

router.post("/check_user_vpn", [verifySess], checkUserOpenVPN);

router.post("/connect_vnc", [verifySess], getVNCCredentials);

// router.post("/import_openvpn", [verifySess], importOpenVPNConfig);

router.post("/connect_openvpn", [verifySess], connectToVPN);

router.post("/disconnect_openvpn", [verifySess], disconnectVPN);

router.post("/check_openvpn_status", [verifySess], checkVPNStatus);

// Command Files
router.post("/download", [verifySess], downloadCommandFiles);

// Netcat
router.post("/initiate-netcat", [verifySess], initiateNetcat);

router.post("/netcat-data", [verifySess], getNetcatData);

router.post("/start-netcat", [verifySess], startNetcat);

router.post("/send-netcat-input", [verifySess], sendNetcatInput);

router.post("/get-netcat-output", [verifySess], getNetcatOutput);

// router.post("/store-netcat-output", storeNetcatOutputData);

router.post("/stop-netcat", [verifySess], stopNetcat);

export { router as copilotRoutes };
