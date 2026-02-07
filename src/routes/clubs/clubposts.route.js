import express from "express";
import { createPost, deletePost, getClubPosts, getClubPostsByDate, getPostById, updatePost } from "../../controllers/clubs/clubposts.controller.js";
import { verifyJWT } from "../../middleware/auth.middleware.js";

 

const router = express.Router();

// CREATE
router.post("/", verifyJWT, createPost);

// READ (club feed)
router.get("/club/:clubId", verifyJWT, getClubPosts);

// READ (single post)
router.get("/:postId", verifyJWT, getPostById);

router.get("/club/:clubId/date/:date", verifyJWT, getClubPostsByDate);
// UPDATE
router.put("/:postId", verifyJWT, updatePost);

// DELETE (soft delete)
router.delete("/:postId", verifyJWT, deletePost);

export default router;
