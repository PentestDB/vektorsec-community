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
  sessionId: { type: String, required: true },
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

export default mongoose.model<SessionDoc>(
  "HistoryArchive",
  HistoryArchiveSchema
);
