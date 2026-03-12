import express from "express";
import {
  createActivity,
  getActivitiesByEvent,
  getEventSchedule,
  getActivityById,
  updateActivity,
  deleteActivity,
} from "../../../controllers/events/Activity/Activity.controller.js";
import { verifyJWT } from "../../../middleware/auth.middleware.js";

const router = express.Router();

/**
 * Base: /api/v1/events/activity
 * Rule: /schedule must come before /:activityId
 */

// ── Public ──────────────────────────────────────────────
router.get("/:eventId/schedule",                      getEventSchedule);     // GET  /activity/:eventId/schedule
router.get("/:eventId/activities",                    getActivitiesByEvent); // GET  /activity/:eventId/activities?status=&category=
router.get("/:eventId/activities/:activityId",        getActivityById);      // GET  /activity/:eventId/activities/:activityId

// ── Protected writes ────────────────────────────────────
router.post("/:eventId/activities",                   verifyJWT, createActivity);  // POST   /activity/:eventId/activities
router.patch("/:eventId/activities/:activityId",      verifyJWT, updateActivity);  // PATCH  /activity/:eventId/activities/:activityId
router.delete("/:eventId/activities/:activityId",     verifyJWT, deleteActivity);  // DELETE /activity/:eventId/activities/:activityId

export default router;
