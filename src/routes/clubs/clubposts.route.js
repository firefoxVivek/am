import express from "express";
import { createPost, deletePost, getClubPosts, getClubPostsByDate, getPostById, updatePost } from "../../controllers/clubs/clubposts.controller.js";
import { verifyJWT } from "../../middleware/auth.middleware.js";

 

const router = express.Router();

router.post("/", verifyJWT, createPost);

router.get("/club/:clubId", verifyJWT, getClubPosts);
router.get("/:postId", verifyJWT, getPostById);

router.get("/club/:clubId/date/:date", verifyJWT, getClubPostsByDate);
router.put("/:postId", verifyJWT, updatePost);
router.delete("/:postId", verifyJWT, deletePost);

export default router;
