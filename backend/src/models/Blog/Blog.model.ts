import mongoose from "mongoose";
const Schema = mongoose.Schema;

interface LinkObj {
  url: string;
  title: string;
}

export interface BlogDoc extends mongoose.Document {
  author: String;
  authorProfileImage: String;
  authorLink: String;
  createdAt: Date;
  coverImage: string;
  title: string;
  description: string;
  content: string;
  slug: string;
  keywords: string[];
  related: mongoose.Types.ObjectId[];
  isPublished: boolean;
  redirect: string;
  links: LinkObj[];
  category: string;
  labels: string[];
  views: string[];
  metadescription: string;
  status: "published" | "draft" | "archived";
}

const BlogSchema = new Schema({
  author: {
    type: String,
    default: "VektorSec",
  },
  authorProfileImage: {
    type: String,
    default: "",
  },
  authorLink: {
    type: String,
    default: "https://github.com/PentestDB",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  coverImage: {
    type: String,
    default: "",
  },
  title: {
    type: String,
    default: "",
  },
  description: {
    type: String,
    default: "",
  },
  content: {
    type: String,
    default: "",
  },
  slug: {
    type: String,
    default: "",
  },
  keywords: [String],
  related: [mongoose.Types.ObjectId],
  isPublished: {
    type: Boolean,
    default: false,
  },
  redirect: {
    type: String,
  },
  links: [
    {
      url: String,
      title: String,
    },
  ],
  category: {
    type: String,
    default: "security",
  },
  labels: {
    type: [String],
    default: ["security"],
  },
  views: [String],
  metadescription: {
    type: String,
    default: "",
  },
  status: {
    type: String,
    enum: ["published", "draft", "archived"],
    default: "draft",
  },
});

export default mongoose.model<BlogDoc>("Blog", BlogSchema);
