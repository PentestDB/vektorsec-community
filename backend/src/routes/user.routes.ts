import express from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import {
  checkAccess,
  generateAadharOTP,
  getUserBillingDetails,
  getUserKycDetails,
  getUserTools,
  requestKYCVerification,
  saveUserInformation,
  sendLinkBugBaseRequest,
  syncBugbaseKycDetails,
  updateKycDetails,
  updateToolsPreference,
  updateUserProfile,
  updateUserProfileImage,
  verifyAadhaarOtp,
  verifyPAN,
  verifyPassport,
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

router.post("/link-bugbase-request", [verifySess], sendLinkBugBaseRequest);

router.get("/get-user-kyc", [verifySess], getUserKycDetails);

router.post("/sync-bugbase-kyc", [verifySess], syncBugbaseKycDetails);

router.post("/update-kyc", [verifySess], updateKycDetails);

router.post("/verify-pan", [verifySess], verifyPAN);

router.post("/generate-aadhaar-otp", [verifySess], generateAadharOTP);

router.post("/verify-aadhaar-otp", [verifySess], verifyAadhaarOtp);

router.post(
  "/verify-passport",
  [verifySess, uploadImageMiddleware.single("file")],
  verifyPassport
);

router.post("/verify-final-kyc", [verifySess], requestKYCVerification);

router.get("/get-user-tools", [verifySess], getUserTools);

router.post("/get-billing-details", [verifySess], getUserBillingDetails);

router.post("/save-user-information", [verifySess], saveUserInformation);

router.post("/check-access", [verifySess], checkAccess);

export { router as userRoutes };
