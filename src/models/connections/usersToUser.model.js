import mongoose from "mongoose";

const friendshipSchema = new mongoose.Schema(
  {
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "blocked"],
      default: "pending",
    },

    // Who performed last action (accept / block)
    actionBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

/**
 * Ensure uniqueness:
 * A <-> B is same as B <-> A
 */
friendshipSchema.index(
  { requester: 1, recipient: 1 },
  { unique: true }
);

export const Friendship = mongoose.model("Friendship", friendshipSchema);
