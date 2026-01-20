import mongoose from "mongoose";

export const ActivityContactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    role: {
      type: String,
      trim: true,
      default: "Coordinator",
    },

    phone: {
      type: String,
      trim: true,
      default: null,
    },

    email: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: false }
);
