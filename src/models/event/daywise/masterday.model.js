import mongoose from "mongoose";

import { EventDayScheduleSchema } from "./daysubschema/eventDaySchedule.model.js";
import { EventDayAwardSchema } from "./daysubschema/eventDayAward.model.js";
import { EventDayRuleSchema } from "./daysubschema/eventDayRule.model.js";
import { EventDayVenueSchema } from "./daysubschema/eventDayVenue.model.js";
import { EventDayContactSchema } from "./daysubschema/eventDayContact.model.js";

const EventDaySchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
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
      type: [EventDayScheduleSchema],
      default: [],
    },

    awardsRecognition: {
      type: [EventDayAwardSchema],
      default: [],
    },

    rulesGuidelines: {
      type: [EventDayRuleSchema],
      default: [],
    },

    venueLogistics: {
      type: EventDayVenueSchema,
      required: true,
    },

    contactsSupport: {
      type: [EventDayContactSchema],
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
EventDaySchema.index({ eventId: 1, dayNumber: 1 }, { unique: true });
EventDaySchema.index({ eventId: 1, date: 1 });

/* ---------------- Validation ---------------- */
EventDaySchema.pre("validate", async function (next) {
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

export const EventDay = mongoose.model("EventDay", EventDaySchema);
export default EventDay;
