import mongoose, { Schema } from "mongoose";

/**
 * Payment — single source of truth for all money movement in Akalpit
 *
 * sourceType maps to:
 *   booking      → Booking model     (institution service bookings)
 *   event        → Activity model    (event registration fee)
 *   sponsorship  → SponsorshipDeal   (sponsor paying a club/event)
 *   membership   → ClubMembership    (paid club membership)
 *   premium      → User              (app premium subscription)
 */

const refundSchema = new Schema(
  {
    razorpayRefundId: { type: String, required: true },
    amount:           { type: Number, required: true, min: 0 },
    reason:           { type: String, trim: true, default: null },
    status: {
      type: String,
      enum: ["pending", "processed", "failed"],
      default: "pending",
    },
    initiatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    processedAt: { type: Date, default: null },
  },
  { _id: true, timestamps: true }
);

const paymentSchema = new Schema(
  {
    // ── Who paid ──────────────────────────────────────────────────────────────
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ── What they paid for ────────────────────────────────────────────────────
    sourceType: {
      type: String,
      enum: ["booking", "event", "sponsorship", "membership", "premium"],
      required: true,
      index: true,
    },
    sourceId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: "sourceModel",
    },
    sourceModel: {
      type: String,
      required: true,
      enum: ["Booking", "Activity", "SponsorshipDeal", "ClubMembership", "User"],
    },

    // ── Amount (in paise — Razorpay standard, ₹1 = 100 paise) ────────────────
    amount:         { type: Number, required: true, min: 0 },
    amountRefunded: { type: Number, default: 0, min: 0 },
    currency:       { type: String, default: "INR" },

    // ── Razorpay identifiers ──────────────────────────────────────────────────
    razorpayOrderId:   { type: String, unique: true, sparse: true },
    razorpayPaymentId: { type: String, unique: true, sparse: true },
    razorpaySignature: { type: String, default: null },

    // ── Status ────────────────────────────────────────────────────────────────
    // created        → order created, user not yet paid
    // paid           → payment captured, webhook confirmed
    // failed         → payment attempt failed
    // refunded       → fully refunded
    // partial_refund → partially refunded
    status: {
      type: String,
      enum: ["created", "paid", "failed", "refunded", "partial_refund"],
      default: "created",
      index: true,
    },

    // ── Premium billing (only when sourceType === "premium") ──────────────────
    premium: {
      plan:        { type: String, enum: ["monthly", "yearly", "one_time"], default: null },
      periodStart: { type: Date, default: null },
      periodEnd:   { type: Date, default: null },
    },

    // ── Refunds array (supports partial refunds) ──────────────────────────────
    refunds: { type: [refundSchema], default: [] },

    // ── Webhook metadata ──────────────────────────────────────────────────────
    webhookVerified: { type: Boolean, default: false },
    paidAt:          { type: Date, default: null },

    // ── Display description ───────────────────────────────────────────────────
    description: { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ sourceType: 1, sourceId: 1 });
paymentSchema.index({ razorpayOrderId: 1 });
paymentSchema.index({ status: 1, createdAt: -1 });

export const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;