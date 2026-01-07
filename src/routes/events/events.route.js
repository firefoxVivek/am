import express from "express";
import {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  publishEvent,
  getUpcomingClubEvents
} from "../../controllers/events/events.controller.js";

const router = express.Router();

/**
 * Base: /api/events
 */

/* ---------------- Create Event ---------------- */
router.post("/create", createEvent);

/* ---------------- Get Events (list / filters) ---------------- */
router.get("/club/:clubId", getEvents);

/* ---------------- Get Single Event ---------------- */
router.get("/:eventId", getEventById);
router.get("/club/:clubId/upcoming",getUpcomingClubEvents);
/* ---------------- Update Event (partial) ---------------- */
router.patch("/:eventId", updateEvent);

/* ---------------- Delete Event ---------------- */
router.delete("/:eventId", deleteEvent);

/* ---------------- Publish Event ---------------- */
router.patch("/:eventId/publish", publishEvent);

export default router;
