import express from "express";
import {
  createActivity,
  getActivity,
  getActivityById,
  updateActivity,getEventSchedule,
  deleteActivity,
} from "../../../controllers/events/Activity/Activity.controller.js";

const router = express.Router();

/**
 * Base: /api/events/:eventId/days
 */

/* ---------------- Create Day ---------------- */
router.post("/:eventId/days", createActivity);

/* ---------------- Get All Days of Event ---------------- */
router.get("/:eventId/days", getActivity);
router.get('/:eventId/schedule',getEventSchedule);
/* ---------------- Get Single Day ---------------- */
router.get("/:eventId/activities/:activityId", getActivityById);

/* ---------------- Update Day ---------------- */
router.patch("/:eventId/days/:dayId", updateActivity);

/* ---------------- Delete Day ---------------- */
router.delete("/:eventId/days/:activityId", deleteActivity);

export default router;
