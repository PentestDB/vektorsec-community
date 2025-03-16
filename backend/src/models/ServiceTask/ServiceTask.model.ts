import mongoose from "mongoose";
const Schema = mongoose.Schema;

export interface ExploitBoxDoc extends mongoose.Document {
  vmName: string;
  sessionId: mongoose.Types.ObjectId;
  serviceId: string;
  containerIp: string | null;
  containerPrivateIp: string | null;
  publicURL: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  uid: mongoose.Types.ObjectId;
  expiresAt: Date;
  extends: number;
  deleted: boolean;
  privateKey: string;
  infraInfo: {
    // targetGroupARN: string;
    // listenerRuleARN: string;
    // targetRegistered: boolean;
    cfDomainID: string;
    cpuUtilization: number;
    sshOpen: boolean;
    volumeStatus: "pending" | "attached" | "not-started" | "failed";
    publicIpName: string;
    networkInterfaceName: string;
  };
}

const ExploitBoxSchema = new Schema({
  vmName: { type: String, required: true },
  sessionId: { type: mongoose.Types.ObjectId, required: true },
  serviceId: { type: String, required: true },
  containerIp: { type: String },
  containerPrivateIp: { type: String },
  publicURL: { type: String },
  status: {
    type: String,
    enum: ["running", "pending", "stopped", "stopping", "deallocating"],
    default: "pending",
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  expiresAt: {
    type: Date,
    default: Date.now,
  },
  extends: {
    type: Number,
    default: 1,
    max: 3,
  },
  uid: { type: mongoose.Types.ObjectId, required: true },
  deleted: { type: Boolean, default: false },
  privateKey: {
    type: String,
  },
  infraInfo: {
    // targetGroupARN: { type: String },
    // listenerRuleARN: { type: String },
    // targetRegistered: { type: Boolean, default: false },
    cfDomainID: { type: String },
    cpuUtilization: { type: Number, default: 0 },
    sshOpen: { type: Boolean, default: false },
    volumeStatus: {
      type: String,
      default: "not-started",
      enum: ["pending", "attached", "not-started", "failed"],
    },
    publicIpName: { type: String },
    networkInterfaceName: { type: String },
    virtualNetworkName: { type: String },
    nsgName: { type: String },
  },
});

export default mongoose.model<ExploitBoxDoc>("ExploitBox", ExploitBoxSchema);
