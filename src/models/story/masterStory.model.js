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
   
    clubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Club",
      required: true,  
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

 
StorySchema.index({ userId: 1, createdAt: -1 });
StorySchema.index({ clubId: 1, createdAt: -1 });

export const Story = mongoose.model("Story", StorySchema);
export default Story;