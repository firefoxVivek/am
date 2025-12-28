// models/institution.model.js
import mongoose from "mongoose";

const InstitutionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    councilName: {
      type: String,
      trim: true,
    },

    about: {
      type: String,
      maxlength: 2000,
    },

    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      pincode: String,
    },

    themes: {
      type: [String],
      default: [],
    },

    services: {
      type: [String],
      default: [],
    },

    founderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    foundingYear: {
      type: Number,
      min: 1700,
      max: new Date().getFullYear(),
    },

    logo: String,
    website: String,
    contactEmail: String,
    phone: String,

    status: {
      type: String,
      enum: ["draft", "active", "suspended"],
      default: "draft",
      index: true,
    },
  },
  { timestamps: true }
);

export const Institution = mongoose.model(
  "Institution",
  InstitutionSchema
);
export default Institution;