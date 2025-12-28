import mongoose from "mongoose";
  import BlockBase from "../block.model.js"
const PoetryInlineSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    style: {
      bold: { type: Boolean },
      italic: { type: Boolean },
      underline: { type: Boolean },
      color: { type: String }
    }
  },
  { _id: false, minimize: true }
);

 
const PoetryLineSchema = new mongoose.Schema(
  {
    segments: { type: [PoetryInlineSchema], required: true, validate: v => Array.isArray(v) && v.length > 0 }
  },
  { _id: false, minimize: true }
);

// Main Poetry Block
const PoetryBlockSchema = new mongoose.Schema(
  {
  
    lines: {
      type: [PoetryLineSchema],
      required: true,
      validate: v => Array.isArray(v) && v.length > 0
    },

    order: {
      type: Number,
      required: true
    }
  },
  { _id: false, minimize: true }
);

export const PoetryBlock = BlockBase.discriminator("poetry", PoetryBlockSchema);
export default PoetryBlockSchema;