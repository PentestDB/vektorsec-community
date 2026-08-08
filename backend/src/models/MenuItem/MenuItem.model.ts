import mongoose from "mongoose";
const Schema = mongoose.Schema;

export interface MenuItemDoc extends mongoose.Document {
  label: string;
  url: string;
  order: number;
  enabled: boolean;
  openInNewTab: boolean;
  locked: boolean;
  placement: string;
  createdAt: Date;
  updatedAt: Date;
}

const MenuItemSchema = new Schema({
  label: {
    type: String,
    required: true,
    trim: true,
  },
  url: {
    type: String,
    required: true,
    trim: true,
  },
  order: {
    type: Number,
    default: 0,
  },
  enabled: {
    type: Boolean,
    default: true,
  },
  openInNewTab: {
    type: Boolean,
    default: false,
  },
  placement: {
    type: String,
    enum: ["navbar", "header", "session", "both"],
    default: "navbar",
  },
  locked: {
    type: Boolean,
    default: false,
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

export default mongoose.model<MenuItemDoc>("MenuItem", MenuItemSchema);
