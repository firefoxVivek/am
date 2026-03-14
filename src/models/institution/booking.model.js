import mongoose from "mongoose";

/*
 * BOOKING MODEL
 * ──────────────────────────────────────────────────────────────────
 * One booking document = one order placed by a user with one provider.
 *
 * STRUCTURE
 * ─────────
 * A booking contains an array of lineItems — each item is one
 * service from one service card. A single booking can contain:
 *   - A table for 5 (bookingType: "venue")
 *   - Juice ×2    (bookingType: "service")
 *   - Cake ×1     (bookingType: "service")
 *
 * All from the same provider/institution, in one document.
 * The provider sees a clean itemised receipt.
 * Flutter renders it as an order detail screen with line items.
 *
 * SCHEDULE
 * ────────
 * schedule lives at the booking level (not per-item).
 * It represents the reservation time — when the table is booked,
 * the food is served at that same time. If there's no table,
 * schedule is the requested service appointment time.
 *
 * SNAPSHOTS
 * ─────────
 * cardTitle, itemName, priceSnapshot, bookingType on each lineItem
 * are captured at order time. If the provider edits their card
 * after the booking is placed, the booking history stays correct.
 */

const LineItemSchema = new mongoose.Schema(
  {
    // Reference — for linking back to the card (may become inactive later)
    cardId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "ServiceCard",
      required: true,
    },

    // Snapshots — captured at booking time, never change
    cardTitle: {
      type:     String,
      required: true,
      trim:     true,
    },

    itemName: {
      type:     String,
      required: true,
      trim:     true,
    },

    // Display price string — "₹500/hr", "Free", "Contact us"
    priceSnapshot: {
      type:    String,
      default: "",
    },

    // Numeric unit price for total calculation (0 if non-numeric)
    unitAmount: {
      type:    Number,
      default: 0,
      min:     0,
    },

    quantity: {
      type:    Number,
      required: true,
      min:     1,
      max:     100,
    },

    // Per-item line total = unitAmount × quantity
    lineTotal: {
      type:    Number,
      default: 0,
      min:     0,
    },

    // "venue" | "service" | "product"
    // Each line item carries its own type — table is venue,
    // food items are service. They coexist in one booking.
    bookingType: {
      type:     String,
      enum:     ["venue", "service", "product"],
      required: true,
    },
  },
  { _id: true }   // keep _id so individual items can be referenced
);

/*
 * BOOKED BY — B2B support
 * ────────────────────────
 * When an institution books on behalf of itself (e.g. a school
 * booking a caterer for annual day), this field carries the
 * institution snapshot. When null, it's a personal user booking.
 *
 * The provider sees the institution name + logo instead of the
 * founder's personal name — clean B2B paper trail.
 *
 * entityType "user"        → personal booking (bookedBy: null)
 * entityType "institution" → institutional booking
 */
const BookedBySchema = new mongoose.Schema(
  {
    entityType: {
      type:     String,
      enum:     ["user", "institution"],
      required: true,
    },
    entityId: {
      type:     mongoose.Schema.Types.ObjectId,
      required: true,
    },
    // Snapshot — never changes after booking is placed
    name:  { type: String, trim: true, default: "" },
    logo:  { type: String, default: null },
  },
  { _id: false }
);

const BookingSchema = new mongoose.Schema(
  {
    // Who placed the order (always the logged-in user / founder)
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
      index:    true,
    },

    /*
     * On whose behalf the booking was made.
     * null  → personal booking by userId
     * set   → institutional booking; provider sees institution name/logo
     *
     * Indexed so GET /institutions/:id/bookings works efficiently.
     */
    bookedBy: {
      type:    BookedBySchema,
      default: null,
      index:   true,
    },

    // Who receives and fulfils the order
    providerId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
      index:    true,
    },

    // Which institution this order is for
    // Stored directly so provider dashboard can filter by institution
    institutionId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Institution",
      required: true,
      index:    true,
    },

    // All ordered items — structured, not a text string
    lineItems: {
      type:     [LineItemSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message:   "A booking must have at least one item",
      },
    },

    // Order-level schedule — the reservation/appointment time
    // Applies to the whole booking (table time, clinic slot etc.)
    // null if no scheduling required (e.g. pickup order)
    schedule: {
      date:      { type: Date,   default: null },
      startTime: { type: String, default: null }, // "10:00"
      endTime:   { type: String, default: null }, // "12:00"
      duration:  { type: Number, default: null }, // hours
    },

    // Optional note from the user to the provider
    note: {
      type:      String,
      trim:      true,
      maxlength: 500,
      default:   "",
    },

    // Grand total = sum of all lineItem.lineTotal
    totalAmount: {
      type:     Number,
      required: true,
      min:      0,
    },

    // Order lifecycle
    status: {
      type:    String,
      enum:    ["pending", "confirmed", "rejected", "cancelled", "completed"],
      default: "pending",
      index:   true,
    },

    paymentStatus: {
      type:    String,
      enum:    ["unpaid", "paid", "refunded"],
      default: "unpaid",
    },
  },
  { timestamps: true }
);

/* ── Indexes ──────────────────────────────────────────────────────*/

// Consumer: my orders
BookingSchema.index({ userId: 1, status: 1, createdAt: -1 });

// Provider: incoming orders
BookingSchema.index({ providerId: 1, status: 1, createdAt: -1 });

// Institution dashboard
BookingSchema.index({ institutionId: 1, status: 1, createdAt: -1 });

// B2B: all bookings made by an institution
BookingSchema.index({ "bookedBy.entityId": 1, status: 1, createdAt: -1 });

const Booking = mongoose.model("Booking", BookingSchema);
export default Booking;