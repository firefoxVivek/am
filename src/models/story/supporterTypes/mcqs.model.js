import mongoose from "mongoose"; import BlockBase from "../block.model.js"
const MCQOptionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true }
  },
  { _id: false, minimize: true }
);

const MCQBlockSchema = new mongoose.Schema(
  {
    
    question: {
      type: String,
      required: true,
      trim: true
    },

    options: {
      type: [MCQOptionSchema],
      required: true,
      validate: v => Array.isArray(v) && v.length >= 2
    },

    correctOption: {
      type: Number, // index of the correct option
      min: 0
    },

    explanation: {
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
export const MCQBlock = BlockBase.discriminator("mcq", MCQBlockSchema);
export default MCQBlockSchema;