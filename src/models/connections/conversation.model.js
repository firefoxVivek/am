import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    userA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    userB: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // 🔥 Deterministic Conversation ID
    conversationKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    lastMessage: {
      type: String,
      trim: true,
    },

    lastMessageTime: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

/* =========================
   INDEXES
========================== */

// Fast conversation list
conversationSchema.index({ lastMessageTime: -1 });
conversationSchema.index({ conversationKey: 1 }, { unique: true });


export const Conversation = mongoose.model(
  "Conversation",
  conversationSchema
);
