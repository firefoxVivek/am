import express from "express";
import {
  sendMessage,
  getMessages,
  markMessagesAsRead,
} from "../../controllers/connections/messages.controller.js";
import { verifyJWT } from "../../middleware/auth.middleware.js";

const router = express.Router();

/* =================================
   SEND MESSAGE
   POST /api/messages
================================= */
router.post("/", verifyJWT, sendMessage);

/* =================================
   GET MESSAGES
   GET /api/messages/:conversationId
================================= */
router.get("/:conversationId", verifyJWT, getMessages);

/* =================================
   MARK READ
   PATCH /api/messages/:conversationId/read
================================= */
router.patch(
  "/:conversationId/read",
  verifyJWT,
  markMessagesAsRead
);

export default router;
