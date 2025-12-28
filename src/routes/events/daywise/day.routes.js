import express from "express";
import {
  createEventDay,
  getEventDaysByEvent,
  getEventDayById,
  updateEventDay,
  deleteEventDay,
} from "../../../controllers/events/daywise/daywise.controller.js";

const router = express.Router();

/**
 * Base: /api/events/:eventId/days
 */

/* ---------------- Create Day ---------------- */
router.post("/:eventId/days", createEventDay);

/* ---------------- Get All Days of Event ---------------- */
router.get("/:eventId/days", getEventDaysByEvent);

/* ---------------- Get Single Day ---------------- */
router.get("/:eventId/days/:dayId", getEventDayById);

/* ---------------- Update Day ---------------- */
router.patch("/:eventId/days/:dayId", updateEventDay);

/* ---------------- Delete Day ---------------- */
router.delete("/:eventId/days/:dayId", deleteEventDay);

export default router;
