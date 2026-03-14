import express from "express";
import { verifyJWT } from "../../middleware/auth.middleware.js";
import {
  createBooking,
  getBookingById,
  getMyBookings,
  getProviderBookings,
  updateBookingStatus,
  getProviderStats,
  getInstitutionBookings,
} from "../../controllers/institution/booking.controller.js";

/*
 * Wire in app.js:
 *   import bookingRoutes from "./routes/institution/booking.routes.js";
 *   app.use("/api/v1/bookings", bookingRoutes);
 *
 * ORDERING: fixed paths (/my, /incoming, /stats)
 * MUST come before /:bookingId.
 */

const router = express.Router();
router.use(verifyJWT);

/* ── Fixed paths ─────────────────────────────────────────────────*/

// POST /api/v1/bookings/request            create booking (consumer)
router.post("/request", createBooking);

// GET  /api/v1/bookings/my?status=&page=   consumer's own bookings
router.get("/my", getMyBookings);

// GET  /api/v1/bookings/incoming?status=   provider's incoming bookings
router.get("/incoming", getProviderBookings);

// GET  /api/v1/bookings/stats              provider dashboard summary
router.get("/stats", getProviderStats);

// GET  /api/v1/bookings/by-institution/:institutionId   B2B history (founder only)
router.get("/by-institution/:institutionId", getInstitutionBookings);

/* ── Param routes /:bookingId ────────────────────────────────────*/

// GET   /api/v1/bookings/:bookingId        single booking (consumer or provider)
// PATCH /api/v1/bookings/:bookingId/status update status (provider only)
router.get(  "/:bookingId",        getBookingById);
router.patch("/:bookingId/status", updateBookingStatus);

export default router;