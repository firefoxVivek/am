import mongoose from "mongoose";

export const BlockBaseSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        "chat",
        "divider",
        "heading",
        "image",
        "list",
        "mcq",
        "paragraph",
        "poetry",
        "quote",
        "timeline",
        "sidenote",
        "table",
      ],
    },
  },
  {
    discriminatorKey: "type",
    _id: true,
  }
);

const BlockBase = mongoose.model("BlockBase", BlockBaseSchema);
export default BlockBase;