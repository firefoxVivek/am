import mongoose from "mongoose";
import { Activity }           from "../../../models/event/Activity/masterday.model.js";
import { EventParticipation } from "../../../models/event/participation.model.js";
import { Event }              from "../../../models/event/event.model.js";
import admin                  from "../../../../config/firebase.js";
import { ApiError }           from "../../../utils/ApiError.js";
import { ApiResponse }        from "../../../utils/ApiResponse.js";
import { asynchandler }       from "../../../utils/asynchandler.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* ══════════════════════════════════════════════════════════
   CREATE ACTIVITY
   POST /api/v1/events/activity/:eventId/activities
   Auth: required
   Body: activityName, category, dayNumber, date, registrationDeadline,
         venueLogistics{venueName, ...}, [description, participationFee,
         maxParticipants, teamAllowed, teamSize, scheduling[], 
         awardsRecognition[], rulesGuidelines[], contactsSupport[]]
══════════════════════════════════════════════════════════ */
export const createActivity = asynchandler(async (req, res) => {
  const { eventId } = req.params;
  if (!isValidId(eventId)) throw new ApiError(400, "Invalid eventId");

  const { activityName, category, dayNumber, date, registrationDeadline, venueLogistics } = req.body;

  if (!activityName || !category || !dayNumber || !date || !registrationDeadline || !venueLogistics?.venueName) {
    throw new ApiError(400, "activityName, category, dayNumber, date, registrationDeadline, and venueLogistics.venueName are required");
  }

  // Verify event exists and is not cancelled
  const event = await Event.findById(eventId).select("status name").lean();
  if (!event) throw new ApiError(404, "Event not found");
  if (event.status === "cancelled") throw new ApiError(400, "Cannot add activity to a cancelled event");

  if (new Date(registrationDeadline) > new Date(date)) {
    throw new ApiError(400, "registrationDeadline must be before or on the activity date");
  }

  const activity = await Activity.create({ eventId, ...req.body });

  // FCM — notify event topic if event is published (non-blocking)
  if (event.status === "published") {
    admin.messaging().send({
      topic: `event_${eventId}`,
      notification: { title: "New Activity Added!", body: `${activityName} has been added` },
      data: { eventId, activityId: activity._id.toString(), type: "ACTIVITY_CREATED" },
    }).catch((e) => console.error("FCM createActivity:", e.message));
  }

  return res.status(201).json(new ApiResponse(201, activity, "Activity created successfully"));
});

/* ══════════════════════════════════════════════════════════
   GET ALL ACTIVITIES FOR AN EVENT
   GET /api/v1/events/activity/:eventId/activities
   Query: status, category
══════════════════════════════════════════════════════════ */
export const getActivitiesByEvent = asynchandler(async (req, res) => {
  const { eventId } = req.params;
  console.log("Fetching activities for eventId:", eventId, "with query:", req.query);
  if (!isValidId(eventId)) throw new ApiError(400, "Invalid eventId");

  const { status, category } = req.query;
  const filter = { eventId };
  if (status)   filter.status   = status;
  if (category) filter.category = category;

  const activities = await Activity.find(filter).sort({ dayNumber: 1, date: 1 }).lean();
  return res.status(200).json(new ApiResponse(200, { count: activities.length, activities }, "Activities fetched"));
});

/* ══════════════════════════════════════════════════════════
   GET EVENT SCHEDULE  (grouped by dayNumber — public view)
   GET /api/v1/events/activity/:eventId/schedule
══════════════════════════════════════════════════════════ */
export const getEventSchedule = asynchandler(async (req, res) => {
  const { eventId } = req.params;
  if (!isValidId(eventId)) throw new ApiError(400, "Invalid eventId");

  const schedule = await Activity.aggregate([
    { $match: { eventId: new mongoose.Types.ObjectId(eventId) } },
    {
      $group: {
        _id: "$dayNumber",
        date: { $first: "$date" },
        activities: {
          $push: {
            activityId:          "$_id",
            activityName:        "$activityName",
            category:            "$category",
            status:              "$status",
            participationFee:    "$participationFee",
            registrationDeadline:"$registrationDeadline",
            maxParticipants:     "$maxParticipants",
            registrationsCount:  "$registrationsCount",
            teamAllowed:         "$teamAllowed",
            venueLogistics:      "$venueLogistics",
            scheduling:          "$scheduling",
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        dayNumber: "$_id",
        date: 1,
        activities: 1,
      },
    },
    { $sort: { dayNumber: 1 } },
  ]);

  return res.status(200).json(new ApiResponse(200, { count: schedule.length, schedule }, "Schedule fetched"));
});

/* ══════════════════════════════════════════════════════════
   GET SINGLE ACTIVITY  (full detail)
   GET /api/v1/events/activity/:eventId/activities/:activityId
══════════════════════════════════════════════════════════ */
export const getActivityById = asynchandler(async (req, res) => {
  const { eventId, activityId } = req.params;
  if (!isValidId(eventId) || !isValidId(activityId)) throw new ApiError(400, "Invalid ID");

  const activity = await Activity.findOne({ _id: activityId, eventId }).lean();
  if (!activity) throw new ApiError(404, "Activity not found");

  return res.status(200).json(new ApiResponse(200, activity, "Activity fetched"));
});

/* ══════════════════════════════════════════════════════════
   UPDATE ACTIVITY  (partial)
   PATCH /api/v1/events/activity/:eventId/activities/:activityId
   Auth: required
   Note: eventId and registrationsCount cannot be changed
══════════════════════════════════════════════════════════ */
export const updateActivity = asynchandler(async (req, res) => {
  const { eventId, activityId } = req.params;
  if (!isValidId(eventId) || !isValidId(activityId)) throw new ApiError(400, "Invalid ID");

  // Strip fields that must not be changed externally
  const { eventId: _eId, registrationsCount, ...updates } = req.body;

  if (updates.registrationDeadline && updates.date) {
    if (new Date(updates.registrationDeadline) > new Date(updates.date)) {
      throw new ApiError(400, "registrationDeadline must be before or on the activity date");
    }
  }

  const updated = await Activity.findOneAndUpdate(
    { _id: activityId, eventId },
    { $set: updates },
    { new: true, runValidators: true }
  );
  if (!updated) throw new ApiError(404, "Activity not found");

  // FCM — notify if schedule, date or venue changed (non-blocking)
  if (updates.scheduling || updates.date || updates.venueLogistics) {
    admin.messaging().send({
      topic: `activity_${activityId}`,
      notification: { title: "Activity Updated", body: `${updated.activityName} details have changed` },
      data: { activityId, eventId, type: "ACTIVITY_UPDATED" },
    }).catch((e) => console.error("FCM updateActivity:", e.message));
  }

  return res.status(200).json(new ApiResponse(200, updated, "Activity updated"));
});

/* ══════════════════════════════════════════════════════════
   DELETE ACTIVITY  (cascade: participations — in transaction)
   DELETE /api/v1/events/activity/:eventId/activities/:activityId
   Auth: required
══════════════════════════════════════════════════════════ */
export const deleteActivity = asynchandler(async (req, res) => {
  const { eventId, activityId } = req.params;
  if (!isValidId(eventId) || !isValidId(activityId)) throw new ApiError(400, "Invalid ID");

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const deleted = await Activity.findOneAndDelete({ _id: activityId, eventId }, { session });
    if (!deleted) {
      await session.abortTransaction();
      throw new ApiError(404, "Activity not found");
    }

    // Cascade: delete all participation records for this activity
    const { deletedCount } = await EventParticipation.deleteMany({ activityId }, { session });

    // Decrement event.totalRegistrations by the number of participations removed
    if (deletedCount > 0) {
      await Event.findByIdAndUpdate(
        eventId,
        { $inc: { totalRegistrations: -deletedCount } },
        { session }
      );
    }

    await session.commitTransaction();

    // FCM — cancellation push (non-blocking, after transaction)
    admin.messaging().send({
      topic: `activity_${activityId}`,
      notification: { title: "Activity Cancelled", body: `${deleted.activityName} has been removed` },
      data: { activityId, eventId, type: "ACTIVITY_DELETED" },
    }).catch((e) => console.error("FCM deleteActivity:", e.message));

    return res.status(200).json(
      new ApiResponse(200, null, `Activity deleted along with ${deletedCount} participation(s)`)
    );
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});
