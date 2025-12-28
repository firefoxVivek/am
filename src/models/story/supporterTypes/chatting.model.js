import mongoose from "mongoose";
import BlockBase from "../block.model.js";

const ChatMessageSchema = new mongoose.Schema(
  {
    sender: { type: String,required: [true, "Sender is required"], trim: true },
    text: { type: String, required: [true, "Text is required"], trim: true },
    timestamp: { type: String },
  },
  { _id: false, minimize: true }
);

// Chat block
const ChatBlockSchema = new mongoose.Schema(
  {
    messages: {
      type: [ChatMessageSchema],
      required: true,
      validate: (v) => Array.isArray(v) && v.length > 0,
    },

    order: {
      type: Number,
      required: true,
    },
  },
  { _id: false, minimize: true }
);

export const ChatBlock = BlockBase.discriminator("chat", ChatBlockSchema);
export default ChatBlockSchema;
