import { Request, Response } from "express";
import mongoose from "mongoose";
import BlogModel from "../models/Blog/Blog.model";
import { logAuditFromRequest } from "../services/audit.service";

const toObjectId = (id: string): mongoose.Types.ObjectId | null =>
  mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;

function slugify(value: string): string {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Public — list published articles, newest first. */
export const getPublishedBlogs = async (_req: Request, res: Response) => {
  try {
    const docs = await BlogModel.find({ status: "published" })
      .sort({ createdAt: -1 })
      .select(
        "title slug description coverImage author authorProfileImage category labels metadescription createdAt"
      )
      .lean();
    return res.status(200).json({ articles: docs });
  } catch (error) {
    console.error("[blog] getPublishedBlogs error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/** Public — get a single published article by slug. */
export const getBlogBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const doc = await BlogModel.findOne({ slug, status: "published" }).lean();
    if (!doc) return res.status(404).json({ message: "Article not found" });
    return res.status(200).json({ article: doc });
  } catch (error) {
    console.error("[blog] getBlogBySlug error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/** Admin — list all articles. */
export const listBlogs = async (_req: Request, res: Response) => {
  try {
    const docs = await BlogModel.find().sort({ createdAt: -1 }).lean();
    return res.status(200).json({ articles: docs });
  } catch (error) {
    console.error("[blog] listBlogs error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/** Admin — create an article. */
export const createBlog = async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      content,
      coverImage,
      author,
      category,
      status,
      metadescription,
      labels,
      keywords,
    } = req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: "Title is required" });
    }

    const safeTitle = String(title).trim();
    const doc = await BlogModel.create({
      title: safeTitle,
      slug: slugify(safeTitle),
      description: description ? String(description) : "",
      content: content ? String(content) : "",
      coverImage: coverImage ? String(coverImage) : "",
      author: author ? String(author) : "VektorSec",
      category: category ? String(category) : "security",
      status:
        status === "published" || status === "archived" ? status : "draft",
      isPublished: status === "published",
      metadescription: metadescription ? String(metadescription) : "",
      labels: Array.isArray(labels) ? labels.map(String) : ["security"],
      keywords: Array.isArray(keywords) ? keywords.map(String) : [],
    });

    await logAuditFromRequest(req, res, "admin.blog_created", {
      resourceType: "blog",
      resourceId: doc._id.toString(),
      details: { title: doc.title },
    });

    return res.status(201).json({ message: "Article created", article: doc });
  } catch (error) {
    console.error("[blog] createBlog error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};


/** Admin — update an article. */
export const updateBlog = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const objectId = toObjectId(id);
    if (!objectId) return res.status(400).json({ message: "Invalid article ID" });

    const body = req.body || {};
    const patch: Record<string, any> = {};

    if (body.title !== undefined) {
      if (!String(body.title).trim()) {
        return res.status(400).json({ message: "Title is required" });
      }
      patch.title = String(body.title).trim();
      patch.slug = slugify(String(body.title).trim());
    }
    if (body.description !== undefined) patch.description = String(body.description);
    if (body.content !== undefined) patch.content = String(body.content);
    if (body.coverImage !== undefined) patch.coverImage = String(body.coverImage);
    if (body.author !== undefined) patch.author = String(body.author);
    if (body.category !== undefined) patch.category = String(body.category);
    if (body.metadescription !== undefined)
      patch.metadescription = String(body.metadescription);
    if (body.status !== undefined) {
      const s = body.status === "published" || body.status === "archived" ? body.status : "draft";
      patch.status = s;
      patch.isPublished = s === "published";
    }
    if (body.labels !== undefined)
      patch.labels = Array.isArray(body.labels) ? body.labels.map(String) : ["security"];
    if (body.keywords !== undefined)
      patch.keywords = Array.isArray(body.keywords) ? body.keywords.map(String) : [];

    const doc = await BlogModel.findByIdAndUpdate(objectId, patch, { new: true });
    if (!doc) return res.status(404).json({ message: "Article not found" });

    await logAuditFromRequest(req, res, "admin.blog_updated", {
      resourceType: "blog",
      resourceId: doc._id.toString(),
      details: { title: doc.title },
    });

    return res.status(200).json({ message: "Article updated", article: doc });
  } catch (error) {
    console.error("[blog] updateBlog error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/** Admin — delete an article. */
export const deleteBlog = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const objectId = toObjectId(id);
    if (!objectId) return res.status(400).json({ message: "Invalid article ID" });

    const doc = await BlogModel.findByIdAndDelete(objectId);
    if (!doc) return res.status(404).json({ message: "Article not found" });

    await logAuditFromRequest(req, res, "admin.blog_deleted", {
      resourceType: "blog",
      resourceId: id,
      details: { title: doc.title },
    });

    return res.status(200).json({ message: "Article deleted" });
  } catch (error) {
    console.error("[blog] deleteBlog error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
