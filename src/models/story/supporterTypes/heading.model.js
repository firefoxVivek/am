import mongoose from "mongoose";
import  BlockBase  from "../block.model.js";

// Sub-schema for content
const HeadingContentSchema = new mongoose.Schema(
  {
    text: {
  type: String,
  required: true,
  trim: true,
  validate: {
    validator: v => typeof v === "string" && v.trim().length > 0,
    message: "Heading text is required and cannot be empty"
  }
}
,
    level: { type: Number, enum: [1, 2, 3, 4, 5, 6], default: 1 }
  },
  { _id: false }
);

// Sub-schema for style
const HeadingStyleSchema = new mongoose.Schema(
  {
    bold: { type: Boolean, default: false },
    italic: { type: Boolean, default: false },
    underline: { type: Boolean, default: false }
  },
  { _id: false  }
);

const HeadingBlockSchema = new mongoose.Schema(
  {
    content: { type: HeadingContentSchema,  },

    style: { type: HeadingStyleSchema},

    color: { type: String, trim: true },

    align: { type: String, enum: ["left", "center", "right"], default: "left" },

    order: { type: Number, required: true }
  },
  { _id: false, minimize:true }
);

// Register discriminator
export const HeadingBlock = BlockBase.discriminator("heading", HeadingBlockSchema);

export default HeadingBlockSchema;
