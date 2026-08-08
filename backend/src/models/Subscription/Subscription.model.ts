import mongoose, { Schema, Document } from "mongoose";

export type SubscriptionChannel = "telegram" | "online" | "platform";
export type SubscriptionStatus = "active" | "expired" | "canceled" | "past_due" | "trial";

export interface SubscriptionDoc extends Document {
  userId: mongoose.Types.ObjectId;
  channel: SubscriptionChannel;
  planId: string;
  status: SubscriptionStatus;
  startedAt?: Date;
  endsAt?: Date;
  autoRenew: boolean;
  paymentOrderId?: string;
  /** Cumulative tokens used during a trial (no time expiry — ends at cap). */
  trialTokensUsed: number;
  createdAt: Date;
  updatedAt: Date;
}


const SubscriptionSchema = new Schema<SubscriptionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    channel: {
      type: String,
      enum: ["telegram", "online", "platform"],
      required: true,
    },
    planId: { type: String, required: true },
    status: {
      type: String,
      enum: ["active", "expired", "canceled", "past_due", "trial"],
      default: "active",
    },
    startedAt: { type: Date },
    endsAt: { type: Date },
    autoRenew: { type: Boolean, default: false },
    paymentOrderId: { type: String },
    trialTokensUsed: { type: Number, default: 0 },
  },

  { timestamps: true },
);

// Unique: one active subscription per user per channel
SubscriptionSchema.index({ userId: 1, channel: 1 }, { unique: true });

export default mongoose.model<SubscriptionDoc>("Subscription", SubscriptionSchema);
