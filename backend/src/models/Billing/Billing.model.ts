import mongoose from "mongoose";
const Schema = mongoose.Schema;

export type BillingStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "expired";

export type BillingInterval = "monthly" | "annual";

export interface BillingDoc extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  plan: string;
  status: BillingStatus;
  interval: BillingInterval;
  /** Stripe subscription id (populated once Stripe is integrated). */
  stripeSubscriptionId?: string;
  /** Stripe customer id (populated once Stripe is integrated). */
  stripeCustomerId?: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BillingSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    plan: {
      type: String,
      enum: ["free", "pro", "team", "enterprise"],
      default: "free",
    },
    status: {
      type: String,
      enum: ["active", "past_due", "canceled", "incomplete", "expired"],
      default: "active",
    },
    interval: {
      type: String,
      enum: ["monthly", "annual"],
      default: "monthly",
    },
    stripeSubscriptionId: { type: String },
    stripeCustomerId: { type: String },
    currentPeriodStart: { type: Date, default: Date.now },
    currentPeriodEnd: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model<BillingDoc>("Billing", BillingSchema);
