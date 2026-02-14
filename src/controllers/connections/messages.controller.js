 
 
import { Conversation } from "../../models/connections/conversation.model.js";
import { Message } from "../../models/connections/messages.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asynchandler } from "../../utils/asynchandler.js";

/* ==========================================
   SEND MESSAGE
========================================== */
export const sendMessage = asynchandler(async (req, res) => {
  const { receiverId, eventId, postId } = req.body;
  const senderId = req.user._id;

  if (!receiverId) {
    throw new ApiError(400, "receiverId required");
  }

  if (!eventId && !postId) {
    throw new ApiError(400, "Either eventId or postId required");
  }

  if (eventId && postId) {
    throw new ApiError(400, "Only one of eventId or postId allowed");
  }

  if (senderId.toString() === receiverId.toString()) {
    throw new ApiError(400, "Cannot message yourself");
  }

  // 🔥 Generate conversation key (sorted for consistency)
  const sortedIds = [senderId.toString(), receiverId.toString()].sort();
  const conversationKey = `${sortedIds[0]}_${sortedIds[1]}`;

  // 🔥 Find or create conversation
  let conversation = await Conversation.findOne({ conversationKey });

  if (!conversation) {
    conversation = await Conversation.create({
      userA: sortedIds[0],
      userB: sortedIds[1],
      conversationKey,
    });
  }

  const preview = eventId
    ? "Shared an event"
    : "Shared a post";

  const newMessage = await Message.create({
    conversationId: conversation._id,
    senderId,
    receiverId,
    eventId: eventId || null,
    postId: postId || null,
    message: preview,
  });

  // 🔥 Sync parent conversation
  await Conversation.findByIdAndUpdate(conversation._id, {
    lastMessage: preview,
    lastMessageTime: newMessage.sentAt,
  });

  return res.status(201).json(
    new ApiResponse(201, newMessage, "Content shared successfully")
  );
});



/* ==========================================
   GET MESSAGES OF A CONVERSATION
========================================== */
export const getMessages = asynchandler(async (req, res) => {
  const { conversationId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  if (!conversationId) {
    throw new ApiError(400, "conversationId required");
  }

  const skip = (page - 1) * limit;

  const messages = await Message.find({ conversationId })
    .sort({ sentAt: -1 })
    .skip(skip)
    .limit(Number(limit))
    .populate("senderId", "displayName imageUrl")
    .populate({
      path: "eventId",
      select: "banner name startDate endDate",
    })
    .populate({
      path: "postId",
      select: "title image",
    })
    .lean();

  return res.status(200).json(
    new ApiResponse(
      200,
      messages.reverse(),
      "Messages fetched"
    )
  );
});
export const deleteMessage = asynchandler(async (req, res) => {
  const { messageId } = req.params;
  const userId = req.user._id;

  const message = await Message.findById(messageId);

  if (!message) {
    throw new ApiError(404, "Message not found");
  }

  // Only sender can delete
  if (message.senderId.toString() !== userId.toString()) {
    throw new ApiError(403, "Not authorized to delete this message");
  }

  const conversationId = message.conversationId;

  await message.deleteOne();

  // 🔥 Check if it was last message
  const latestMessage = await Message.findOne({ conversationId })
    .sort({ sentAt: -1 });

  if (latestMessage) {
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: latestMessage.message,
      lastMessageTime: latestMessage.sentAt,
    });
  } else {
    // No messages left
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: null,
      lastMessageTime: null,
    });
  }

  return res.status(200).json(
    new ApiResponse(200, null, "Message deleted successfully")
  );
});

/* ==========================================
   MARK AS READ
========================================== */
export const markMessagesAsRead = asynchandler(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user._id;

  await Message.updateMany(
    {
      conversationId,
      receiverId: userId,
      isRead: false,
    },
    { $set: { isRead: true } }
  );

  return res.status(200).json(
    new ApiResponse(200, null, "Messages marked as read")
  );
});

