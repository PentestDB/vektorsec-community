import mongoose from "mongoose";

const Schema = mongoose.Schema;

export interface loopHistoryDoc {
  stepType: "init" | "command" | "output" | "summary";
  status: "not-started" | "processing" | "pending" | "completed";
  data: {
    content?: string;
    choice?: string;
    additionalContext?: string;
  };
  loop: number;
}

export interface FeedbackDoc extends mongoose.Document {
  uid: mongoose.Types.ObjectId;
  sessionId: string;
  stepId: mongoose.Types.ObjectId;
  action: "like" | "dislike";
  feedback: string;
  createdAt: Date;
}

const FeedbackSchema = new Schema({
  uid: { type: mongoose.Types.ObjectId, required: true },
  sessionId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  stepId: { type: mongoose.Types.ObjectId, required: true },
  action: { type: String, required: true, enum: ["like", "dislike"] },
  feedback: { type: String, required: true },
});

export default mongoose.model<FeedbackDoc>("Feedback", FeedbackSchema);
