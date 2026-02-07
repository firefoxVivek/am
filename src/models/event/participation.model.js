import mongoose from "mongoose";

const eventParticipationSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },

    activityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Activity",
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    userName: {
      type: String,
      required: true,
      trim: true,
    },

    role: {
      type: String,
      enum: ["participant", "audience"],
      required: true,
      index: true,
    },

    paymentStatus: {
      type: String,
      enum: ["done", "pending", "rejected"],
      default: "pending",
      index: true,
    },

    attendance: {
      type: String,
      enum: ["present", "absent"],
      default: "absent",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

/* =========================
   INDEXES
========================== */
/* =========================
   INDEXES
========================== */

// Prevent duplicate registration
eventParticipationSchema.index(
  { eventId: 1, activityId: 1, userId: 1 },
  { unique: true }
);

// User → all participations
eventParticipationSchema.index(
  { userId: 1, createdAt: -1 },
  { name: "user_participations" }
);

// Activity → participant/audience
eventParticipationSchema.index(
  { activityId: 1, role: 1 },
  { name: "activity_role" }
);

// Event → participant/audience
eventParticipationSchema.index(
  { eventId: 1, role: 1 },
  { name: "event_role" }
);

export const EventParticipation = mongoose.model(
  "EventParticipation",
  eventParticipationSchema
);
