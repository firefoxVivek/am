 
import Booking from "../../models/institution/booking.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asynchandler } from "../../utils/asynchandler.js";

/* ---------------------------------------
   USER ACTIONS (Consumer)
--------------------------------------- */

// 1. Create a New Booking
export const createBooking = asynchandler(async (req, res) => {
  const { 
    providerId, cardId, itemName, bookingType, 
    schedule, quantity, totalAmount 
  } = req.body;

  // Basic validation
  if (!providerId || !cardId || !itemName || !totalAmount) {
    throw new ApiError(400, "Missing required booking details");
  }

  const booking = await Booking.create({
    userId: req.user._id, // From verifyJWT
    providerId,
    cardId,
    itemName,
    bookingType,
    schedule,
    quantity,
    totalAmount,
    status: "pending",
    paymentStatus: "unpaid"
  });

  // TODO: Trigger FCM Notification to the Provider (Institution)
  // "New booking request for [itemName] from [req.user.displayName]"

  return res.status(201).json(
    new ApiResponse(201, booking, "Booking request sent successfully")
  );
});

// 2. Get My Bookings (For the User's History)
export const getMyBookings = asynchandler(async (req, res) => {
  const bookings = await Booking.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .populate("providerId", "displayName logo"); // Show who they booked with

  return res.status(200).json(new ApiResponse(200, bookings));
});

/* ---------------------------------------
   PROVIDER ACTIONS (Institution Admin)
--------------------------------------- */

// 3. Get All Incoming Bookings for my Institution
export const getProviderBookings = asynchandler(async (req, res) => {
  // Only the institution owner can see these
  const bookings = await Booking.find({ providerId: req.user._id })
    .sort({ createdAt: -1 })
    .populate("userId", "displayName email phone"); // Show who is booking

  return res.status(200).json(new ApiResponse(200, bookings));
});

// 4. Update Booking Status (Accept/Reject/Complete)
export const updateBookingStatus = asynchandler(async (req, res) => {
  const { bookingId } = req.params;
  const { status } = req.body; // "confirmed", "rejected", "completed"

  const booking = await Booking.findOneAndUpdate(
    { _id: bookingId, providerId: req.user._id }, // Ensure owner is updating
    { $set: { status } },
    { new: true }
  );

  if (!booking) {
    throw new ApiError(404, "Booking not found or unauthorized");
  }

  // TODO: Trigger FCM Notification back to User
  // "Your booking for [itemName] has been [status]"

  return res.status(200).json(
    new ApiResponse(200, booking, `Booking marked as ${status}`)
  );
});