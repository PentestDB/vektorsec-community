import mongoose from "mongoose";
const Schema = mongoose.Schema;

export type PaymentOrderStatus =
  | "pending"
  | "paid"
  | "confirmed"
  | "expired"
  | "canceled"
  | "refunded";

export type PaymentOrderInterval = "monthly" | "annual" | "topup";

/** Subscription channel this order grants access to (telegram / online / platform). */
export type SubscriptionChannel = "telegram" | "online" | "platform";

export interface PaymentOrderDoc extends mongoose.Document {
  /** Unique order reference shown to the buyer. */
  orderId: string;
  userId: mongoose.Types.ObjectId;
  /** Plan id for subscription orders; "topup" for token top-up orders. */
  plan: string;
  interval: PaymentOrderInterval;
  /** Price in USD at the time of purchase. */
  amountUsd: number;
  /** Selected payment channel. */
  channel: string;
  /** Subscription channel this order grants access to. */
  subscriptionChannel?: SubscriptionChannel;
  /** For top-up orders: which top-up package was purchased. */
  topupPackageId?: string;
  /** For top-up orders: number of tokens to credit once confirmed. */
  topupTokens?: number;

  /** Channel-specific reference (e.g. crypto tx hash, LINE Pay transaction id). */
  channelReference?: string;
  status: PaymentOrderStatus;
  /** When the order expires if not paid. */
  expiresAt: Date;
  /** Admin note / proof of payment. */
  adminNote?: string;
  /** Who confirmed the payment (admin user id). */
  confirmedBy?: mongoose.Types.ObjectId;
  paidAt?: Date;
  confirmedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentOrderSchema = new Schema(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    plan: {
      type: String,
      required: true,
    },
    interval: {
      type: String,
      enum: ["monthly", "annual", "topup"],
      default: "monthly",
    },
    amountUsd: { type: Number, required: true },
    channel: { type: String, required: true },
    subscriptionChannel: {
      type: String,
      enum: ["telegram", "online", "platform"],
    },
    topupPackageId: { type: String },
    topupTokens: { type: Number },
    channelReference: { type: String },

    status: {
      type: String,
      enum: ["pending", "paid", "confirmed", "expired", "canceled", "refunded"],
      default: "pending",
    },
    expiresAt: { type: Date, required: true },
    adminNote: { type: String },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    paidAt: { type: Date },
    confirmedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model<PaymentOrderDoc>("PaymentOrder", PaymentOrderSchema);
