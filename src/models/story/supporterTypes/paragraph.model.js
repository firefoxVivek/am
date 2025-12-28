import mongoose from "mongoose"; import BlockBase from "../block.model.js"
// Inline content schema (each segment of paragraph)
const ParagraphInlineSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["text", "highlight", "link", "mention"],
      required: true,
    },

    text: { type: String, required: true },

    url: { type: String },
    topicId: { type: mongoose.Schema.Types.ObjectId },
    color: { type: String },

    bold: { type: Boolean },
    italic: { type: Boolean },
    underline: { type: Boolean },
  },
  {
    _id: false,
    minimize: true,
  }
);

// Main paragraph block schema
const ParagraphBlockSchema = new mongoose.Schema(
  {
    content: {
      type: [ParagraphInlineSchema],
      required: true,
    },
  },
  {
    minimize: true,
  }
);

export const ParagraphBlock = BlockBase.discriminator("paragraph", ParagraphBlockSchema);
export default ParagraphBlockSchema;