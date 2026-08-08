import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import {
  deleteModelConfig,
  detectCapabilities,
  disconnectAnthropicOAuth,
  exchangeAnthropicOAuth,
  getAvailableModels,
  getCapabilities,
  getModelConfig,
  getSSHConfig,
  getUserTools,
  initiateAnthropicOAuth,
  saveUserInformation,
  updateCapabilities,
  updateModelConfig,
  updateSafetyProtections,
  updateSSHConfig,
  updateToolsPreference,
  updateUserProfile,
  updateUserProfileImage,
  getVNCConfig,
  updateVNCConfig,
  resetVNCConfig,
  autoSetupVNC,
  diagnoseVNC,
  repairVNC,
  getBurpConfig,
  updateBurpConfig,
  getCaidoConfig,
  updateCaidoConfig,
  getMythicConfig,
  updateMythicConfig,
  getMagnitudeConfig,
  updateMagnitudeConfig,
  startMagnitudeAgent,
  getBrowserAgentVNC,
  getAgentToolsConfig,
  updateAgentToolsConfig,
  getAgentBehaviorConfig,
  updateAgentBehaviorConfig,
  getSwarmModels,
  updateSwarmModels,
  getSubscriptionProviders,
  connectSubscriptionProvider,
  testSubscriptionProvider,
} from "../controllers/user.controller";
import { uploadImageMiddleware } from "../middlewares/MulterMiddleware";

const router = express.Router();

router.post("/update-user-profile", [verifySess], updateUserProfile);

router.post("/update-tools-preference", [verifySess], updateToolsPreference);

router.post(
  "/update-user-profile-image",
  [verifySess, uploadImageMiddleware.single("file")],
  updateUserProfileImage
);

router.get("/get-user-tools", [verifySess], getUserTools);

router.post("/save-user-information", [verifySess], saveUserInformation);

router.get("/get-model-config", [verifySess], getModelConfig);
router.post("/update-model-config", [verifySess], updateModelConfig);
router.post("/delete-model-config", [verifySess], deleteModelConfig);
router.get("/available-models", [verifySess], getAvailableModels);

router.post("/anthropic-oauth/initiate", [verifySess], initiateAnthropicOAuth);
router.post("/anthropic-oauth/exchange", [verifySess], exchangeAnthropicOAuth);
router.post("/anthropic-oauth/disconnect", [verifySess], disconnectAnthropicOAuth);

router.get("/get-capabilities", [verifySess], getCapabilities);
router.post("/update-capabilities", [verifySess], updateCapabilities);
router.post("/detect-capabilities", [verifySess], detectCapabilities);

router.get("/get-ssh-config", [verifySess], getSSHConfig);
router.post("/update-ssh-config", [verifySess], updateSSHConfig);
router.post("/update-safety-protections", [verifySess], updateSafetyProtections);

router.get("/get-vnc-config", [verifySess], getVNCConfig);
router.post("/update-vnc-config", [verifySess], updateVNCConfig);
router.post("/reset-vnc-config", [verifySess], resetVNCConfig);
router.post("/auto-setup-vnc", [verifySess], autoSetupVNC);
router.post("/diagnose-vnc", [verifySess], diagnoseVNC);
router.post("/repair-vnc", [verifySess], repairVNC);

router.get("/get-burp-config", [verifySess], getBurpConfig);
router.post("/update-burp-config", [verifySess], updateBurpConfig);
router.get("/get-caido-config", [verifySess], getCaidoConfig);
router.post("/update-caido-config", [verifySess], updateCaidoConfig);
router.get("/get-mythic-config", [verifySess], getMythicConfig);
router.post("/update-mythic-config", [verifySess], updateMythicConfig);

router.get("/get-magnitude-config", [verifySess], getMagnitudeConfig);
router.post("/update-magnitude-config", [verifySess], updateMagnitudeConfig);
router.post("/start-magnitude-agent", [verifySess], startMagnitudeAgent);
router.get("/get-browser-agent-vnc", [verifySess], getBrowserAgentVNC);

router.get("/get-agent-tools-config", [verifySess], getAgentToolsConfig);
router.post("/update-agent-tools-config", [verifySess], updateAgentToolsConfig);
router.get("/agent-behavior", [verifySess], getAgentBehaviorConfig);
router.post("/agent-behavior", [verifySess], updateAgentBehaviorConfig);

router.get("/get-swarm-models", [verifySess], getSwarmModels);
router.post("/update-swarm-models", [verifySess], updateSwarmModels);
router.get("/subscription-providers", [verifySess], getSubscriptionProviders);
router.post(
  "/subscription-providers/connect",
  [verifySess],
  connectSubscriptionProvider,
);
router.post(
  "/subscription-providers/test",
  [verifySess],
  testSubscriptionProvider,
);

export { router as userRoutes };
