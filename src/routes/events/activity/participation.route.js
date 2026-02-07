import express from "express";
import {
  registerForEvent,
  markAttendance,
  getParticipantsByActivity,getMyEventParticipations,getMyEventParticipationsDateWise,
  getMyParticipation,notifyActivity
} from "../../../controllers/events/Activity/participation.controller.js";
import { verifyJWT } from "../../../middleware/auth.middleware.js";
 

const router = express.Router();

/* =========================
   REGISTRATION
========================== */

// register (participant or audience)
router.post("/register", verifyJWT, registerForEvent);

/* =========================
   ATTENDANCE
========================== */

// mark present / absent (admin or coordinator)
router.patch(
  "/:participationId/attendance",
  verifyJWT,
  markAttendance
);

/* =========================
   FETCHING
========================== */

// get participants or audience of an activity
router.get(
  "/activity/:activityId",
  verifyJWT,
  getParticipantsByActivity
);

// get my participation (for profile / ticket page)
router.get(
  "/my/:eventId",
  verifyJWT,
  getMyParticipation
);
router.get(
  "/me/events",
  verifyJWT,
  getMyEventParticipations
);

// optional
router.get(
  "/me/events/date-wise",
  verifyJWT,
  getMyEventParticipationsDateWise
);
router.post(
  "/activities/:activityId/notify",
  verifyJWT,
  // optional: isAdminOrOrganizer
  notifyActivity
);

export default router;
