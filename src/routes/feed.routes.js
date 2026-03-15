import { Router } from "express";
 
import { getStoriesFeed, getUpdatesFeed } from "../controllers/feed.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

const router = Router();

router.use(verifyJWT);

// GET /feed/stories  — stories from friends + member clubs + followed institutions (last 24h)
router.get("/stories", getStoriesFeed);

// GET /feed/updates  — club posts + institution posts with sourceType flag, paginated
router.get("/updates", getUpdatesFeed);

export default router;