import { Router } from "express";
import { getPublicSeo } from "../controllers/publicSeo.controller";

/**
 * Public, unauthenticated configuration endpoints (read-only).
 * Currently serves the SEO/sitemap settings the frontend consumes at runtime.
 */
const router = Router();

router.get("/seo", getPublicSeo);

export { router as publicRoutes };
