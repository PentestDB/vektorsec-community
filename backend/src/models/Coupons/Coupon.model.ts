import mongoose from "mongoose";
const Schema = mongoose.Schema;

export interface redeemedUsersDoc {
  uid: mongoose.Types.ObjectId;
  timestamp: Date;
}

export interface CouponDoc extends mongoose.Document {
  couponIds: string[];
  creditAmount: number;
  exploitBoxAmount: number;
  expiryDate: Date;
  createdAt: Date;
  status: "active" | "inactive" | "expired";
  description: string;
  redeemedBy: redeemedUsersDoc[];
  maxRedeem: number;
}

const CouponSchema = new Schema({
  couponIds: {
    type: [String],
    required: true,
  },
  creditAmount: {
    type: Number,
    default: 0,
  },
  exploitBoxAmount: {
    type: Number,
    default: 0,
  },
  expiryDate: {
    type: Date,
    default: Date.now() + 7 * 24 * 60 * 60 * 1000, // default expiry date is 7 days from now
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ["active", "inactive", "expired"],
    default: "inactive",
  },
  description: {
    type: String,
  },
  redeemedBy: [
    {
      uid: {
        type: mongoose.Types.ObjectId,
        required: true,
      },
      timestamp: {
        type: Date,
        required: true,
      },
    },
  ],
  maxRedeem: {
    type: Number,
    default: 10,
  },
});

export default mongoose.model<CouponDoc>("Coupon", CouponSchema);
