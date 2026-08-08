import mongoose, { Schema, Document } from "mongoose";

export type UsageChannel = "telegram" | "online" | "platform";

export interface UsageRecordDoc extends Document {
  userId: mongoose.Types.ObjectId;
  channel: UsageChannel;
  date: string; // YYYY-MM-DD
  requests: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  createdAt: Date;
  updatedAt: Date;
}

const UsageRecordSchema = new Schema<UsageRecordDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    channel: {
      type: String,
      enum: ["telegram", "online", "platform"],
      required: true,
    },
    date: { type: String, required: true }, // YYYY-MM-DD
    requests: { type: Number, default: 0 },
    tokensIn: { type: Number, default: 0 },
    tokensOut: { type: Number, default: 0 },
    costUsd: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Unique: one usage record per user per channel per day
UsageRecordSchema.index({ userId: 1, channel: 1, date: 1 }, { unique: true });

export default mongoose.model<UsageRecordDoc>("UsageRecord", UsageRecordSchema);
