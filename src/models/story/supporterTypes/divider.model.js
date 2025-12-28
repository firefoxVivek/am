import mongoose from "mongoose";
 import BlockBase from "../block.model.js"
const DividerBlockSchema = new mongoose.Schema(
  {
     
    style: {
      type: String,
      enum: ["solid", "dashed", "dotted"],
      default: "solid",
    },

    thickness: {
      type: Number,
    },

    color: {
      type: String,
      trim: true,
    },

    marginTop: {
      type: Number,  
    },

    marginBottom: {
      type: Number,  
    },

    order: {
      type: Number,
      required: true,
    }
  },
  { _id: false, minimize: true }
);

export const DividerBlock = BlockBase.discriminator("divider", DividerBlockSchema);
export default DividerBlockSchema;