import mongoose from "mongoose";
import admin       from "../../../config/firebase.js";
import Booking     from "../../models/institution/booking.model.js";
import ServiceCard from "../../models/institution/serviceCard.model.js";
import User        from "../../models/Profile/auth.models.js";
import { ApiError }    from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asynchandler } from "../../utils/asynchandler.js";

/* ---------------------------------------------------------------
   CREATE BOOKING
   POST /api/v1/institution/bookings/request
   Validates bookingType against the service card's customFields.
   Notifies the provider via FCM.
--------------------------------------------------------------- */
export const createBooking = asynchandler(async (req, res) => {
  const {
    providerId, cardId, itemName, bookingType,
    schedule, quantity, totalAmount,
  } = req.body;

  if (!providerId || !cardId || !itemName || !totalAmount || !bookingType) {
    throw new ApiError(400, "providerId, cardId, itemName, bookingType, and totalAmount are required");
  }

  // Validate bookingType against the actual service card
  const card = await ServiceCard.findOne({ cardId, providerId, isActive: true }).lean();
  if (!card) {
    throw new ApiError(404, "Service card not found or no longer available");
  }

  // Cross-check: if the card is NOT a venue, reject a "venue" booking type
  if (bookingType === "venue" && !card.customFields?.isVenue) {
    throw new ApiError(400, "This service card does not support venue bookings");
  }

  // Prevent self-booking
  if (req.user._id.toString() === providerId.toString()) {
    throw new ApiError(400, "You cannot book your own service");
  }

  const booking = await Booking.create({
    userId:     req.user._id,
    providerId,
    cardId,
    itemName,
    bookingType,
    schedule,
    quantity:      quantity     || 1,
    totalAmount,
    status:        "pending",
    paymentStatus: "unpaid",
  });

  // ── Notify provider via FCM (non-blocking) ──────────────────
  const provider = await User.findById(providerId).select("deviceTokens").lean();

  if (provider?.deviceTokens?.length) {
    admin.messaging().sendEachForMulticast({
      tokens:       provider.deviceTokens,
      notification: {
        title: "New Booking Request",
        body:  `${req.user.displayName} requested: ${itemName}`,
      },
      data: {
        type:      "NEW_BOOKING",
        bookingId: booking._id.toString(),
        userId:    req.user._id.toString(),
      },
    }).catch((e) => console.error("[FCM] createBooking notify provider:", e.message));
  }

  return res
    .status(201)
    .json(new ApiResponse(201, booking, "Booking request sent successfully"));
});

/* ---------------------------------------------------------------
   GET MY BOOKINGS (Consumer)
   GET /api/v1/institution/bookings/my-history
--------------------------------------------------------------- */
export const getMyBookings = asynchandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const pageLimit  = Math.min(parseInt(limit, 10), 50);
  const skip       = (pageNumber - 1) * pageLimit;

  const filter = { userId: req.user._id };
  if (status) filter.status = status;

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit)
      .populate("providerId", "displayName imageUrl"),
    Booking.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      bookings,
      pagination: {
        total,
        page:        pageNumber,
        limit:       pageLimit,
        totalPages:  Math.ceil(total / pageLimit),
        hasNextPage: skip + bookings.length < total,
      },
    })
  );
});

/* ---------------------------------------------------------------
   GET PROVIDER BOOKINGS (Institution Admin)
   GET /api/v1/institution/bookings/incoming
--------------------------------------------------------------- */
export const getProviderBookings = asynchandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const pageLimit  = Math.min(parseInt(limit, 10), 50);
  const skip       = (pageNumber - 1) * pageLimit;

  const filter = { providerId: req.user._id };
  if (status) filter.status = status;

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit)
      .populate("userId", "displayName email"),
    Booking.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      bookings,
      pagination: {
        total,
        page:        pageNumber,
        limit:       pageLimit,
        totalPages:  Math.ceil(total / pageLimit),
        hasNextPage: skip + bookings.length < total,
      },
    })
  );
});

/* ---------------------------------------------------------------
   UPDATE BOOKING STATUS (Provider)
   PATCH /api/v1/institution/bookings/manage/:bookingId
   Valid transitions: pending → confirmed | rejected
                      confirmed → completed | cancelled
   Notifies the user via FCM after each transition.
--------------------------------------------------------------- */
const VALID_TRANSITIONS = {
  pending:   ["confirmed", "rejected"],
  confirmed: ["completed", "cancelled"],
};

export const updateBookingStatus = asynchandler(async (req, res) => {
  const { bookingId } = req.params;
  const { status }    = req.body;

  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(400, "Invalid booking ID");
  }

  const booking = await Booking.findOne({
    _id:        bookingId,
    providerId: req.user._id,
  });

  if (!booking) {
    throw new ApiError(404, "Booking not found or unauthorized");
  }

  const allowed = VALID_TRANSITIONS[booking.status];
  if (!allowed) {
    throw new ApiError(400, `Booking in status "${booking.status}" cannot be updated`);
  }
  if (!allowed.includes(status)) {
    throw new ApiError(
      400,
      `Invalid transition from "${booking.status}" to "${status}". Allowed: ${allowed.join(", ")}`
    );
  }

  booking.status = status;
  await booking.save();

  // ── Notify the user who made the booking (non-blocking) ─────
  const bookingUser = await User.findById(booking.userId).select("deviceTokens").lean();

  if (bookingUser?.deviceTokens?.length) {
    const statusMessages = {
      confirmed:  "Your booking has been confirmed!",
      rejected:   "Your booking request was declined.",
      completed:  "Your booking is marked as completed.",
      cancelled:  "Your booking has been cancelled.",
    };

    admin.messaging().sendEachForMulticast({
      tokens:       bookingUser.deviceTokens,
      notification: {
        title: "Booking Update",
        body:  statusMessages[status] ?? `Booking status changed to ${status}`,
      },
      data: {
        type:      "BOOKING_STATUS_UPDATE",
        bookingId: booking._id.toString(),
        status,
      },
    }).catch((e) => console.error("[FCM] updateBookingStatus notify user:", e.message));
  }

  return res
    .status(200)
    .json(new ApiResponse(200, booking, `Booking ${status} successfully`));
});