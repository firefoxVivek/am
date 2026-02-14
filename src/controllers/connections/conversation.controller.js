import mongoose from "mongoose";
 
 
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asynchandler } from "../../utils/asynchandler.js";
import { Conversation } from "../../models/connections/conversation.model.js";

/* ==========================================
   CREATE OR GET CONVERSATION
========================================== */
 

export const createOrGetConversation = asynchandler(
  async (req, res) => {
    const { receiverId } = req.body;

    if (!receiverId) {
      throw new ApiError(400, "receiverId is required");
    }

    const currentUserId = req.user._id.toString();

    if (currentUserId === receiverId) {
      throw new ApiError(400, "Cannot create conversation with yourself");
    }

    // 🔥 Normalize order
    const [userA, userB] = [currentUserId, receiverId].sort();

    // 🔐 Deterministic key (string join version)
    const conversationKey = `${userA}_${userB}`;

    // Optional SHA version (if you prefer fixed-length)
    // const conversationKey = crypto
    //   .createHash("sha256")
    //   .update(`${userA}_${userB}`)
    //   .digest("hex");

    let conversation = await Conversation.findOne({
      conversationKey,
    });

    if (!conversation) {
      conversation = await Conversation.create({
        userA,
        userB,
        conversationKey,
        lastMessage: null,
        lastMessageTime: null,
      });
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        conversation,
        "Conversation ready"
      )
    );
  }
);


/* ==========================================
   GET MY CONVERSATIONS (CHAT LIST)
========================================== */
export const getMyConversations = asynchandler(async (req, res) => {
  const userId = req.user._id;

  const conversations = await Conversation.find({
    $or: [{ userA: userId }, { userB: userId }],
  })
    .sort({ lastMessageTime: -1 })
    .populate("userA", "name imageUrl")
    .populate("userB", "name imageUrl")
    .lean();

  // 🔥 Transform response
  const formatted = conversations.map((conv) => {
    const otherUser =
      conv.userA._id.toString() === userId.toString()
        ? conv.userB
        : conv.userA;

    return {
      conversationKey: conv.conversationKey,
      user: otherUser,
      lastMessage: conv.lastMessage,
      lastMessageTime: conv.lastMessageTime,
      createdAt: conv.createdAt,
    };
  });

  return res.status(200).json(
    new ApiResponse(200, formatted, "Chat list fetched")
  );
});
