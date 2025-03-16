import mongoose from "mongoose";
const Schema = mongoose.Schema;

const KYCSchema = new Schema({
  uid: mongoose.Schema.Types.ObjectId,
  fullName: {
    type: String,
    maxlength: 100,
  },
  firstName: {
    type: String,
    maxlength: 100,
  },
  lastName: {
    type: String,
    maxlength: 100,
  },
  middleName: {
    type: String,
    maxlength: 100,
  },
  dob: Number, // UNIX timestamp representation
  phoneNumber: String,
  address: {
    type: String,
    maxlength: 400,
  },
  shippingAddress: {
    type: String,
    maxlength: 400,
  },
  currency: String,
  bankCountry: String,
  bankName: {
    type: String,
    maxlength: 100,
  },
  beneficiaryName: {
    type: String,
    maxlength: 300,
  },
  accountNumber: String,
  swiftCode: String,
  ifscCode: String,
  aadhaarResponse: String,
  panResponse: String,
  passportResponse: String,
  aadhaarStatus: {
    type: String,
    enum: ["not-started", "otp-required", "completed", "failed"],
    default: "not-started",
  },
  panStatus: {
    type: String,
    enum: ["not-started", "completed", "failed"],
    default: "not-started",
  },
  passportStatus: {
    type: String,
    enum: ["not-started", "upload-required", "completed", "failed"],
    default: "not-started",
  },
  citizen: {
    type: String,
    enum: ["INDIAN", "FOREIGN"],
    default: "INDIAN",
  },
  kycStatus: {
    type: String,
    enum: ["pending", "approved", "under-review", "rejected"],
    default: "pending",
  },
  remarks: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

interface KYCDoc extends mongoose.Document {
  uid: mongoose.Schema.Types.ObjectId;
  fullName: string;
  firstName: string;
  lastName: string;
  middleName: string;
  dob: Number;
  phoneNumber: string;
  address: string;
  shippingAddress: string;
  currency: string;
  bankCountry: string;
  beneficiaryName: string;
  bankName: string;
  accountNumber: string;
  swiftCode: string;
  ifscCode: string;
  aadhaarResponse: string;
  panResponse: string;
  passportResponse: string;
  aadhaarStatus: string;
  panStatus: string;
  passportStatus: string;
  citizen: string;
  kycStatus: "pending" | "approved" | "under-review" | "rejected";
  remarks: string;
  createdAt: Date;
  updatedAt: Date;
}

export { KYCDoc };

export default mongoose.model<KYCDoc>("kyc", KYCSchema);
