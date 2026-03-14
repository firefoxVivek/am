import mongoose from "mongoose";

const InstitutionSchema = new mongoose.Schema(
  {
    name: {
      type:     String,
      required: true,
      trim:     true,
      index:    true,
    },

    // Level-2 category (e.g. School, Hospital, Gym)
    // Level-1 parent is the genre (Education, Health, Sports)
    categoryId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Category",
      required: true,
      index:    true,
    },

    subscribersCount: {
      type:    Number,
      default: 0,
      min:     0,
      index:   true,
    },

    // Councils this institution is associated with (snapshot array)
    councilName: [
      {
        councilId: { type: String, trim: true },
        name:      { type: String, trim: true },
        _id:       false,
      },
    ],

    // Physical address string (landmark, street etc.)
    address: {
      type:     String,
      required: true,
      trim:     true,
    },

    // City anchor — refs the 155k Location collection
    locationId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Location",
      required: true,
      index:    true,
    },

    about:  { type: String, maxlength: 2000, default: "" },
    themes: [{ type: String, trim: true }],

    founderId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
      index:    true,
    },

    logo:         { type: String, default: null },
    website:      { type: String, default: null },
    contactEmail: { type: String, default: null },
    phone:        { type: String, default: null },
    instagram:    { type: String, default: null },
    linkedIn:     { type: String, default: null },

    status: {
      type:    String,
      enum:    ["draft", "active", "suspended"],
      default: "draft",
      index:   true,
    },
  },
  { timestamps: true }
);

/* ── Indexes ──────────────────────────────────────────────────────*/

// Full-text search — powers GET /institutions/search?q=
// Without this index the $text query throws a MongoError at runtime.
InstitutionSchema.index({ name: "text", about: "text" });

// Shelf query: all active institutions in a city (one scan, grouped in app)
InstitutionSchema.index({ locationId: 1, status: 1 });

// Discover / filter: all institutions of a type in a city
InstitutionSchema.index({ categoryId: 1, locationId: 1, status: 1 });

// Subscriber ranking within a city
InstitutionSchema.index({ locationId: 1, subscribersCount: -1 });

export const Institution = mongoose.model("Institution", InstitutionSchema);
export default Institution;