import mongoose from "mongoose";
const Schema = mongoose.Schema;

export interface LoginSessionDoc extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  token: string;
  email: string;
  createdAt: Date;
  expiresAt: Date;

}

const LoginSessionSchema = new Schema({
  userId: {
    type: mongoose.Types.ObjectId,
    required: true,
  },
  token: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    expires: 300,
    default: Date.now,
  },

});

LoginSessionSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 300,
  }
);

export default mongoose.model<LoginSessionDoc>("LoginSession", LoginSessionSchema);
