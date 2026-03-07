import { Response, Request } from "express";

// User profile

import axios from "axios";
import getSecrets from "../utils/getSecrets";
import KYCModel from "../models/KYC/KYC.model";
import {
  createPassportClient,
  generateAadhaarOtpService,
  verifyAadhaarOtpService,
  verifyPanService,
  verifyPassportService,
} from "../services/kyc.service";
import { calculateBillingDetails } from "../services/billing.service";
import moment from "moment";

export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        message: "Invalid name",
      });
    }

    user.name = name;

    await user.save();

    return res.status(200).json({
      message: "User profile updated",
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to update user profile",
    });
  }
};

export const sendLinkBugBaseRequest = async (req: Request, res: Response) => {
  try {
    const DEPLOYMENT = await getSecrets("DEPLOYMENT");

    const user = res.locals.user;
    const userId = res.locals.userId;

    const LINK_BUGBASE_LAMBDA_URL = await getSecrets("LINK-BUGBASE-LAMBDA-URL");
    const COPILOT_LAMBDA_KEY = await getSecrets("LINK-BUGBASE-LAMBDA-KEY");

    console.log("LINK_BUGBASE_LAMBDA_URL", LINK_BUGBASE_LAMBDA_URL);
    console.log("COPILOT_LAMBDA_KEY", COPILOT_LAMBDA_KEY);

    if (LINK_BUGBASE_LAMBDA_URL) {
      await axios.post(
        LINK_BUGBASE_LAMBDA_URL,
        {
          email: user.email,
          deployment: DEPLOYMENT,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-functions-key": COPILOT_LAMBDA_KEY,
          },
        }
      );
    }

    return res.status(200).json({
      message: "Email sent to link BugBase account",
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to update user profile",
    });
  }
};

export const updateUserProfileImage = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const file = req.file;

    if (!file) {
      return res.status(400).json({
        message: "Invalid file",
      });
    }

    if (file.size > 2097152) {
      return res.status(400).json({ message: "file size is too large" });
    }



    return res.status(200).json({
      message: "User profile image updated",
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to update user profile image",
    });
  }
};

export const getUserBillingDetails = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;

    let { month, year } = req.body;

    const { billing, credits, exploitBox } = user;

    const data = {
      plan: billing.plan,
      recurringInterval: billing.recurringInterval,
      status: billing.status,
      paymentMethod: billing.paymentMethod,
      payAsYouGo: billing.payAsYouGo,
      credits,
      exploitBox,
    };

    if (!month || !year) {
      return res.status(200).json({
        message: "User billing details fetched",
        data,
      });
    }

    month = parseInt(month);
    year = parseInt(year);

    const billingDetails = calculateBillingDetails(user, month, year);

    return res.status(200).json({
      message: "User billing details fetched",
      data,
      ...billingDetails,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to get user billing details",
    });
  }
};

export const checkAccess = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { billing, credits, exploitBox } = user;

    const remainingCredits = credits.remainingCredits;
    const usedCredits = credits.usedCredits;
    const netCreditUsage = usedCredits - remainingCredits;

    const remainingHours = exploitBox.remainingHours;
    const usedHours = exploitBox.usedHours;
    const netHoursUsage = usedHours - remainingHours;

    let status = "active";
    let type = [];

    if (netCreditUsage === 0 && !billing.payAsYouGo) {
      status = "disabled";
      type.push("command-gen");
    }

    if (netHoursUsage === 0 && !billing.payAsYouGo) {
      status = "disabled";
      type.push("exploit-box");
    }

    if (billing.payAsYouGo && !billing.payAsYouGoInvoiceId) {
    }

    if (
      netCreditUsage >= 100 ||
      netHoursUsage >= 100 ||
      netCreditUsage + netHoursUsage >= 100
    ) {
      const manualInvoice = user.invoices.find(
        (invoice: any) => invoice.type === "exhausted" && invoice.status !== "paid"
      );

      if (!manualInvoice) {
        status = "exhausted";
        type.push("command-gen");
        type.push("exploit-box");
        // console.log("Creating manual invoice")
        // await createManualInvoice(user._id);
      }
    }

    // make sure type has one occurence of each type
    type = [...new Set(type)];

    return res.status(200).json({
      message: "Access Details Fetched",
      status,
      type,
      plan: billing.plan,
      recurringInterval: billing.recurringInterval,
      payAsYouGo: billing.payAsYouGo,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to get user billing details",
    });
  }
};

// KYC

export const getUserKycDetails = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { bugbase, kycId } = user;

    const bugbaseDetails = {
      ...bugbase,
      connected: bugbase?.connected ? true : false,
    };

    let kycDetails;

    if (kycId) {
      const kyc = await KYCModel.findById(kycId);

      if (!kyc) {
        return res.status(200).json({
          message: "KYC not started yet",
          bugbase: bugbaseDetails,
          profile: {
            name: user.name,
            profilePicture: user.profilePicture,
          },
        });
      }

      kycDetails = {
        firstName: kyc.firstName?.trim(),
        lastName: kyc.lastName?.trim(),
        middleName: kyc.middleName?.trim(),
        dob: kyc.dob,
        phoneNumber: kyc.phoneNumber,
        address: kyc.address,
        aadhaarStatus: kyc.aadhaarStatus,
        panStatus: kyc.panStatus,
        passportStatus: kyc.passportStatus,
        citizen: kyc.citizen,
        kycStatus: kyc.kycStatus,
        bankCountry: kyc.bankCountry,
      };
    }

    return res.status(200).json({
      message: "User details fetched",
      bugbase: bugbaseDetails,
      kyc: kycDetails,
      profile: {
        name: user.name,
        profilePicture: user.profilePicture,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to fetch user details",
    });
  }
};

export const syncBugbaseKycDetails = async (req: Request, res: Response) => {
  try {
    const DEPLOYMENT = await getSecrets("DEPLOYMENT");

    const user = res.locals.user;
    const userId = res.locals.userId;

    const GET_BUGBASE_KYC_LAMBDA_URL = await getSecrets(
      "GET-BUGBASE-KYC-LAMBDA-URL"
    );
    const COPILOT_LAMBDA_KEY = await getSecrets("GET-BUGBASE-KYC-LAMBDA-KEY");

    if (GET_BUGBASE_KYC_LAMBDA_URL) {
      const response = await axios.post(
        GET_BUGBASE_KYC_LAMBDA_URL,
        {
          email: user.email,
          deployment: DEPLOYMENT,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-functions-key": COPILOT_LAMBDA_KEY,
          },
        }
      );

      const kycDetails = response.data.kyc;

      let userKYC;

      if (user.kycId) {
        userKYC = await KYCModel.findById(user.kycId);

        if (!userKYC) {
          userKYC = new KYCModel({
            uid: user._id,
          });
        }

        user.kycId = userKYC._id;
      } else {
        userKYC = new KYCModel({
          uid: user._id,
        });

        user.kycId = userKYC._id;
      }

      if (kycDetails.firstName)
        userKYC.firstName = kycDetails.firstName?.trim() ?? kycDetails.fullName;
      if (kycDetails.lastName)
        userKYC.lastName = kycDetails.lastName?.trim() ?? kycDetails.fullName;
      if (kycDetails.middleName)
        userKYC.middleName =
          kycDetails.middleName?.trim() ?? kycDetails.fullName;
      if (kycDetails.dob) userKYC.dob = moment(kycDetails.dob).valueOf();
      if (kycDetails.phoneNumber) userKYC.phoneNumber = kycDetails.phoneNumber;
      if (kycDetails.address) userKYC.address = kycDetails.address;
      if (kycDetails.shippingAddress)
        userKYC.shippingAddress = kycDetails.shippingAddress;
      if (kycDetails.currency) userKYC.currency = kycDetails.currency;
      if (kycDetails.bankCountry) userKYC.bankCountry = kycDetails.bankCountry;
      if (kycDetails.bankName) userKYC.bankName = kycDetails.bankName;
      if (kycDetails.beneficiaryName)
        userKYC.beneficiaryName = kycDetails.beneficiaryName;
      if (kycDetails.accountNumber)
        userKYC.accountNumber = kycDetails.accountNumber;
      if (kycDetails.swiftCode) userKYC.swiftCode = kycDetails.swiftCode;
      if (kycDetails.ifscCode) userKYC.ifscCode = kycDetails.ifscCode;
      if (kycDetails.aadhaarResponse)
        userKYC.aadhaarResponse = kycDetails.aadhaarResponse;
      if (kycDetails.panResponse) userKYC.panResponse = kycDetails.panResponse;
      if (kycDetails.passportResponse)
        userKYC.passportResponse = kycDetails.passportResponse;
      if (kycDetails.aadhaarStatus)
        userKYC.aadhaarStatus = kycDetails.aadhaarStatus;
      if (kycDetails.panStatus) userKYC.panStatus = kycDetails.panStatus;
      if (kycDetails.passportStatus)
        userKYC.passportStatus = kycDetails.passportStatus;
      if (kycDetails.citizen) userKYC.citizen = kycDetails.citizen;
      if (kycDetails.kycStatus) userKYC.kycStatus = kycDetails.kycStatus;
      if (kycDetails.remarks) userKYC.remarks = kycDetails.remarks;

      userKYC.updatedAt = new Date();

      await user.save();
      await userKYC.save();

      return res.status(200).json({
        message: "KYC details updated",
      });
    }

    return res.status(200).json({
      message: "Email sent to link BugBase account",
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to update user profile",
    });
  }
};

export const updateKycDetails = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const userKYC = await KYCModel.findOne({ uid: userId });

    if (userKYC?.kycStatus === "approved") {
      return res.status(400).json({
        message: "KYC already approved",
      });
    }

    const { action } = req.body;

    if (!["personal-details", "country"].includes(action)) {
      return res.status(400).json({
        message: "Invalid action",
      });
    }

    if (action === "personal-details") {
      const { firstName, lastName, middleName, dob, phoneNumber, address } =
        req.body;

      if (!firstName || !lastName || !dob || !phoneNumber || !address) {
        return res.status(400).json({
          message: "Invalid data",
        });
      }

      if (user.kycId) {
        const kyc = await KYCModel.findById(user.kycId);

        if (kyc == null) {
          return res.status(400).json({
            message: "Invalid KYC",
          });
        }

        kyc.firstName = firstName;
        kyc.lastName = lastName;
        kyc.middleName = middleName;
        kyc.phoneNumber = phoneNumber;
        kyc.address = address;
        kyc.dob = dob;

        await kyc.save();


        return res.status(200).json({
          success: true,
          message: "KYC details updated",
        });
      } else {
        const kyc = new KYCModel({
          uid: userId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          middleName: middleName?.trim() ?? "",
          phoneNumber,
          address,
          shippingAddress: "",
          dob,
        });

        const savedKYC = await kyc.save();

        user.kycId = savedKYC._id;

        await user.save();


        return res.status(200).json({
          success: true,
          message: "KYC details updated",
        });
      }
    }

    if (action === "country") {
      const { bankCountry } = req.body;

      if (!bankCountry) {
        return res.status(400).json({
          message: "Invalid data",
        });
      }

      if (user.kycId) {
        const kyc = await KYCModel.findById(user.kycId);

        if (kyc == null) {
          return res.status(400).json({
            message: "Invalid KYC",
          });
        }

        kyc.bankCountry = bankCountry;
        kyc.citizen = bankCountry === "IN" ? "INDIAN" : "FOREIGN";

        await kyc.save();
        return res.status(200).json({
          success: true,
          message: "KYC details updated",
        });
      } else {
        const kyc = new KYCModel({
          uid: userId,
          bankCountry: bankCountry,
          citizen: bankCountry === "IN" ? "INDIAN" : "FOREIGN",
        });

        const savedKYC = await kyc.save();

        user.kycId = savedKYC._id;

        await user.save();

        return res.status(200).json({
          success: true,
          message: "KYC details updated",
        });
      }
    }

    return res.status(400).json({
      message: "Invalid action",
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to update user profile",
    });
  }
};

export const generateAadharOTP = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    if (!user.kycId) {
      return res.status(400).json({
        success: false,
        message: "User KYC Not Found!",
      });
    }

    const kyc = await KYCModel.findOne({ _id: user.kycId });

    if (kyc == null) {
      return res.status(400).json({
        success: false,
        message: "KYC_NOT_FOUND",
      });
    }

    if (kyc.aadhaarStatus !== "not-started") {
      return res.status(400).json({
        success: false,
        message: "KYC_ALREADY_ATTEMPTED",
      });
    }

    const { aadhaarNumber } = req.body;

    if (!aadhaarNumber) {
      return res.status(400).json({
        success: false,
        message: "INVALID AADHAAR NUMBER",
      });
    }

    const aadharAPIResponse = await generateAadhaarOtpService(aadhaarNumber);

    if (aadharAPIResponse?.success) {
      kyc.aadhaarStatus = "otp-required";
      kyc.aadhaarResponse = JSON.stringify(aadharAPIResponse);

      await kyc.save();

      return res.status(200).json({
        success: true,
        message: "OTP_SENT",
      });
    } else if (aadharAPIResponse && aadharAPIResponse.status_code > 400) {
      kyc.aadhaarStatus = "not-started";
      kyc.aadhaarResponse = JSON.stringify(aadharAPIResponse);

      await kyc.save();


      return res.status(200).json({
        success: false,
        message: "Please try again, something went wrong!",
      });
    } else {
      kyc.aadhaarStatus = "failed";
      kyc.aadhaarResponse = JSON.stringify(aadharAPIResponse);
      await kyc.save();

      return res.status(200).json({
        success: false,
        message: "FAILED_TO_SEND_OTP",
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to update user profile",
    });
  }
};

export const verifyAadhaarOtp = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    if (!user.kycId) {
      return res.status(400).json({
        success: false,
        message: "KYC_NOT_FOUND",
      });
    }

    const kyc = await KYCModel.findOne({ _id: user.kycId });

    if (kyc == null) {
      return res.status(400).json({
        success: false,
        message: "KYC_NOT_FOUND",
      });
    }

    if (kyc.aadhaarStatus !== "otp-required") {
      return res.status(400).json({
        success: false,
        message: "WRONG_KYC_STEP",
      });
    }

    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "OTP_NOT_PROVIDED",
      });
    }


    const previousAadhaarResponse = JSON.parse(kyc.aadhaarResponse);

    const clientID = previousAadhaarResponse.data.client_id;

    const aadharAPIResponse = await verifyAadhaarOtpService(clientID, otp);

    if (aadharAPIResponse?.success) {
      kyc.aadhaarStatus = "completed";
      kyc.aadhaarResponse = JSON.stringify(aadharAPIResponse);

      await kyc.save();

      return res.status(200).json({
        success: true,
        message: "AADHAR_VERIFIED",
      });
    } else if (aadharAPIResponse && aadharAPIResponse.status_code > 400) {
      kyc.aadhaarStatus = "not-started";
      kyc.aadhaarResponse = JSON.stringify(aadharAPIResponse);
      await kyc.save();




      return res.status(400).json({
        success: false,
        message: "Something went wrong, please try again!",
      });
    } else {
      kyc.aadhaarStatus = "failed";
      kyc.aadhaarResponse = JSON.stringify(aadharAPIResponse);

      await kyc.save();

      return res.status(200).json({
        success: false,
        message: "AADHAAR_OTP_VERIFICATION_FAILED",
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to update user profile",
    });
  }
};

export const verifyPAN = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    if (!user.kycId) {
      return res.status(400).json({
        success: false,
        message: "KYC_NOT_FOUND",
      });
    }

    const kyc = await KYCModel.findOne({ _id: user.kycId });

    if (kyc == null) {
      return res.status(400).json({
        success: false,
        message: "KYC_NOT_FOUND",
      });
    }

    if (kyc.panStatus !== "not-started") {
      return res.status(400).json({
        success: false,
        message: "KYC_ALREADY_ATTEMPTED",
      });
    }

    const { pan } = req.body;

    if (!pan) {
      return res.status(400).json({
        success: false,
        message: "INVALID_DATA",
      });
    }



    const panAPIResponse = await verifyPanService(pan);

    if (!panAPIResponse.success) {
      kyc.panStatus = "failed";
      kyc.panResponse = JSON.stringify(panAPIResponse);
      await kyc.save();

      return res.status(200).json({
        success: false,
        message: "KYC_FAILED",
      });
    } else {
      kyc.panStatus = "completed";
      kyc.panResponse = JSON.stringify(panAPIResponse);

      await kyc.save();


      return res.status(200).json({
        success: true,
        message: "PAN_VERIFIED",
      });
    }
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      success: false,
    });
  }
};

export const verifyPassport = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    if (!user.kycId) {
      return res.status(400).json({
        success: false,
        message: "KYC_NOT_FOUND",
      });
    }

    const kyc = await KYCModel.findOne({ _id: user.kycId });

    if (kyc == null) {
      return res.status(400).json({
        success: false,
        message: "KYC_NOT_FOUND",
      });
    }

    if (kyc.passportStatus !== "not-started") {
      return res.status(400).json({
        success: false,
        message: "KYC_ALREADY_ATTEMPTED",
      });
    }

    const file = req.file;

    if (file == null) {
      return res.status(400).json({
        success: false,
        message: "INVALID_DATA",
      });
    }

    const formData: any = new FormData();

    formData.append("file", file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    const createPassportClientRes = await createPassportClient();

    if (!createPassportClientRes.success) {


      return res.status(400).json({
        success: false,
        message: "KYC_CLIENT_CREATION_FAILED",
      });
    }

    const clientID = createPassportClientRes.data.client_id;

    const passportAPIResponse = await verifyPassportService(clientID, formData);

    if (!passportAPIResponse.success) {
      kyc.passportStatus = "failed";
      kyc.passportResponse = JSON.stringify(passportAPIResponse);
      await kyc.save();


      return res.status(400).json({
        success: false,
        message: "KYC_FAILED",
      });
    } else {
      kyc.passportStatus = "completed";
      kyc.passportResponse = JSON.stringify(passportAPIResponse);

      await kyc.save();


      return res.status(200).json({
        success: true,
        message: "PASSPORT_VERIFIED",
      });
    }
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      success: false,
    });
  }
};

export const requestKYCVerification = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    if (!user.kycId) {
      return res.status(400).json({
        success: false,
        message: "KYC_NOT_FOUND",
      });
    }

    const kyc = await KYCModel.findOne({ _id: user.kycId });

    if (kyc == null) {
      return res.status(400).json({
        success: false,
        message: "KYC_NOT_FOUND",
      });
    }

    if (kyc.kycStatus === "approved") {
      return res.status(400).json({
        success: false,
        message: "KYC_ALREADY_REQUESTED",
      });
    }

    if (
      !kyc.firstName ||
      !kyc.lastName ||
      !kyc.phoneNumber ||
      !kyc.address ||
      !kyc.dob
    ) {
      return res.status(400).json({
        message: "Personal details section not completed",
      });
    }

    if (!kyc.bankCountry) {
      return res.status(400).json({
        message: "Residential details section not completed",
      });
    }

    if (
      (kyc.bankCountry === "IN" &&
        (kyc.aadhaarStatus !== "completed" ||
          kyc.panStatus !== "completed" ||
          kyc.aadhaarResponse === "" ||
          kyc.panResponse === "")) ||
      (kyc.bankCountry !== "IN" && kyc.passportStatus !== "completed")
    ) {
      return res.status(400).json({
        success: false,
        message: "Identity verification section not completed",
      });
    }

    let noMatch = false;

    if (kyc.bankCountry === "IN") {
      const aadhaarResponse = JSON.parse(kyc.aadhaarResponse);
      const panResponse = JSON.parse(kyc.panResponse);

      const aadhaarData = aadhaarResponse.data;
      const panData = panResponse.data;

      const givenDob = kyc.dob.valueOf();

      const givenDobString = moment.unix(givenDob).format("DD/MM/YYYY");
      const aadhaarDobString = moment(aadhaarData.dob).format("DD/MM/YYYY");

      console.log({
        givenDobString,
        aadhaarDobString,
      });

      if (aadhaarDobString.toString() !== givenDobString.toString()) {
        kyc.remarks = `Date of Birth does not match with the details provided in aadhaar. Please re-select your Date of Birth and request verification again. Incase of any discrepancy, please contact help@bugbase.ai.`;
        // noMatch = true;
      }

      if (panData.category !== "person") {
        kyc.remarks = `Pan category is not person, only indivuals can apply for KYC. Please contact help@bugbase.ai incase of any queries`;
        kyc.kycStatus = "rejected";

        await kyc.save();

        return res.status(400).json({
          success: false,
          message: "KYC_REJECTED",
        });
      }

      function normalizeSpaces(str: string) {
        return str.replace(/\s+/g, " ").trim().toLowerCase();
      }
      // Construct the full name from kyc model
      const constructedFullName = normalizeSpaces(
        `${kyc.firstName.trim() || ""} ${kyc.middleName.trim() || ""} ${
          kyc.lastName.trim() || ""
        }`
      );

      const aadhaarName = normalizeSpaces(aadhaarData.full_name ?? "");
      const panName = normalizeSpaces(panData.full_name ?? "");

      console.log({
        constructedFullName,
        aadhaarName,
        panName,
      });

      if (aadhaarName !== constructedFullName) {
        // noMatch = true;
        kyc.remarks = `Full name does not match exactly with the details provided in aadhaar.`;
      }

      if (panName !== constructedFullName) {
        kyc.remarks = `Full name does not match exactly with the details provided in pan.`;
        // noMatch = true;
      }
    } else if (kyc.bankCountry !== "IN") {
      const passportResponse = JSON.parse(kyc.passportResponse);

      const passportData = passportResponse.data;

      // if (passportData.nationality === "INDIAN") {
      //   kyc.remarks = `Please select Indian as your citizenship and provide your Aadhaar and Pan details!`;

      //   kyc.save();

      //   return res.status(400).json({
      //     success: false,
      //     message: "KYC_REJECTED",
      //   });
      // }

      const givenDob = kyc.dob.valueOf();

      const givenDobString = moment.unix(givenDob).format("DD/MM/YYYY");
      const passportDobString = moment(passportData.dob).format("DD/MM/YYYY");

      if (passportDobString.toString() !== givenDobString.toString()) {
        kyc.remarks = `Passport dob does not match with the details provided. Incase of any discrepancy, please contact help@bugbase.ai.`;
        // noMatch = true;
      }
      // Construct the full name from the kyc model
      const constructedFullName = `${kyc.firstName.trim() || ""} ${
        kyc.middleName.trim() || ""
      } ${kyc.lastName.trim() || ""}`
        .trim()
        .toLowerCase();

      const passportName = `${passportData.given_name || ""} ${
        passportData.surname || ""
      }`
        .trim()
        .toLowerCase();

      if (passportName !== constructedFullName) {
        kyc.remarks = `Full name does not match exactly with the details provided in passport.`;
        // noMatch = true;
      }

      if (!passportName) {
        kyc.remarks = `Passport name not found`;
        noMatch = true;
      }
    }

    // if (kyc.citizen === "INDIAN") {
    //   await createContactFundAccount(user);
    // } else {
    //   await NewForeignCitizenKYC(user, kyc);
    // }

    kyc.kycStatus = noMatch ? "under-review" : "approved";
    kyc.remarks = noMatch ? kyc.remarks : "";

    await kyc.save();

    // if (kyc.kycStatus === "approved") {
    //   await SendTextNotificationToUser({
    //     message: "Congratulations! Your KYC has been approved.",
    //     timestamp: new Date(),
    //     view: "/dashboard/settings/kyc",
    //     uid: user._id,
    //   });
    // } else {
    //   await SendTextNotificationToUser({
    //     message:
    //       "Your KYC verification is under review. It may take upto 48 hours to complete the verification.",
    //     timestamp: new Date(),
    //     view: "/dashboard/settings/kyc",
    //     uid: user._id,
    //   });
    // }


    return res.status(200).json({
      success: true,
      kycStatus: kyc.kycStatus,
      message: "KYC_VERIFICATION_SUCCESSFUL",
    });
  } catch (err: any) {
    console.log(err);
    return res.status(400).json({
      success: false,
    });
  }
};

// Tools

export const updateToolsPreference = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { tools } = req.body;

    if (!tools) {
      return res.status(400).json({
        message: "Invalid data",
      });
    }

    user.configs.tools = tools;

    await user.save();

    return res.status(200).json({
      message: "Tools preference updated",
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to update user profile",
    });
  }
};

export const getUserTools = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    return res.status(200).json({ tools: user.configs.tools });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to get user tools",
    });
  }
};

// export const getUserGoldData = async (req: Request, res: Response) => {
//   try {
//     const { userId } = res.locals;
//     let { month, year } = req.body;

//     const user = await UserModel.findById(userId);

//     if (!user) {
//       throw new Error("User not found");
//     }

//     month = parseInt(month);
//     year = parseInt(year);

//     const firstDayOfMonth = new Date(year, month - 1, 1);
//     const lastDayOfMonth = new Date(year, month, 0);

//     const allDatesInMonth: string[] = [];
//     const currentDate = new Date(firstDayOfMonth);

//     while (currentDate <= lastDayOfMonth) {
//       allDatesInMonth.push(getFormattedDate(currentDate));
//       currentDate.setDate(currentDate.getDate() + 1);
//     }

//     const transactionPerDay: any[] = allDatesInMonth.map((date) => ({
//       date,
//       goldForLoop: 0,
//       goldForContainer: 0,
//       totalGoldUsed: 0,
//     }));

//     const monthTransactions: any[] = [];

//     const allTransactions = user.goldTransactions.filter((transaction) => {
//       const transactionDate = new Date(transaction.date);
//       const transactionYear = transactionDate.getFullYear();
//       const transactionMonth = transactionDate.getMonth() + 1;
//       return transactionMonth === month && transactionYear === year;
//     });

//     if (allTransactions.length === 0) {
//       return res
//         .status(200)
//         .json({ transactionPerDay: [], monthTransactions: [] });
//     }

//     allTransactions.forEach((transaction) => {
//       const type = transaction.description.includes(
//         "1 gold deducted for using loop in a session"
//       )
//         ? "loop"
//         : "container";

//       const entryIndex = transactionPerDay.findIndex(
//         (entry) => entry.date === getFormattedDate(transaction.date)
//       );

//       if (entryIndex !== -1) {
//         if (type === "loop") {
//           transactionPerDay[entryIndex].goldForLoop +=
//             transaction.goldTransacted;
//         } else {
//           transactionPerDay[entryIndex].goldForContainer +=
//             transaction.goldTransacted;
//         }

//         transactionPerDay[entryIndex].totalGoldUsed +=
//           transaction.goldTransacted;
//       }

//       monthTransactions.unshift({
//         date: transaction.date,
//         description: transaction.description,
//         amount: transaction.goldTransacted,
//         type: transaction.type,
//       });
//     });

//     return res.status(200).json({ transactionPerDay, monthTransactions });
//   } catch (error) {
//     console.log(error);
//     return res.status(400).json({ message: "Error! failed to get gold data." });
//   }
// };

export const saveUserInformation = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { industry, experience, discoveryMethod } = req.body;

    if (!industry || !experience || !discoveryMethod) {
      return res.status(400).json({ message: "Missing user information!" });
    }

    if (user.firstLogin === false) {
      return res
        .status(400)
        .json({ message: "User information already saved!" });
    }



    user.workingIndustry = industry;
    user.workingExperience = experience;
    user.referralSource = discoveryMethod;

    user.firstLogin = false;

    user.configs.tools = [
      "nmap",
      "feroxbuster",
      "subfinder",
      "hydra",
      "sqlmap",
    ];

    await user.save();

    return res.status(200).json({ message: "User information saved!" });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Error! failed to save details" });
  }
};
