import mongoose from "mongoose";

const serviceItemSchema = new mongoose.Schema(
  {
    name:  { type: String, required: true, trim: true },
    price: { type: String, required: true },  // kept as String to support "₹500/hr", "Free", etc.
    unit:  { type: String, required: true },  // "per hour", "per day", "per session"
  },
  { _id: false }
);

const serviceCardSchema = new mongoose.Schema(
  {
    // The User who owns this card (institution founder's userId)
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // The Institution this card belongs to — was missing before, causing getInstitutionCards
    // to always return 0 results when queried by institution._id
    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Institution",
      required: true,
      index: true,
    },

    // Stable public identifier for the card (used in bookings as cardId)
    cardId: {
      type: String,
      required: true,
      default: () => new mongoose.Types.ObjectId().toHexString(),
    },

    title:    { type: String, required: true, trim: true, maxlength: 150 },
    about:    { type: String, trim: true, maxlength: 1000 },
    imageUrl: { type: String, trim: true },

    customFields: {
      isVenue:   { type: Boolean, default: false },
      capacity:  { type: Number, default: null },
      amenities: { type: [String], default: [] },
    },

    /*
     * AVAILABILITY
     * ─────────────────────────────────────────────────────────────
     * Controls whether users can currently submit booking requests.
     *
     * status values:
     *   "open"     — always bookable, no date restriction
     *   "limited"  — bookable until `closesAt` (e.g. admissions deadline)
     *   "seasonal" — bookable only between `opensAt` and `closesAt`
     *   "closed"   — not accepting bookings right now
     *
     * note: free-text shown to users, e.g. "Registrations close 30 June"
     */
    availability: {
      status:   { type: String, enum: ["open", "limited", "seasonal", "closed"], default: "open" },
      opensAt:  { type: Date, default: null },   // used by "seasonal"
      closesAt: { type: Date, default: null },   // used by "limited" + "seasonal"
      note:     { type: String, trim: true, maxlength: 200, default: "" },
    },

    itemsList: {
      type: [serviceItemSchema],
      default: [],
    },

    // Soft-delete support — keeps booking history intact
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

/* ---------------------------------------------------------------
   INDEXES
--------------------------------------------------------------- */

// Primary query path: all active cards for an institution (public listing)
serviceCardSchema.index({ institutionId: 1, isActive: 1, createdAt: -1 });

// Provider's own card management panel
serviceCardSchema.index({ providerId: 1, createdAt: -1 });

/* ---------------------------------------------------------------
   EXPORT
--------------------------------------------------------------- */

const ServiceCard = mongoose.model("ServiceCard", serviceCardSchema);
export default ServiceCard;