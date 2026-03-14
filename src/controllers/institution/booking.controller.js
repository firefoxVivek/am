import mongoose from "mongoose";
import Booking     from "../../models/institution/booking.model.js";
import ServiceCard from "../../models/institution/serviceCard.model.js";
import { Institution } from "../../models/Profile/institution.model.js";
import { ApiError }    from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asynchandler } from "../../utils/asynchandler.js";
import { notify }      from "../../utils/notify.js";

/* ── State machine ───────────────────────────────────────────────*/
const VALID_TRANSITIONS = {
  pending:   ["confirmed", "rejected"],
  confirmed: ["completed", "cancelled"],
};

const STATUS_NOTIFICATION = {
  confirmed: { type: "BOOKING_CONFIRMED", title: "Booking confirmed",  body: "Your booking has been confirmed." },
  rejected:  { type: "BOOKING_REJECTED",  title: "Booking rejected",   body: "Your booking request was declined." },
  completed: { type: "BOOKING_COMPLETED", title: "Booking completed",  body: "Your booking is marked as completed." },
  cancelled: { type: "BOOKING_CANCELLED", title: "Booking cancelled",  body: "Your booking has been cancelled." },
};

/* ── Helper: parse numeric price from display string ─────────────*/
function parseAmount(str) {
  if (!str) return 0;
  const n = parseFloat(str.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

/* ================================================================
   CREATE BOOKING  (direct — without cart)
   POST /api/v1/bookings/request
   Body: {
     providerId,
     institutionId,
     lineItems: [{ cardId, itemName, quantity, bookingType }],
     schedule?,
     note?
   }

   Used when a user wants to book directly without going through cart.
   Cart checkout calls the same Booking.create() logic internally.
================================================================ */
export const createBooking = asynchandler(async (req, res) => {
  const {
    providerId,
    institutionId,
    lineItems,
    schedule,
    note = "",
    bookedOnBehalfOf = null,   // optional institutionId for B2B bookings
  } = req.body;

  if (!providerId)              throw new ApiError(400, "providerId is required");
  if (!institutionId)           throw new ApiError(400, "institutionId is required");
  if (!Array.isArray(lineItems) || !lineItems.length) {
    throw new ApiError(400, "lineItems must be a non-empty array");
  }

  if (req.user._id.toString() === providerId.toString()) {
    throw new ApiError(400, "You cannot book your own services");
  }

  // ── B2B: resolve bookedBy ─────────────────────────────────────
  // If bookedOnBehalfOf is passed, caller must be the founder of
  // that institution. The booking then shows the institution's
  // name/logo to the provider instead of the founder's personal name.
  let bookedBy = null;

  if (bookedOnBehalfOf) {
    if (!mongoose.Types.ObjectId.isValid(bookedOnBehalfOf)) {
      throw new ApiError(400, "Invalid bookedOnBehalfOf institution ID");
    }

    const clientInstitution = await Institution.findOne({
      _id:       bookedOnBehalfOf,
      founderId: req.user._id,
      status:    "active",
    }).select("name logo").lean();

    if (!clientInstitution) {
      throw new ApiError(
        403,
        "Institution not found or you are not the founder of this institution"
      );
    }

    // Prevent an institution from booking its own provider
    if (bookedOnBehalfOf.toString() === institutionId.toString()) {
      throw new ApiError(400, "An institution cannot book its own services");
    }

    bookedBy = {
      entityType: "institution",
      entityId:   clientInstitution._id,
      name:       clientInstitution.name,
      logo:       clientInstitution.logo ?? null,
    };
  }

  // Validate all referenced cards exist, are active, and belong to this provider
  const cardIds   = lineItems.map((i) => i.cardId);
  const cardIdSet = new Set(cardIds.map(String));

  const cards = await ServiceCard.find({
    _id:        { $in: [...cardIdSet] },
    providerId,
    isActive:   true,
  }).lean();

  if (cards.length !== cardIdSet.size) {
    throw new ApiError(404, "One or more service cards not found or unavailable");
  }

  const cardMap = {};
  for (const c of cards) cardMap[c._id.toString()] = c;

  // Build validated lineItems with snapshots
  const resolvedItems = [];
  for (const item of lineItems) {
    const card = cardMap[item.cardId?.toString()];
    if (!card) throw new ApiError(404, `Card ${item.cardId} not found`);

    // Validate bookingType against card
    if (item.bookingType === "venue" && !card.customFields?.isVenue) {
      throw new ApiError(400, `Card "${card.title}" does not support venue bookings`);
    }

    // Find matching item in card's itemsList for price snapshot
    const cardItem = card.itemsList?.find(
      (ci) => ci.name.toLowerCase() === item.itemName?.trim().toLowerCase()
    );

    const priceSnapshot = cardItem?.price ?? "";
    const unitAmount    = parseAmount(priceSnapshot);
    const quantity      = Math.max(1, parseInt(item.quantity ?? 1, 10));
    const lineTotal     = unitAmount * quantity;

    resolvedItems.push({
      cardId:        card._id,
      cardTitle:     card.title,
      itemName:      cardItem?.name ?? item.itemName?.trim(),
      priceSnapshot,
      unitAmount,
      quantity,
      lineTotal,
      bookingType:   item.bookingType ?? (card.customFields?.isVenue ? "venue" : "service"),
    });
  }

  const totalAmount = resolvedItems.reduce((sum, i) => sum + i.lineTotal, 0);

  const booking = await Booking.create({
    userId:        req.user._id,
    bookedBy,                    // null for personal, institution snapshot for B2B
    providerId,
    institutionId,
    lineItems:     resolvedItems,
    schedule:      schedule ?? { date: null, startTime: null, endTime: null, duration: null },
    note:          note.trim(),
    totalAmount,
    status:        "pending",
    paymentStatus: "unpaid",
  });

  // Notify provider — show institution name if B2B, user name if personal
  const callerName = bookedBy?.name ?? req.user.displayName;
  const itemSummary = resolvedItems
    .map((i) => `${i.itemName} ×${i.quantity}`)
    .join(", ")
    .slice(0, 80);

  await notify({
    recipientId: providerId,
    senderId:    req.user._id,
    type:        "NEW_BOOKING",
    title:       "New booking request",
    body:        `${callerName}: ${itemSummary}`,
    payload: {
      screen:     "BookingDetail",
      entityId:   booking._id.toString(),
      actorId:    req.user._id.toString(),
      actorName:  callerName,
      actorImage: bookedBy?.logo ?? req.user.imageUrl ?? "",
      extra:      { institutionId: institutionId.toString() },
    },
  });

  return res.status(201).json(
    new ApiResponse(201, booking, "Booking request sent")
  );
});

/* ================================================================
   GET SINGLE BOOKING
   GET /api/v1/bookings/:bookingId
================================================================ */
export const getBookingById = asynchandler(async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user._id;

  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw new ApiError(400, "Invalid booking ID");
  }

  const booking = await Booking.findOne({
    _id: bookingId,
    $or: [{ userId }, { providerId: userId }],
  })
    .populate("userId",        "displayName imageUrl email")
    .populate("providerId",    "displayName imageUrl")
    .populate("institutionId", "name logo address")
    .lean();

  if (!booking) throw new ApiError(404, "Booking not found");

  return res.status(200).json(new ApiResponse(200, booking, "Booking fetched"));
});

/* ================================================================
   GET MY BOOKINGS  (consumer)
   GET /api/v1/bookings/my?status=&page=&limit=
================================================================ */
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
      .populate("providerId",    "displayName imageUrl")
      .populate("institutionId", "name logo")
      .lean(),
    Booking.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      bookings,
      pagination: {
        total, page: pageNumber, limit: pageLimit,
        totalPages:  Math.ceil(total / pageLimit),
        hasNextPage: skip + bookings.length < total,
      },
    }, "Bookings fetched")
  );
});

/* ================================================================
   GET INCOMING BOOKINGS  (provider)
   GET /api/v1/bookings/incoming?status=&page=&limit=
================================================================ */
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
      .populate("userId",        "displayName imageUrl email")
      .populate("institutionId", "name logo")
      .lean(),
    Booking.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      bookings,
      pagination: {
        total, page: pageNumber, limit: pageLimit,
        totalPages:  Math.ceil(total / pageLimit),
        hasNextPage: skip + bookings.length < total,
      },
    }, "Incoming bookings fetched")
  );
});

/* ================================================================
   UPDATE BOOKING STATUS  (provider)
   PATCH /api/v1/bookings/:bookingId/status
   Body: { status }
================================================================ */
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

  if (!booking) throw new ApiError(404, "Booking not found or unauthorized");

  const allowed = VALID_TRANSITIONS[booking.status];
  if (!allowed) {
    throw new ApiError(400, `Booking in "${booking.status}" cannot be updated`);
  }
  if (!allowed.includes(status)) {
    throw new ApiError(
      400,
      `Invalid transition "${booking.status}" → "${status}". Allowed: ${allowed.join(", ")}`
    );
  }

  booking.status = status;
  await booking.save();

  const notif = STATUS_NOTIFICATION[status];
  if (notif) {
    await notify({
      recipientId: booking.userId,
      senderId:    req.user._id,
      type:        notif.type,
      title:       notif.title,
      body:        notif.body,
      payload: {
        screen:     "BookingDetail",
        entityId:   booking._id.toString(),
        actorId:    req.user._id.toString(),
        actorName:  req.user.displayName,
        actorImage: req.user.imageUrl ?? "",
        extra:      { status },
      },
    });
  }

  return res.status(200).json(
    new ApiResponse(200, booking, `Booking ${status}`)
  );
});

/* ================================================================
   PROVIDER STATS DASHBOARD
   GET /api/v1/bookings/stats
================================================================ */
export const getProviderStats = asynchandler(async (req, res) => {
  const providerId = req.user._id;

  const stats = await Booking.aggregate([
    { $match: { providerId: new mongoose.Types.ObjectId(providerId) } },
    {
      $group: {
        _id:       null,
        total:     { $sum: 1 },
        pending:   { $sum: { $cond: [{ $eq: ["$status", "pending"]   }, 1, 0] } },
        confirmed: { $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0] } },
        completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        rejected:  { $sum: { $cond: [{ $eq: ["$status", "rejected"]  }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
        revenue: {
          $sum: {
            $cond: [
              { $in: ["$status", ["confirmed", "completed"]] },
              "$totalAmount",
              0,
            ],
          },
        },
      },
    },
    { $project: { _id: 0 } },
  ]);

  return res.status(200).json(
    new ApiResponse(200,
      stats[0] ?? { total: 0, pending: 0, confirmed: 0, completed: 0, rejected: 0, cancelled: 0, revenue: 0 },
      "Provider stats fetched"
    )
  );
});

/* ================================================================
   GET BOOKINGS MADE BY AN INSTITUTION  (B2B history)
   GET /api/v1/bookings/by-institution/:institutionId?status=&page=&limit=

   Returns all bookings placed by this institution on behalf of itself.
   Only the institution founder can access this.
   e.g. School sees all its bookings with caterers, decorators etc.
================================================================ */
export const getInstitutionBookings = asynchandler(async (req, res) => {
  const { institutionId }        = req.params;
  const { status, page = 1, limit = 20 } = req.query;

  if (!mongoose.Types.ObjectId.isValid(institutionId)) {
    throw new ApiError(400, "Invalid institution ID");
  }

  // Only the founder of this institution can see its B2B bookings
  const { Institution } = await import("../../models/Profile/institution.model.js");
  const institution = await Institution.findOne({
    _id:       institutionId,
    founderId: req.user._id,
  }).lean();

  if (!institution) {
    throw new ApiError(403, "Institution not found or you are not the founder");
  }

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const pageLimit  = Math.min(parseInt(limit, 10), 50);
  const skip       = (pageNumber - 1) * pageLimit;

  const filter = { "bookedBy.entityId": institutionId };
  if (status) filter.status = status;

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit)
      .populate("providerId",    "displayName imageUrl")
      .populate("institutionId", "name logo address")
      .lean(),
    Booking.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      bookings,
      pagination: {
        total, page: pageNumber, limit: pageLimit,
        totalPages:  Math.ceil(total / pageLimit),
        hasNextPage: skip + bookings.length < total,
      },
    }, "Institution bookings fetched")
  );
});