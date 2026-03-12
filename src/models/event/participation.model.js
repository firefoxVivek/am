import mongoose from "mongoose";

const EventParticipationSchema = new mongoose.Schema(
  {
    /* ── References ── */
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    // Users register per-activity (required — events are containers only)
    activityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Activity",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /* ── Snapshot at time of registration ── */
    userName: {
      type: String,
      required: true,
      trim: true,
    },

    /* ── Role ── */
    role: {
      type: String,
      enum: ["participant", "audience"],
      required: true,
      index: true,
    },

    /* ── Team Info (used when activity.teamAllowed = true) ── */
    teamName: {
      type: String,
      trim: true,
      default: null,
    },
    teamMembers: {
      // Snapshot of member names / college IDs at time of registration
      type: [String],
      default: [],
    },

    /* ── Payment ── */
    paymentStatus: {
      type: String,
      enum: ["done", "pending", "rejected"],
      default: "pending",
      index: true,
    },

    /* ── Attendance ── */
    attendance: {
      type: String,
      enum: ["present", "absent", "not_marked"],
      default: "not_marked",
      index: true,
    },
    auditedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

/* ── Indexes ── */

// One registration per user per activity (hard unique)
EventParticipationSchema.index(
  { activityId: 1, userId: 1 },
  { unique: true, name: "unique_user_activity" }
);

EventParticipationSchema.index({ userId: 1, createdAt: -1 }, { name: "user_timeline" });
EventParticipationSchema.index({ activityId: 1, role: 1 },   { name: "activity_role" });
EventParticipationSchema.index({ eventId: 1, userId: 1 },    { name: "event_user" });

/* ── Hook: capture isNew BEFORE save (it flips to false after) ── */
EventParticipationSchema.pre("save", function (next) {
  this._wasNewDoc = this.isNew;
  next();
});

/* ── Hook: increment counters after new registration ── */
EventParticipationSchema.post("save", async function (doc) {
  if (doc._wasNewDoc) {
    await mongoose.model("Activity")
      .findByIdAndUpdate(doc.activityId, { $inc: { registrationsCount: 1 } })
      .catch((e) => console.error("registrationsCount inc failed:", e.message));
    await mongoose.model("Event")
      .findByIdAndUpdate(doc.eventId, { $inc: { totalRegistrations: 1 } })
      .catch((e) => console.error("totalRegistrations inc failed:", e.message));
  }
});

/* ── Hook: decrement counters after delete ── */
EventParticipationSchema.post("findOneAndDelete", async function (doc) {
  if (doc) {
    await mongoose.model("Activity")
      .findByIdAndUpdate(doc.activityId, { $inc: { registrationsCount: -1 } })
      .catch((e) => console.error("registrationsCount dec failed:", e.message));
    await mongoose.model("Event")
      .findByIdAndUpdate(doc.eventId, { $inc: { totalRegistrations: -1 } })
      .catch((e) => console.error("totalRegistrations dec failed:", e.message));
  }
});

export const EventParticipation = mongoose.model("EventParticipation", EventParticipationSchema);
export default EventParticipation;
