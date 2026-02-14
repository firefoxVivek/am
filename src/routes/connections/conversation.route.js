import express from "express";
import {
  createOrGetConversation,
  getMyConversations,
} from "../../controllers/connections/conversation.controller.js";
import { verifyJWT } from "../../middleware/auth.middleware.js";

const router = express.Router();

/* =================================
   CREATE OR GET CONVERSATION
   POST /api/conversations
================================= */
router.post("/", verifyJWT, createOrGetConversation);

/* =================================
   GET MY CHAT LIST
   GET /api/conversations
================================= */
router.get("/", verifyJWT, getMyConversations);

export default router;
