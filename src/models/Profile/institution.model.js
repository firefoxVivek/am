import mongoose from "mongoose";

const InstitutionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // Reference to a Category model (e.g., School, Mall, Barber)
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },

    councilName: [
      {
        councilId: { type: String, trim: true },
        name: { type: String, trim: true },
        _id: false
      },
    ],

    // Physical specifics (Landmark, Street, etc.)
    address: {
      type: String, 
      required: true,
      trim: true,
    },

    // The Geographic Anchor (from your 155k docs)
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location", 
      required: true,
      index: true, 
    },

    about: { type: String, maxlength: 2000 },
    themes: [{ type: String }],
   

    founderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    logo: String,
    website: String,
    contactEmail: String,
    phone: String,
    instagram: String,
    linkedIn: String,

    status: {
      type: String,
      enum: ["draft", "active", "suspended"],
      default: "draft",
      index: true,
    },
  },
  { timestamps: true }
);

/* -----------------------------------------------------------
   INDEXING STRATEGY
----------------------------------------------------------- */

// 1. For "Generic" area searches: find all shops in 'Asifabad'
InstitutionSchema.index({ locationId: 1 });

// 2. For "Targeted" searches: find all 'Barbers' in 'Asifabad'
// This is your Compound Index for high-speed filtering
InstitutionSchema.index({ categoryId: 1, locationId: 1 });

export const Institution = mongoose.model("Institution", InstitutionSchema);