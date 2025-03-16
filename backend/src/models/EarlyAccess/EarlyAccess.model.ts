import mongoose from "mongoose";
const Schema = mongoose.Schema;

export interface EarlyAccessDoc extends mongoose.Document {
  email: string;

}

const EarlyAccessSchema = new Schema({
  email: {
    type: String,
    required: true,
  },
});



export default mongoose.model<EarlyAccessDoc>("EarlyAccess", EarlyAccessSchema);
