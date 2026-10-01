import mongoose from "mongoose";
import { HistoryData } from "../../services/copilot.services";
const Schema = mongoose.Schema;

export interface SessionDoc extends mongoose.Document {
  sessionId: string;
  history: ArchiveHistoryData[];
}

interface ArchiveHistoryData extends HistoryData {
  loop: number;
}

const HistoryArchiveSchema = new Schema({
  sessionId: { type: String, required: true, index: true },
  history: {
    type: [
      {
        role: { type: String, required: true },
        content: { type: String, required: true },
        isContextual: { type: Boolean },
        loopStep: { type: Number },
        loop: { type: Number },
      },
    ],
  },
});

// Archives are appended per loop and read per session.
HistoryArchiveSchema.index({ sessionId: 1 });

export default mongoose.model<SessionDoc>(
  "HistoryArchive",
  HistoryArchiveSchema
);
