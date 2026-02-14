import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },

    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      index: true,
    },

    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Story",
      index: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    sentAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

/* =========================
   INDEXES
========================== */

// Fast message loading per conversation
messageSchema.index({ conversationId: 1, sentAt: -1 });
messageSchema.index({ conversationId: 1, receiverId: 1, isRead: 1 });

export const Message = mongoose.model(
  "Message",
  messageSchema
);
