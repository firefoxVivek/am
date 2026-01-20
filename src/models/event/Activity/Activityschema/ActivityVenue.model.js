import mongoose from "mongoose";

export const ActivityVenueSchema = new mongoose.Schema(
  {
    venueName: {
      type: String,
      required: true,
      trim: true,
    },

    address: {
      type: String,
      trim: true,
      default: null,
    },

    hallOrRoom: {
      type: String,
      trim: true,
      default: null,
    },

    capacity: {
      type: Number,
      default: null,
    },

    resources: {
      type: [String], // mic, projector, wifi
      default: [],
    },

    instructions: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: false }
);
