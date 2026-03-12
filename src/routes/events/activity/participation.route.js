import express from "express";
import {
  registerForActivity,
  cancelRegistration,
  markAttendance,
  getParticipantsByActivity,
  getParticipantsByEvent,
  getMyActivityRegistration,
  getMyRegistrations,
  getMyRegistrationsCalendar,
  notifyActivityParticipants,
} from "../../../controllers/events/Activity/participation.controller.js";
import { verifyJWT } from "../../../middleware/auth.middleware.js";

const router = express.Router();

/**
 * Base: /api/v1/events/participation
 * Rule: /me/* and static paths MUST come before /:participationId param routes
 */

// ── My registrations (most specific first) ───────────────
router.get("/me/calendar",                    verifyJWT, getMyRegistrationsCalendar);   // GET  /participation/me/calendar
router.get("/me",                             verifyJWT, getMyRegistrations);            // GET  /participation/me
router.get("/my/activity/:activityId",        verifyJWT, getMyActivityRegistration);    // GET  /participation/my/activity/:activityId

// ── Admin reads ──────────────────────────────────────────
router.get("/activity/:activityId",           verifyJWT, getParticipantsByActivity);    // GET  /participation/activity/:activityId?role=
router.get("/event/:eventId",                 verifyJWT, getParticipantsByEvent);       // GET  /participation/event/:eventId?role=&activityId=

// ── Register / Cancel ────────────────────────────────────
router.post("/register",                      verifyJWT, registerForActivity);           // POST   /participation/register
router.delete("/:activityId/cancel",          verifyJWT, cancelRegistration);           // DELETE /participation/:activityId/cancel

// ── Admin: notify broadcast ──────────────────────────────
router.post("/activity/:activityId/notify",   verifyJWT, notifyActivityParticipants);   // POST   /participation/activity/:activityId/notify

// ── Attendance (participationId param — keep last) ───────
router.patch("/:participationId/attendance",  verifyJWT, markAttendance);               // PATCH  /participation/:participationId/attendance

export default router;
