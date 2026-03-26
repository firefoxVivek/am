import mongoose from "mongoose";
import { EventParticipation } from "../../../models/event/participation.model.js";
import { Activity }           from "../../../models/event/Activity/masterday.model.js";
import { Event }              from "../../../models/event/event.model.js";
import User                   from "../../../models/Profile/auth.models.js";
import { UserProfile }        from "../../../models/Profile/profile.model.js";
import admin                  from "../../../../config/firebase.js";
import { ApiError }           from "../../../utils/ApiError.js";
import { ApiResponse }        from "../../../utils/ApiResponse.js";
import { asynchandler }       from "../../../utils/asynchandler.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* ══════════════════════════════════════════════════════════
   CHECK CONTACT REQUIRED
   GET /api/v1/events/participation/check-contact
   Auth: required
   Returns: { contactRequired: bool, phone: string|null }
   Flutter calls this before showing the registration sheet —
   if contactRequired=true, show a phone number input field.
══════════════════════════════════════════════════════════ */
export const checkContactRequired = asynchandler(async (req, res) => {
  const profile = await UserProfile.findOne({ userId: req.user._id })
    .select("socialLinks.phone")
    .lean();

  const phone = profile?.socialLinks?.phone?.trim() || null;

  return res.status(200).json(
    new ApiResponse(200, { contactRequired: !phone, phone }, "Contact check done")
  );
});

/* ══════════════════════════════════════════════════════════
   REGISTER FOR ACTIVITY
   POST /api/v1/events/participation/register
   Auth: required
   Body: eventId, activityId, role, userName
         [teamName, teamMembers[]]
   Note: activityId is required — registration is per-activity
══════════════════════════════════════════════════════════ */
export const registerForActivity = asynchandler(async (req, res) => {
  const { eventId, activityId, role, userName, teamName, teamMembers, mobileNumber } = req.body;

  if (!eventId || !activityId || !role || !userName) {
    throw new ApiError(400, "eventId, activityId, role, and userName are required");
  }

  if (!["participant", "audience"].includes(role)) {
    throw new ApiError(400, "role must be 'participant' or 'audience'");
  }

  if (!isValidId(eventId) || !isValidId(activityId)) {
    throw new ApiError(400, "Invalid eventId or activityId");
  }

  // ── Contact number check ─────────────────────────────────────────────────
  // If the user has no phone on their profile, mobileNumber must be provided.
  // If provided, save it to their profile immediately so they don't get asked again.
  const profile = await UserProfile.findOne({ userId: req.user._id })
    .select("socialLinks")
    .lean();

  const existingPhone = profile?.socialLinks?.phone?.trim() || null;

  if (!existingPhone) {
    if (!mobileNumber || !mobileNumber.toString().trim()) {
      throw new ApiError(400, "mobileNumber is required — please provide your contact number");
    }

    const cleaned = mobileNumber.toString().trim();

    // Basic validation: 10-digit Indian number (with optional +91 prefix)
    const phoneRegex = /^(\+91)?[6-9]\d{9}$/;
    if (!phoneRegex.test(cleaned.replace(/\s/g, ""))) {
      throw new ApiError(400, "Please provide a valid 10-digit mobile number");
    }

    // Save to profile so future registrations skip this step
    await UserProfile.findOneAndUpdate(
      { userId: req.user._id },
      { $set: { "socialLinks.phone": cleaned } }
    );
  }
  // If existingPhone is present, we skip — no action needed.

  // ── Verify event is published ────────────────────────────────────────────
  const event = await Event.findById(eventId).select("status name").lean();
  if (!event) throw new ApiError(404, "Event not found");
  if (event.status !== "published") throw new ApiError(400, "Event is not open for registration");

  // ── Verify activity exists, belongs to event, and registration is open ───
  const activity = await Activity.findOne({ _id: activityId, eventId })
    .select("activityName status registrationDeadline maxParticipants registrationsCount participationFee teamAllowed teamSize")
    .lean();

  if (!activity) throw new ApiError(404, "Activity not found in this event");
  if (activity.status === "cancelled") throw new ApiError(400, "This activity has been cancelled");
  if (new Date() > new Date(activity.registrationDeadline)) {
    throw new ApiError(400, "Registration deadline for this activity has passed");
  }

  // ── Check capacity ───────────────────────────────────────────────────────
  if (activity.maxParticipants !== null && activity.registrationsCount >= activity.maxParticipants) {
    throw new ApiError(400, "This activity has reached maximum capacity");
  }

  // ── Team validation ──────────────────────────────────────────────────────
  if (role === "participant" && activity.teamAllowed) {
    if (!teamName) throw new ApiError(400, "teamName is required for team-based activities");
    const memberCount = (teamMembers || []).length + 1; // +1 for the registering user
    if (memberCount < activity.teamSize.min || memberCount > activity.teamSize.max) {
      throw new ApiError(400, `Team size must be between ${activity.teamSize.min} and ${activity.teamSize.max}`);
    }
  }

  // ── Duplicate check ──────────────────────────────────────────────────────
  const existing = await EventParticipation.findOne({ activityId, userId: req.user._id }).lean();
  if (existing) throw new ApiError(409, "You are already registered for this activity");

  // ── Create participation ─────────────────────────────────────────────────
  const participation = await EventParticipation.create({
    eventId,
    activityId,
    userId:      req.user._id,
    userName,
    role,
    teamName:    teamName    || null,
    teamMembers: teamMembers || [],
    paymentStatus: (activity.participationFee ?? 0) > 0 ? "pending" : "done",
  });

  // ── FCM: subscribe device to activity topic for push updates ─────────────
  const userDoc = await User.findById(req.user._id).select("deviceToken").lean();
  if (userDoc?.deviceToken) {
    admin.messaging()
      .subscribeToTopic([userDoc.deviceToken], `activity_${activityId}`)
      .catch((e) => console.error("FCM subscribe:", e.message));
  }

  return res.status(201).json(new ApiResponse(201, participation, "Registered successfully"));
});

/* ══════════════════════════════════════════════════════════
   CANCEL MY REGISTRATION
   DELETE /api/v1/events/participation/:activityId/cancel
   Auth: required
══════════════════════════════════════════════════════════ */
export const cancelRegistration = asynchandler(async (req, res) => {
  const { activityId } = req.params;
  if (!isValidId(activityId)) throw new ApiError(400, "Invalid activityId");

  const record = await EventParticipation.findOneAndDelete({
    activityId,
    userId: req.user._id,
  });

  if (!record) throw new ApiError(404, "Registration not found");

  // Unsubscribe from FCM topic (non-blocking)
  const userDoc = await User.findById(req.user._id).select("deviceToken").lean();
  if (userDoc?.deviceToken) {
    admin.messaging()
      .unsubscribeFromTopic([userDoc.deviceToken], `activity_${activityId}`)
      .catch((e) => console.error("FCM unsubscribe:", e.message));
  }

  return res.status(200).json(new ApiResponse(200, null, "Registration cancelled"));
});

/* ══════════════════════════════════════════════════════════
   MARK ATTENDANCE
   PATCH /api/v1/events/participation/:participationId/attendance
   Auth: required  (club admin / event organiser)
   Body: attendance (present | absent)
══════════════════════════════════════════════════════════ */
export const markAttendance = asynchandler(async (req, res) => {
  const { participationId } = req.params;
  const { attendance } = req.body;

  if (!["present", "absent"].includes(attendance)) {
    throw new ApiError(400, "attendance must be 'present' or 'absent'");
  }

  if (!isValidId(participationId)) throw new ApiError(400, "Invalid participationId");

  const record = await EventParticipation.findById(participationId);
  if (!record) throw new ApiError(404, "Participation record not found");

  record.attendance = attendance;
  record.auditedBy  = req.user._id;
  await record.save();

  return res.status(200).json(new ApiResponse(200, record, "Attendance marked"));
});

/* ══════════════════════════════════════════════════════════
   GET PARTICIPANTS BY ACTIVITY
   GET /api/v1/events/participation/activity/:activityId
   Auth: required
   Query: role (participant | audience)  — optional
══════════════════════════════════════════════════════════ */
export const getParticipantsByActivity = asynchandler(async (req, res) => {
  const { activityId } = req.params;
  const { role } = req.query;

  if (!isValidId(activityId)) throw new ApiError(400, "Invalid activityId");

  if (role && !["participant", "audience"].includes(role)) {
    throw new ApiError(400, "role must be 'participant' or 'audience'");
  }

  const filter = { activityId };
  if (role) filter.role = role;

  const participants = await EventParticipation.find(filter)
    .sort({ createdAt: 1 })
    .lean();

  return res.status(200).json(
    new ApiResponse(200, { count: participants.length, participants }, "Participants fetched")
  );
});

/* ══════════════════════════════════════════════════════════
   GET ALL PARTICIPANTS FOR AN EVENT  (across all activities)
   GET /api/v1/events/participation/event/:eventId
   Auth: required
   Query: role, activityId (filter to one activity)
══════════════════════════════════════════════════════════ */
export const getParticipantsByEvent = asynchandler(async (req, res) => {
  const { eventId } = req.params;
  const { role, activityId } = req.query;

  if (!isValidId(eventId)) throw new ApiError(400, "Invalid eventId");

  const filter = { eventId };
  if (role)       filter.role       = role;
  if (activityId) filter.activityId = activityId;

  const participants = await EventParticipation.find(filter)
    .populate("activityId", "activityName dayNumber date category")
    .sort({ createdAt: 1 })
    .lean();

  return res.status(200).json(
    new ApiResponse(200, { count: participants.length, participants }, "Participants fetched")
  );
});

/* ══════════════════════════════════════════════════════════
   GET MY REGISTRATION FOR A SPECIFIC ACTIVITY
   GET /api/v1/events/participation/my/activity/:activityId
   Auth: required
══════════════════════════════════════════════════════════ */
export const getMyActivityRegistration = asynchandler(async (req, res) => {
  const { activityId } = req.params;
  if (!isValidId(activityId)) throw new ApiError(400, "Invalid activityId");

  const record = await EventParticipation.findOne({ activityId, userId: req.user._id })
    .populate("eventId",    "name startDate endDate banner status")
    .populate("activityId", "activityName category dayNumber date venueLogistics status")
    .lean();

  if (!record) throw new ApiError(404, "You are not registered for this activity");

  return res.status(200).json(new ApiResponse(200, record, "Registration fetched"));
});

/* ══════════════════════════════════════════════════════════
   GET ALL MY REGISTRATIONS  (across all events/activities)
   GET /api/v1/events/participation/me
   Auth: required
══════════════════════════════════════════════════════════ */
export const getMyRegistrations = asynchandler(async (req, res) => {
  const registrations = await EventParticipation.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .populate("eventId",    "name banner type genre startDate endDate status")
    .populate("activityId", "activityName category dayNumber date participationFee registrationDeadline venueLogistics status")
    .lean();

  return res.status(200).json(
    new ApiResponse(200, { count: registrations.length, registrations }, "Registrations fetched")
  );
});

/* ══════════════════════════════════════════════════════════
   GET MY REGISTRATIONS GROUPED BY DATE  (calendar view)
   GET /api/v1/events/participation/me/calendar
   Auth: required
══════════════════════════════════════════════════════════ */
export const getMyRegistrationsCalendar = asynchandler(async (req, res) => {
  const data = await EventParticipation.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(req.user._id) } },
    {
      $lookup: {
        from: "activities",
        localField: "activityId",
        foreignField: "_id",
        as: "activity",
        pipeline: [{ $project: { activityName: 1, category: 1, dayNumber: 1, date: 1, venueLogistics: 1, status: 1 } }],
      },
    },
    { $unwind: { path: "$activity", preserveNullAndEmpty: true } },
    {
      $addFields: {
        calendarDate: {
          $dateToString: { format: "%Y-%m-%d", date: { $ifNull: ["$activity.date", "$createdAt"] } },
        },
      },
    },
    {
      $group: {
        _id: "$calendarDate",
        count: { $sum: 1 },
        items: { $push: "$$ROOT" },
      },
    },
    { $project: { _id: 0, date: "$_id", count: 1, items: 1 } },
    { $sort: { date: 1 } },
  ]);

  return res.status(200).json(new ApiResponse(200, data, "Calendar registrations fetched"));
});

/* ══════════════════════════════════════════════════════════
   NOTIFY ACTIVITY PARTICIPANTS  (admin broadcast)
   POST /api/v1/events/participation/activity/:activityId/notify
   Auth: required
   Body: title, message, [data{}]
══════════════════════════════════════════════════════════ */
export const notifyActivityParticipants = asynchandler(async (req, res) => {
  const { activityId } = req.params;
  const { title, message, data = {} } = req.body;

  if (!isValidId(activityId)) throw new ApiError(400, "Invalid activityId");
  if (!message) throw new ApiError(400, "message is required");

  await admin.messaging().send({
    topic: `activity_${activityId}`,
    notification: {
      title: title || "Activity Update",
      body: message.length > 120 ? message.slice(0, 117) + "..." : message,
    },
    data: {
      activityId: activityId.toString(),
      type: "ACTIVITY_NOTIFY",
      ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    },
  });

  return res.status(200).json(new ApiResponse(200, null, "Notification sent"));
});