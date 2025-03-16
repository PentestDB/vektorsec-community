import mongoose from "mongoose";
const Schema = mongoose.Schema;

export interface WaitlistDoc extends mongoose.Document {
  name: string;
  email: string;
  timestamp: Date;
  ipLocation: {
    ip: string;
    range: [number, number];
    country: string;
    region: string;
    eu: string;
    timezone: string;
    city: string;
    ll: [number, number];
    metro: number;
    area: number;
  };
  type: string;
  ip: string;
}

const WaitlistSchema = new Schema({
  email: {
    type: String,
    required: true,
    match: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,20})+$/,
  },
  name: { type: String },
  type: {
    type: String,
    enum: ["waitlist", "easter", "newsletter"],
    default: "waitlist",
  },
  timestamp: { type: Date, default: Date.now },
  ipLocation: {
    ip: { type: String },
    range: [Number, Number],
    country: { type: String },
    region: { type: String },
    eu: { type: String },
    timezone: { type: String },
    city: { type: String },
    ll: [Number, Number],
    metro: Number,
    area: Number,
  },
  ip: { type: String },
});

export default mongoose.model<WaitlistDoc>("Waitlist", WaitlistSchema);
