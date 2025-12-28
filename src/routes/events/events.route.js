import express from "express";
import {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  publishEvent,
} from "../../controllers/events/events.controller.js";

const router = express.Router();

/**
 * Base: /api/events
 */

/* ---------------- Create Event ---------------- */
router.post("/", createEvent);

/* ---------------- Get Events (list / filters) ---------------- */
router.get("/", getEvents);

/* ---------------- Get Single Event ---------------- */
router.get("/:eventId", getEventById);

/* ---------------- Update Event (partial) ---------------- */
router.patch("/:eventId", updateEvent);

/* ---------------- Delete Event ---------------- */
router.delete("/:eventId", deleteEvent);

/* ---------------- Publish Event ---------------- */
router.patch("/:eventId/publish", publishEvent);

export default router;
