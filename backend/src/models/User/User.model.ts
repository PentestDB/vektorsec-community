import mongoose from "mongoose";
import bcrypt from "bcryptjs";
const Schema = mongoose.Schema;

export interface ModelPresetDoc {
  label: string;
  provider: string;
  model: string;
  apiKey?: string;
  baseURL?: string;
  reasoningMode?: string;
  isOrchestrator?: boolean;
}

export interface UserDoc extends mongoose.Document {
  email: string;
  name: string;
  password: string;
  profilePicture: string;
  openvpnFile: string;
  firstLogin?: boolean;
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
  ip: string;
  configs: {
    tools: string[];
    capabilities: string[];
    installedCapabilities: string[];
    requireConsentForAllTools?: boolean;
    disableSafetyProtections?: boolean;
    models?: ModelPresetDoc[];
  };
  referredBy: mongoose.Types.ObjectId;
  workingIndustry: string;
  workingExperience: string;
  referralSource: string;
}

const UserSchema = new Schema({
  email: {
    type: String,
    unique: true,
    required: true,
    match: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,20})+$/,
  },
  name: { type: String, required: true },
  password: { type: String, required: true },
  profilePicture: { type: String },
  openvpnFile: { type: String },
  firstLogin: { type: Boolean, default: true },
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
  configs: {
    tools: {
      type: [
        {
          type: String,
        },
      ],
      default: ["nmap", "feroxbuster", "subfinder", "hydra", "sqlmap"],
    },
    capabilities: {
      type: [{ type: String }],
      default: [
        "python3", "gcc", "make", "git", "curl", "nc", "socat", "ssh",
        "file", "strings", "xxd", "openssl", "jq", "tmux",
        "requests", "pyyaml", "beautifulsoup4", "Pillow", "python-magic", "chepy",
        "nmap", "feroxbuster", "subfinder", "hydra", "sqlmap",
      ],
    },
    installedCapabilities: {
      type: [{ type: String }],
      default: [],
    },
    requireConsentForAllTools: {
      type: Boolean,
      default: false,
    },
    disableSafetyProtections: {
      type: Boolean,
      default: false,
    },
    disabledAgentTools: {
      type: [{ type: String }],
      default: [],
    },
    models: {
      type: [
        {
          label: { type: String, required: true },
          provider: { type: String, required: true },
          model: { type: String, required: true },
          apiKey: { type: String },
          baseURL: { type: String },
          reasoningMode: { type: String, enum: ["off", "low", "medium", "high", "xhigh"], default: "off" },
          isOrchestrator: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
  },
  referredBy: { type: mongoose.Schema.Types.ObjectId },
  workingIndustry: { type: String },
  workingExperience: { type: String },
  referralSource: { type: String },
});

export default mongoose.model<UserDoc>("User", UserSchema);
