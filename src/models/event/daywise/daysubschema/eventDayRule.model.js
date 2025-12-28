import mongoose from "mongoose";

export const EventDayRuleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    mandatory: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);
