import mongoose from "mongoose";
const { Schema } = mongoose;

const EventSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    banner: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 5000,
    },
    type: {
      type: String,
      enum: ["single_day", "multi_day", "fest"],
      required: true,
      index: true,
    },
    genre: {
      type: String,
      enum: ["technical", "cultural", "sports", "academic", "entrepreneurship", "mixed"],
      required: true,
      index: true,
    },
    location: {
      venue:   { type: String, trim: true, default: null },
      city:    { type: String, trim: true, default: null },
      state:   { type: String, trim: true, default: null },
      country: { type: String, trim: true, default: "India" },
      mapLink: { type: String, trim: true, default: null },
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    clubId: {
      type: Schema.Types.ObjectId,
      ref: "Club",
      required: true,
      index: true,
    },
    institutionId: {
      type: Schema.Types.ObjectId,
      ref: "Institution",
      default: null,
    },
    councilId: {
      type: Schema.Types.ObjectId,
      ref: "Council",
      default: null,
    },
    // Denormalized — maintained by Activity and Participation hooks
    totalActivities: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalRegistrations: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["draft", "published", "completed", "cancelled"],
      default: "draft",
      index: true,
    },
  },
  { timestamps: true }
);

// Compound indexes
EventSchema.index({ name: "text", description: "text" });
EventSchema.index({ startDate: 1, endDate: 1 });
EventSchema.index({ clubId: 1, startDate: 1 });
EventSchema.index({ clubId: 1, status: 1 });
EventSchema.index({ genre: 1, status: 1, startDate: 1 });

export const Event = mongoose.model("Event", EventSchema);
export default Event;
