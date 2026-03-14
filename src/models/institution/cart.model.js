import mongoose from "mongoose";

/*
 * CART MODEL
 * ──────────────────────────────────────────────────────────────────
 * One cart document per user. Upserted on every add/update — never
 * creates duplicate carts for the same user.
 *
 * DESIGN DECISIONS
 * ────────────────
 * • Items from different institutions/providers can coexist in one cart.
 *   Checkout groups them by providerId and creates one Booking per provider.
 *
 * • Snapshots: name, price, imageUrl are copied from the ServiceCard at
 *   add-time. If the provider edits the card after the user added it,
 *   the cart is unaffected. Flutter shows a "price may have changed"
 *   banner if snapshot price ≠ live price at checkout.
 *
 * • Schedule is per-item — a clinic visit and a school admission
 *   are on different dates. If a card has no scheduling concept
 *   (e.g. a product), schedule fields are null.
 *
 * • TTL: cart auto-expires after 7 days of inactivity (updatedAt).
 *   MongoDB removes it silently — no cleanup job needed.
 *   The TTL index is on `expiresAt` which is set to updatedAt + 7d
 *   on every write, so any activity resets the clock.
 */

const CartItemSchema = new mongoose.Schema(
  {
    // ── Source references ────────────────────────────────────────
    cardId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "ServiceCard",
      required: true,
    },

    institutionId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Institution",
      required: true,
    },

    // Provider (institution founder) — used to group items at checkout
    providerId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },

    // ── Snapshots (captured at add-time) ─────────────────────────
    // These never change after the item is added, even if the card is edited.
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

    // Stored as string to preserve "₹500/hr", "Free", "Contact us" etc.
    priceSnapshot: {
      type:    String,
      default: "",
    },

    imageUrl: {
      type:    String,
      default: null,
    },

    bookingType: {
      type:    String,
      enum:    ["venue", "service", "product"],
      required: true,
    },

    // ── Quantity & amount ─────────────────────────────────────────
    quantity: {
      type:    Number,
      default: 1,
      min:     1,
      max:     100,
    },

    // Numeric amount for cart total calculation.
    // 0 if price is non-numeric ("Free", "Contact us").
    unitAmount: {
      type:    Number,
      default: 0,
      min:     0,
    },

    // ── Scheduling (optional — null for non-scheduled items) ──────
    schedule: {
      date:      { type: Date,   default: null },
      startTime: { type: String, default: null }, // "10:00"
      endTime:   { type: String, default: null }, // "12:00"
      duration:  { type: Number, default: null }, // hours
    },

    // ── Notes ─────────────────────────────────────────────────────
    note: {
      type:      String,
      trim:      true,
      maxlength: 300,
      default:   "",
    },
  },
  { _id: true, timestamps: false }
);

const CartSchema = new mongoose.Schema(
  {
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
      unique:   true,   // enforces one cart per user at DB level
      index:    true,
    },

    items: {
      type:    [CartItemSchema],
      default: [],
    },

    // Recomputed on every write — sum of (unitAmount × quantity) for
    // all items where unitAmount > 0.
    totalAmount: {
      type:    Number,
      default: 0,
      min:     0,
    },

    // TTL anchor — set to now + 7 days on every write.
    // MongoDB deletes the cart doc when this date passes.
    // Any cart activity (add/update/remove) resets the clock.
    expiresAt: {
      type:    Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true }
);

/* ── Indexes ──────────────────────────────────────────────────────*/

// TTL index — auto-deletes cart 7 days after last activity
CartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/* ── Helper: recompute totalAmount ───────────────────────────────*/
// Called before every save to keep totalAmount in sync.
CartSchema.methods.recomputeTotal = function () {
  this.totalAmount = this.items.reduce(
    (sum, item) => sum + (item.unitAmount ?? 0) * (item.quantity ?? 1),
    0
  );
  // Reset TTL clock on every write
  this.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
};

export const Cart = mongoose.model("Cart", CartSchema);
export default Cart;