import mongoose from "mongoose";
const Schema = mongoose.Schema;

export type NotificationLogStatus = "success" | "failed" | "pending";

export interface NotificationLogDoc extends mongoose.Document {
  /** Delivery channel: telegram | email | webhook | system | ... */
  channel: string;
  /** Recipient id / address / chat id. */
  recipient: string;
  /** Short label for the event (e.g. "Scan started", "telegram_message"). */
  type: string;
  status: NotificationLogStatus;
  /** Structured event payload (chat id, subject, etc.). Secrets are never stored. */
  payload?: Record<string, any>;
  /** Error message when delivery failed. */
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationLogSchema = new Schema(
  {
    channel: { type: String, required: true, index: true },
    recipient: { type: String, default: "" },
    type: { type: String, default: "notification", index: true },
    status: {
      type: String,
      enum: ["success", "failed", "pending"],
      default: "success",
      index: true,
    },
    payload: { type: Schema.Types.Mixed },
    error: { type: String },
  },
  { timestamps: true }
);

NotificationLogSchema.index({ createdAt: -1 });
NotificationLogSchema.index({ channel: 1, createdAt: -1 });
NotificationLogSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<NotificationLogDoc>("NotificationLog", NotificationLogSchema);
