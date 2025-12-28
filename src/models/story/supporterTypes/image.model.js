import mongoose from "mongoose";
 import BlockBase from "../block.model.js"
 
const ImageBlockSchema = new mongoose.Schema(
  {
     
    url: {
      type: String,
      required: true,
      trim: true,
    },

    caption: {
      type: String,
      trim: true,
    },

    alt: {
      type: String,
      trim: true,
    },

    width: Number,
    height: Number,

    align: {
      type: String,
      enum: ["left", "center", "right"],
      default: "center",
    },

    order: {
      type: Number,
      required: true,
    },
  },
  { _id: false, minimize: true }
);

export const ImageBloc = BlockBase.discriminator("image", ImageBlockSchema);
export default ImageBlockSchema;