import mongoose from "mongoose";

const { Schema } = mongoose;

const eventSchema = new Schema(
  {
    // 1. Event Banner
    banner: {
      type: String, // URL or storage path
      required: true,
      trim: true,
    },

    // 2. Event Name
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    // 3. Venue
    venue: {
      type: String,
      required: true,
      trim: true,
    },

    // 4. Participation Fees
    participationFee: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    // 5. Event Type
    eventType: {
      type: String,
      required: true,
      enum: [
        "workshop",
        "competition",
        "seminar",
        "conference",
        "cultural",
        "sports",
        "other",
      ],
    },

    // 6. Event About
    about: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },

    // 7. Number of Days
    numberOfDays: {
      type: Number,
      required: true,
      min: 1,
    },

    // 8. Prize Pool
    prizePool: {
      type: Number,
      min: 0,
      default: 0,
    },

    // 9. Starting Date & Ending Date
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },

    // 10. Last Date of Registration
    lastRegistrationDate: {
      type: Date,
      required: true,
    },

    // 11. Club ID (Indexed)
    clubId: {
      type: Schema.Types.ObjectId,
      ref: "Club",
      required: true,
      index: true,
    },

    // 12. Institution ID (Optional but Indexed)
    institutionId: {
      type: Schema.Types.ObjectId,
      ref: "Institution",
      index: true,
      default: null,
    },

    // 13. Council ID (Optional but Indexed)
    councilId: {
      type: Schema.Types.ObjectId,
      ref: "Council",
      index: true,
      default: null,
    },

    // Status (useful for moderation / lifecycle)
    status: {
      type: String,
      enum: ["draft", "published", "completed", "cancelled"],
      default: "draft",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// 🔹 Compound indexes (optional but recommended)
eventSchema.index({ startDate: 1, endDate: 1 });
eventSchema.index({ clubId: 1, startDate: 1 });

export const   Event = mongoose.model("Event", eventSchema);
export default Event;