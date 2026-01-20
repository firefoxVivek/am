import mongoose from "mongoose";

export const ActivityAwardSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    position: {
      type: Number,
      default: null,
    },

    amount: {
      type: Number,
      default: 0,
      min: 0,
    },

    certificate: {
      type: Boolean,
      default: true,
    },

    description: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: false }
);
