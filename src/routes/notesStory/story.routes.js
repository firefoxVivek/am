import express from "express";
import {
  createStory,
  getStoryByUserId,
  getStoryByStoryId,
  updateStory,
  patchStory,
  deleteStory,
} from "../../controllers/story/story.controller.js";
import { verifyJWT } from "../../middleware/auth.middleware.js";

const router = express.Router();

router.post("/", verifyJWT, createStory);

router.get("/:storyId", verifyJWT, getStoryByStoryId);

router.get("/user/:userId", verifyJWT, getStoryByUserId);

router.put("/:topicId", verifyJWT, updateStory);

router.patch("/:topicId", verifyJWT, patchStory);

router.delete("/:topicId", verifyJWT, deleteStory);

export default router;
