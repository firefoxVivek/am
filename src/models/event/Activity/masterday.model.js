import mongoose from "mongoose";

import { ActivityScheduleSchema } from "./Activityschema/ActivitySchedule.model.js";
import { ActivityAwardSchema } from "./Activityschema/ActivityAward.model.js";
import { ActivityRuleSchema } from "./Activityschema/ActivityRule.model.js";
import { ActivityVenueSchema } from "./Activityschema/ActivityVenue.model.js";
import { ActivityContactSchema } from "./Activityschema/ActivityContact.model.js";

const ActivitySchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    activityName :{
      type:String,
      required:true
    },
    dayNumber: {
      type: Number,
      required: true,
      min: 1,
    },

    date: {
      type: Date,
      required: true,
    },

    scheduling: {
      type: [ActivityScheduleSchema],
      default: [],
    },

    awardsRecognition: {
      type: [ActivityAwardSchema],
      default: [],
    },

    rulesGuidelines: {
      type: [ActivityRuleSchema],
      default: [],
    },

    venueLogistics: {
      type: ActivityVenueSchema,
      required: true,
    },

    contactsSupport: {
      type: [ActivityContactSchema],
      default: [],
    },

    status: {
      type: String,
      enum: ["draft", "active", "completed"],
      default: "draft",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

/* ---------------- Indexes ---------------- */
ActivitySchema.index({ eventId: 1, dayNumber: 1 }, { unique: false });

/* ---------------- Validation ---------------- */
ActivitySchema.pre("validate", async function (next) {
  const Event = mongoose.model("Event");
  const event = await Event.findById(this.eventId).select(
    "startDate endDate"
  );

  if (!event) {
    return next(new Error("Invalid event reference"));
  }

  if (this.date < event.startDate || this.date > event.endDate) {
    return next(
      new Error("Event day date must be within event date range")
    );
  }

  next();
});

export const Activity = mongoose.model("Activity", ActivitySchema);
export default Activity;
