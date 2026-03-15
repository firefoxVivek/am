import { Router } from "express";
 
import { getStoriesFeed, getUpdatesFeed } from "../controllers/feed.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

const router = Router();
router.use(verifyJWT);
 
router.get("/updates", getUpdatesFeed);
router.get("/stories", getStoriesFeed);
 
export default router;
 