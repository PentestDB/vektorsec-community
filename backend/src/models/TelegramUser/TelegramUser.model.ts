import mongoose, { Schema, Document } from "mongoose";

export interface TelegramUserDoc extends Document {
  telegramId: string;
  userId?: mongoose.Types.ObjectId;
  chatId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  /** The active sessionId for this telegram user (persistent chat). */
  sessionId?: string;
  /** Whether the user has linked their platform account. */
  linked: boolean;
  /** Last interaction timestamp. */
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TelegramUserSchema = new Schema<TelegramUserDoc>(
  {
    telegramId: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    chatId: { type: String, required: true },
    username: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    sessionId: { type: String },
    linked: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export default mongoose.model<TelegramUserDoc>("TelegramUser", TelegramUserSchema);
