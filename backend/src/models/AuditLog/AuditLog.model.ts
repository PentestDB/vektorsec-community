import mongoose from "mongoose";
const Schema = mongoose.Schema;

export interface AuditLogDoc extends mongoose.Document {
  userId?: string;
  email?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, any>;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema(
  {
    userId: { type: String },
    email: { type: String },
    action: { type: String, required: true, index: true },
    resourceType: { type: String },
    resourceId: { type: String },
    details: { type: Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
  },
  {
    timestamps: true,
  }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<AuditLogDoc>("AuditLog", AuditLogSchema);
