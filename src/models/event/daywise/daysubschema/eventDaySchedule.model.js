import mongoose from "mongoose";

export const EventDayScheduleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: null,
    },

    startTime: {
      type: String, // HH:mm
      required: true,
    },

    endTime: {
      type: String, // HH:mm
      required: true,
    },

    location: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: false }
);
