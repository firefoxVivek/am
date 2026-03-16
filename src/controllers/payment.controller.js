import crypto from "crypto";
import Razorpay from "razorpay";
import { asynchandler } from "../utils/asynchandler.js";
import Payment from "../models/payment.model.js";
import { ClubMembership } from "../models/connections/userToClub.model.js";
import Booking from "../models/institution/booking.model.js";
import { SponsorshipDeal } from "../models/sponsorship/sponsorship.model.js";
import { User } from "../models/Profile/auth.models.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { notify } from "../utils/notify.js";

// Lazy-initialized — created on first use so .env is loaded before this runs
let _razorpay;
const getRazorpay = () => {
  if (!_razorpay) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in .env");
    }
    _razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return _razorpay;
};

const SOURCE_MODEL_MAP = {
  booking:     "Booking",
  event:       "Activity",
  sponsorship: "SponsorshipDeal",
  membership:  "ClubMembership",
  premium:     "User",
};

const PREMIUM_AMOUNTS = {
  monthly:  { amount: 9900,   label: "Premium Monthly"  },
  yearly:   { amount: 99900,  label: "Premium Yearly"   },
  one_time: { amount: 199900, label: "Premium Lifetime" },
};

function verifySignature(orderId, paymentId, signature) {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return expected === signature;
}

// ── Mark source document as paid ──────────────────────────────────────────────
async function markSourcePaid(sourceType, sourceId, payment) {
  switch (sourceType) {
    case "booking":
      await Booking.findByIdAndUpdate(sourceId, { paymentStatus: "paid" });
      break;
    case "membership":
      await ClubMembership.findByIdAndUpdate(sourceId, { paymentStatus: "paid" });
      break;
    case "sponsorship":
      await SponsorshipDeal.findByIdAndUpdate(sourceId, { paymentStatus: "paid" });
      break;
    case "premium": {
      // Mark the user as premium and set expiry from payment record
      const update = { isPremium: true };
      if (payment?.premium?.periodEnd) {
        update.premiumExpiry = payment.premium.periodEnd;
      }
      await User.findByIdAndUpdate(sourceId, update);
      break;
    }
    default:
      break;
  }
}

// ── 1. Create Order  POST /payments/create-order ──────────────────────────────
export const createOrder = asynchandler(async (req, res) => {
  const { sourceType, sourceId, premiumPlan } = req.body;

  if (!sourceType || !SOURCE_MODEL_MAP[sourceType]) {
    throw new ApiError(400, "Valid sourceType is required.");
  }

  let amount;
  let description;
  const sourceModel = SOURCE_MODEL_MAP[sourceType];

  if (sourceType === "premium") {
    if (!PREMIUM_AMOUNTS[premiumPlan]) {
      throw new ApiError(400, "Valid premiumPlan (monthly/yearly/one_time) is required.");
    }
    amount      = PREMIUM_AMOUNTS[premiumPlan].amount;
    description = PREMIUM_AMOUNTS[premiumPlan].label;

  } else if (sourceType === "booking") {
    const booking = await Booking.findById(sourceId).select("totalAmount paymentStatus");
    if (!booking) throw new ApiError(404, "Booking not found.");
    if (booking.paymentStatus === "paid") throw new ApiError(400, "Booking already paid.");
    amount      = Math.round(booking.totalAmount * 100);
    description = "Booking Payment";

  } else if (sourceType === "event") {
    // Dynamic import — path relative to THIS file (src/controllers/payment.controller.js)
    const { Activity } = await import("../models/event/Activity/masterday.model.js");
    const activity = await Activity.findById(sourceId).select("participationFee activityName");
    if (!activity) throw new ApiError(404, "Activity not found.");
    amount      = Math.round(activity.participationFee * 100);
    description = `Event Registration — ${activity.activityName}`;

  } else if (sourceType === "sponsorship") {
    const deal = await SponsorshipDeal.findById(sourceId).select("agreedAmount status");
    if (!deal) throw new ApiError(404, "Sponsorship deal not found.");
    if (deal.status !== "accepted") throw new ApiError(400, "Deal must be accepted before payment.");
    amount      = Math.round(deal.agreedAmount * 100);
    description = "Sponsorship Payment";

  } else if (sourceType === "membership") {
    const membership = await ClubMembership.findById(sourceId).select("membershipFee paymentStatus");
    if (!membership) throw new ApiError(404, "Membership not found.");
    if (membership.paymentStatus === "paid") throw new ApiError(400, "Membership already paid.");
    amount      = Math.round((membership.membershipFee || 0) * 100);
    description = "Club Membership Fee";
  }

  if (!amount || amount <= 0) throw new ApiError(400, "Payment amount must be greater than zero.");

  const rzpOrder = await getRazorpay().orders.create({
    amount,
    currency: "INR",
    receipt:  `rcpt_${Date.now()}`,
    notes:    { sourceType, sourceId: sourceId?.toString(), userId: req.user._id.toString() },
  });

  const payment = await Payment.create({
    user:            req.user._id,
    sourceType,
    sourceId:        sourceType === "premium" ? req.user._id : sourceId,
    sourceModel,
    amount,
    razorpayOrderId: rzpOrder.id,
    description,
    ...(sourceType === "premium" && {
      premium: {
        plan:        premiumPlan,
        periodStart: new Date(),
        periodEnd:   premiumPlan === "monthly"
          ? new Date(Date.now() + 30  * 24 * 60 * 60 * 1000)
          : premiumPlan === "yearly"
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          : null, // one_time = lifetime, no expiry
      },
    }),
  });

  return res.status(201).json(
    new ApiResponse(201, {
      orderId:   rzpOrder.id,
      amount:    rzpOrder.amount,
      currency:  rzpOrder.currency,
      paymentId: payment._id,
      key:       process.env.RAZORPAY_KEY_ID,
    }, "Order created. Proceed to payment.")
  );
});

// ── 2. Verify Payment  POST /payments/verify ──────────────────────────────────
export const verifyPayment = asynchandler(async (req, res) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new ApiError(400, "razorpayOrderId, razorpayPaymentId, razorpaySignature are required.");
  }

  if (!verifySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    throw new ApiError(400, "Payment signature verification failed.");
  }

  const payment = await Payment.findOne({ razorpayOrderId });
  if (!payment) throw new ApiError(404, "Payment record not found.");
  if (payment.status === "paid") {
    return res.json(new ApiResponse(200, payment, "Payment already verified."));
  }

  payment.razorpayPaymentId = razorpayPaymentId;
  payment.razorpaySignature = razorpaySignature;
  payment.status            = "paid";
  payment.paidAt            = new Date();
  await payment.save();

  await markSourcePaid(payment.sourceType, payment.sourceId, payment);

  // FIX: notify() takes a single object, not positional args
  await notify({
    recipientId: payment.user,
    type:        "payment_success",
    title:       "Payment Successful",
    body:        `Your payment of ₹${payment.amount / 100} was successful.`,
    payload:     { paymentId: payment._id.toString() },
  });

  return res.json(new ApiResponse(200, payment, "Payment verified successfully."));
});

// ── 3. Webhook  POST /payments/webhook ───────────────────────────────────────
export const handleWebhook = asynchandler(async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const expected  = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest("hex");

  if (expected !== signature) throw new ApiError(400, "Invalid webhook signature.");

  const event   = req.body;
  const payload = event.payload?.payment?.entity;

  if (event.event === "payment.captured" && payload) {
    const payment = await Payment.findOne({ razorpayOrderId: payload.order_id });
    if (payment && payment.status !== "paid") {
      payment.razorpayPaymentId = payload.id;
      payment.status            = "paid";
      payment.paidAt            = new Date();
      payment.webhookVerified   = true;
      await payment.save();
      await markSourcePaid(payment.sourceType, payment.sourceId, payment);
    }
  }

  if (event.event === "payment.failed" && payload) {
    await Payment.findOneAndUpdate(
      { razorpayOrderId: payload.order_id },
      { status: "failed" }
    );
  }

  if (event.event === "refund.processed") {
    const refundEntity = event.payload?.refund?.entity;
    if (refundEntity) {
      const payment = await Payment.findOne({ razorpayPaymentId: refundEntity.payment_id });
      if (payment) {
        const refund = payment.refunds.find((r) => r.razorpayRefundId === refundEntity.id);
        if (refund) {
          refund.status      = "processed";
          refund.processedAt = new Date();
          await payment.save();
        }
      }
    }
  }

  return res.json({ received: true });
});

// ── 4. Initiate Refund  POST /payments/:paymentId/refund ──────────────────────
export const initiateRefund = asynchandler(async (req, res) => {
  const { amount, reason } = req.body;
  const payment = await Payment.findById(req.params.paymentId);

  if (!payment) throw new ApiError(404, "Payment not found.");
  if (!["paid", "partial_refund"].includes(payment.status)) {
    throw new ApiError(400, "Only paid payments can be refunded.");
  }
  if (!payment.razorpayPaymentId) throw new ApiError(400, "Razorpay payment ID missing.");

  const maxRefundable = payment.amount - payment.amountRefunded;
  const refundAmount  = amount ? Math.round(amount * 100) : maxRefundable;

  if (refundAmount <= 0 || refundAmount > maxRefundable) {
    throw new ApiError(400, `Refund must be between ₹1 and ₹${maxRefundable / 100}.`);
  }

  const rzpRefund = await getRazorpay().payments.refund(payment.razorpayPaymentId, {
    amount: refundAmount,
    notes:  { reason: reason || "Refund requested", initiatedBy: req.user._id.toString() },
  });

  payment.refunds.push({
    razorpayRefundId: rzpRefund.id,
    amount:           refundAmount,
    reason:           reason || null,
    status:           "pending",
    initiatedBy:      req.user._id,
  });

  payment.amountRefunded += refundAmount;
  payment.status = payment.amountRefunded >= payment.amount ? "refunded" : "partial_refund";
  await payment.save();

  // FIX: correct notify() signature
  await notify({
    recipientId: payment.user,
    type:        "refund_initiated",
    title:       "Refund Initiated",
    body:        `A refund of ₹${refundAmount / 100} has been initiated.`,
    payload:     { paymentId: payment._id.toString() },
  });

  return res.json(new ApiResponse(200, payment, "Refund initiated successfully."));
});

// ── 5. Payment History  GET /payments/history ─────────────────────────────────
export const getPaymentHistory = asynchandler(async (req, res) => {
  const { page = 1, limit = 20, sourceType, status } = req.query;
  const pageNumber = Math.max(parseInt(page, 10), 1);
  const pageLimit  = Math.min(parseInt(limit, 10), 50);
  const skip       = (pageNumber - 1) * pageLimit;

  const filter = { user: req.user._id };
  if (sourceType) filter.sourceType = sourceType;
  if (status)     filter.status     = status;

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .select("-razorpaySignature -webhookVerified")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit)
      .lean(),
    Payment.countDocuments(filter),
  ]);

  return res.json(
    new ApiResponse(200, {
      payments, total,
      page: pageNumber, limit: pageLimit,
      totalPages:  Math.ceil(total / pageLimit),
      hasNextPage: skip + payments.length < total,
    })
  );
});

// ── 6. Get Single Payment  GET /payments/:paymentId ───────────────────────────
export const getPayment = asynchandler(async (req, res) => {
  const payment = await Payment.findOne({
    _id:  req.params.paymentId,
    user: req.user._id,
  }).select("-razorpaySignature");

  if (!payment) throw new ApiError(404, "Payment not found.");
  return res.json(new ApiResponse(200, payment));
});