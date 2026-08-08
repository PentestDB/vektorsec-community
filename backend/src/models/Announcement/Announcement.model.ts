import mongoose from "mongoose";
const Schema = mongoose.Schema;

export interface AnnouncementDoc extends mongoose.Document {
  title: string;
  message: string;
  enabled: boolean;
  dismissible: boolean;
  startsAt?: Date;
  endsAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AnnouncementSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  message: {
    type: String,
    default: "",
  },
  enabled: {
    type: Boolean,
    default: true,
  },
  dismissible: {
    type: Boolean,
    default: true,
  },
  startsAt: {
    type: Date,
  },
  endsAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model<AnnouncementDoc>(
  "Announcement",
  AnnouncementSchema
);
