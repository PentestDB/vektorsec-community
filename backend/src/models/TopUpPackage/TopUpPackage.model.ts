import mongoose from "mongoose";
const Schema = mongoose.Schema;

export interface TopUpPackageDoc extends mongoose.Document {
  packageId: string;
  name: string;
  description?: string;
  /** Price in USD shown to the customer at purchase time. */
  priceUsd: number;
  /** Number of tokens credited to the user's wallet when confirmed. */
  tokens: number;
  enabled: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const TopUpPackageSchema = new Schema(
  {
    packageId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String },
    priceUsd: { type: Number, required: true, default: 0 },
    tokens: { type: Number, required: true, default: 0 },
    enabled: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<TopUpPackageDoc>("TopUpPackage", TopUpPackageSchema);
