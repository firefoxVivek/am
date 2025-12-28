import mongoose from "mongoose"; import BlockBase from "../block.model.js"
const SidenoteBlockSchema = new mongoose.Schema(
  {
   
    text: {
      type: String,
      required: true,
      trim: true
    },

    position: {
      type: String,
      enum: ["left", "right"],
      default: "right"
    },

    highlight: {
      type: String,   
      trim: true
    },

    order: {
      type: Number,
      required: true
    }
  },
  { _id: false, minimize: true }
);

export const SidenoteBlock = BlockBase.discriminator("sidenote", SidenoteBlockSchema);
export default SidenoteBlockSchema;