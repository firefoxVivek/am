import mongoose from "mongoose";
  import BlockBase from "../block.model.js"
const TimelineEventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    date: { type: Date },
    image: { type: String, trim: true }
  },
  { _id: false, minimize: true }
);

 
const TimelineBlockSchema = new mongoose.Schema(
  {
   
    events: {
      type: [TimelineEventSchema],
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

export const TimelineBlock = BlockBase.discriminator("timeline", TimelineBlockSchema);
export default TimelineBlockSchema;