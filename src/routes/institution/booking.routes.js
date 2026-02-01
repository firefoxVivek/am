import express from "express";
import { verifyJWT } from "../../middleware/auth.middleware.js";
import {
  createBooking,
  getMyBookings,
  getProviderBookings,
  updateBookingStatus
} from "../../controllers/institution/booking.controller.js";

const router = express.Router();

// All booking routes require a logged-in user
router.use(verifyJWT);

/* --- User (Consumer) Endpoints --- */
router.post("/request", createBooking);
router.get("/my-history", getMyBookings);

/* --- Institution (Provider) Endpoints --- */
router.get("/incoming", getProviderBookings);
router.patch("/manage/:bookingId", updateBookingStatus);

export default router;