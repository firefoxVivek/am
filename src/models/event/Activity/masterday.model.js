import mongoose from "mongoose";
import { ActivityScheduleSchema } from "./Activityschema/ActivitySchedule.model.js";
import { ActivityAwardSchema }    from "./Activityschema/ActivityAward.model.js";
import { ActivityRuleSchema }     from "./Activityschema/ActivityRule.model.js";
import { ActivityVenueSchema }    from "./Activityschema/ActivityVenue.model.js";
import { ActivityContactSchema }  from "./Activityschema/ActivityContact.model.js";

const { Schema } = mongoose;

const ActivitySchema = new Schema(
  {
    /* ── Event Reference ── */
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },

    /* ── Basic Info ── */
    activityName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    description: {
      type: String,
      maxlength: 3000,
      trim: true,
      default: null,
    },
    category: {
      type: String,
      enum: ["competition", "workshop", "seminar", "performance", "sports", "other"],
      required: true,
      index: true,
    },

    /* ── Day Info ── */
    dayNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },

    /* ── Registration ── */
    participationFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    registrationDeadline: {
      type: Date,
      required: true,
    },
    maxParticipants: {
      type: Number,
      default: null,   // null = unlimited
    },
    registrationsCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* ── Team Settings ── */
    teamAllowed: {
      type: Boolean,
      default: false,
    },
    teamSize: {
      min: { type: Number, default: 1 },
      max: { type: Number, default: 1 },
    },

    /* ── Child Schemas ── */
    scheduling:       { type: [ActivityScheduleSchema], default: [] },
    awardsRecognition:{ type: [ActivityAwardSchema],    default: [] },
    rulesGuidelines:  { type: [ActivityRuleSchema],     default: [] },
    venueLogistics:   { type: ActivityVenueSchema,      required: true },
    contactsSupport:  { type: [ActivityContactSchema],  default: [] },

    /* ── Status ── */
    status: {
      type: String,
      enum: ["draft", "active", "completed", "cancelled"],
      default: "draft",
      index: true,
    },
  },
  { timestamps: true }
);

/* ── Indexes ── */
ActivitySchema.index({ eventId: 1, dayNumber: 1 });
ActivitySchema.index({ eventId: 1, date: 1 });
ActivitySchema.index({ eventId: 1, status: 1 });
ActivitySchema.index({ activityName: "text", description: "text" });

/* ── Validation: activity date must be within event range ── */
ActivitySchema.pre("validate", async function (next) {
  // Only run on new docs or when date/eventId changes
  if (!this.isNew && !this.isModified("date") && !this.isModified("eventId")) {
    return next();
  }
  try {
    const EventModel = mongoose.model("Event");
    const event = await EventModel.findById(this.eventId).select("startDate endDate").lean();
    if (!event) return next(new Error("Invalid event reference"));

    // Compare dates without time component
    const actDay = new Date(this.date); actDay.setHours(0, 0, 0, 0);
    const evStart = new Date(event.startDate); evStart.setHours(0, 0, 0, 0);
    const evEnd   = new Date(event.endDate);   evEnd.setHours(0, 0, 0, 0);

    if (actDay < evStart || actDay > evEnd) {
      return next(new Error(
        `Activity date must fall within event range (${evStart.toDateString()} – ${evEnd.toDateString()})`
      ));
    }
    next();
  } catch (err) {
    next(err);
  }
});

/* ── Hook: capture isNew BEFORE save (it flips to false after) ── */
ActivitySchema.pre("save", function (next) {
  this._wasNewDoc = this.isNew;
  next();
});

/* ── Hook: increment event.totalActivities on new activity ── */
ActivitySchema.post("save", async function (doc) {
  if (doc._wasNewDoc) {
    await mongoose.model("Event")
      .findByIdAndUpdate(doc.eventId, { $inc: { totalActivities: 1 } })
      .catch((e) => console.error("totalActivities increment failed:", e.message));
  }
});

/* ── Hook: decrement event.totalActivities on delete ── */
ActivitySchema.post("findOneAndDelete", async function (doc) {
  if (doc) {
    await mongoose.model("Event")
      .findByIdAndUpdate(doc.eventId, { $inc: { totalActivities: -1 } })
      .catch((e) => console.error("totalActivities decrement failed:", e.message));
  }
});

export const Activity = mongoose.model("Activity", ActivitySchema);
export default Activity;
