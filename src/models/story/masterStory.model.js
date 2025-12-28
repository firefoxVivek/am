import mongoose from "mongoose";
import { BlockBaseSchema } from "./block.model.js";

const StorySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },

 
    image: {
      type: String,
      trim: true,
      default: null,
    },

 
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
     
    },

    blocks: {
      type: [BlockBaseSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const Story = mongoose.model("Story", StorySchema);
export default Story;
