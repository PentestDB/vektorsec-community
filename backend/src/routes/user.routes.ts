import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import {
  deleteModelConfig,
  detectCapabilities,
  disconnectAnthropicOAuth,
  exchangeAnthropicOAuth,
  getCapabilities,
  getModelConfig,
  getSSHConfig,
  getUserTools,
  initiateAnthropicOAuth,
  saveUserInformation,
  updateCapabilities,
  updateModelConfig,
  updateSSHConfig,
  updateToolsPreference,
  updateUserProfile,
  updateUserProfileImage,
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

router.post("/anthropic-oauth/initiate", [verifySess], initiateAnthropicOAuth);
router.post("/anthropic-oauth/exchange", [verifySess], exchangeAnthropicOAuth);
router.post("/anthropic-oauth/disconnect", [verifySess], disconnectAnthropicOAuth);

router.get("/get-capabilities", [verifySess], getCapabilities);
router.post("/update-capabilities", [verifySess], updateCapabilities);
router.post("/detect-capabilities", [verifySess], detectCapabilities);

router.get("/get-ssh-config", [verifySess], getSSHConfig);
router.post("/update-ssh-config", [verifySess], updateSSHConfig);

export { router as userRoutes };
