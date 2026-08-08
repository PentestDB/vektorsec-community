import { Router } from "express";
import { verifyAdmin } from "../middlewares/VerifyAdmin.middleware";
import {
  getPublishedBlogs,
  getBlogBySlug,
  listBlogs,
  createBlog,
  updateBlog,
  deleteBlog,
} from "../controllers/blog.controller";

const router = Router();

// Public — published articles.
router.get("/", getPublishedBlogs);
router.get("/:slug", getBlogBySlug);

// Admin — full CRUD.
router.get("/admin/list", verifyAdmin, listBlogs);
router.post("/admin", verifyAdmin, createBlog);
router.put("/admin/:id", verifyAdmin, updateBlog);
router.delete("/admin/:id", verifyAdmin, deleteBlog);

export { router as blogRoutes };
