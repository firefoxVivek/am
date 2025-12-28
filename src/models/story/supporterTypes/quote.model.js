import mongoose from "mongoose"; import BlockBase from "../block.model.js"
const QuoteBlockSchema = new mongoose.Schema(
  {
    
    text: {
      type: String,
      required: true,
      trim: true,
    },

    author: {
      type: String,
      trim: true,
    },

    style: {
      bold: { type: Boolean },
      italic: { type: Boolean },
      underline: { type: Boolean },
      color: { type: String }
    },

    order: {
      type: Number,
      required: true,
    }
  },
  { _id: false, minimize: true }
);
 export const QuoteBlock = BlockBase.discriminator("quote", QuoteBlockSchema);
export default QuoteBlockSchema;