import mongoose from "mongoose";
import { Event }              from "../../models/event/event.model.js";
import { Activity }           from "../../models/event/Activity/masterday.model.js";
import { EventParticipation } from "../../models/event/participation.model.js";
import admin                  from "../../../config/firebase.js";
import { ApiError }           from "../../utils/ApiError.js";
import { ApiResponse }        from "../../utils/ApiResponse.js";
import { asynchandler }       from "../../utils/asynchandler.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* ══════════════════════════════════════════════════════════
   CREATE EVENT
   POST /api/v1/events/create
   Auth: required
   Body: name, banner, description, type, genre, location{}, startDate, endDate, clubId
         [institutionId, councilId]
══════════════════════════════════════════════════════════ */
export const createEvent = asynchandler(async (req, res) => {
  const { name, banner, description, type, genre, location, startDate, endDate, clubId, institutionId, councilId } = req.body;

  if (!name || !banner || !description || !type || !genre || !startDate || !endDate || !clubId) {
    throw new ApiError(400, "name, banner, description, type, genre, startDate, endDate, clubId are required");
  }

  if (new Date(startDate) > new Date(endDate)) {
    throw new ApiError(400, "startDate cannot be after endDate");
  }

  const event = await Event.create({
    name, banner, description, type, genre,
    location: location || {},
    startDate, endDate, clubId,
    ...(institutionId && { institutionId }),
    ...(councilId && { councilId }),
  });

  // FCM — notify club topic (non-blocking)
  admin.messaging().send({
    topic: `club_${clubId}`,
    notification: { title: "New Event Announced!", body: `${name} is coming. Stay tuned.` },
    data: { eventId: event._id.toString(), type: "EVENT_CREATED" },
  }).catch((e) => console.error("FCM createEvent:", e.message));

  return res.status(201).json(new ApiResponse(201, event, "Event created successfully"));
});

/* ══════════════════════════════════════════════════════════
   GET EVENTS BY CLUB
   GET /api/v1/events/club/:clubId
   Query: status, genre, type, upcoming (true/false)
══════════════════════════════════════════════════════════ */
export const getEventsByClub = asynchandler(async (req, res) => {
  const { clubId } = req.params;
  if (!isValidId(clubId)) throw new ApiError(400, "Invalid clubId");

  const { status, genre, type, upcoming } = req.query;
  const filter = { clubId };

  if (status)          filter.status = status;
  if (genre)           filter.genre  = genre;
  if (type)            filter.type   = type;
  if (upcoming === "true") filter.startDate = { $gte: new Date() };

  const events = await Event.find(filter).sort({ startDate: 1 }).lean();
  return res.status(200).json(new ApiResponse(200, { count: events.length, events }, "Fetched successfully"));
});

/* ══════════════════════════════════════════════════════════
   GET UPCOMING EVENTS FOR CLUB  (next 30 days, published only)
   GET /api/v1/events/club/:clubId/upcoming
══════════════════════════════════════════════════════════ */
export const getUpcomingClubEvents = asynchandler(async (req, res) => {
  const { clubId } = req.params;
  if (!isValidId(clubId)) throw new ApiError(400, "Invalid clubId");

  const now  = new Date();
  const in30 = new Date(); in30.setDate(now.getDate() + 30);

  const events = await Event.find({
    clubId,
    status: "published",
    startDate: { $gte: now, $lte: in30 },
  })
    .select("name banner type genre location startDate endDate totalActivities totalRegistrations status")
    .sort({ startDate: 1 })
    .lean();

  return res.status(200).json(new ApiResponse(200, { count: events.length, events }, "Upcoming events fetched"));
});

/* ══════════════════════════════════════════════════════════
   SEARCH EVENTS
   GET /api/v1/events/search?q=hackathon&genre=technical&status=published&type=fest
══════════════════════════════════════════════════════════ */
export const searchEvents = asynchandler(async (req, res) => {
  const { q, genre, type, status } = req.query;

  if (!q || q.trim().length < 2) {
    throw new ApiError(400, "Search query must be at least 2 characters");
  }

  const filter = { $text: { $search: q.trim() } };
  if (genre)  filter.genre  = genre;
  if (type)   filter.type   = type;
  if (status) filter.status = status;

  const events = await Event.find(filter, { score: { $meta: "textScore" } })
    .sort({ score: { $meta: "textScore" }, startDate: 1 })
    .lean();

  return res.status(200).json(new ApiResponse(200, { count: events.length, events }, "Search results"));
});

/* ══════════════════════════════════════════════════════════
   GET SINGLE EVENT  (with activities summary)
   GET /api/v1/events/:eventId
══════════════════════════════════════════════════════════ */
export const getEventById = asynchandler(async (req, res) => {
  const { eventId } = req.params;
  if (!isValidId(eventId)) throw new ApiError(400, "Invalid eventId");

  const event = await Event.findById(eventId).lean();
  if (!event) throw new ApiError(404, "Event not found");

  // Attach activity summaries (sorted by day)
  const activities = await Activity.find({ eventId })
    .select("activityName category dayNumber date participationFee registrationDeadline maxParticipants registrationsCount teamAllowed teamSize status venueLogistics.venueName")
    .sort({ dayNumber: 1, date: 1 })
    .lean();

  return res.status(200).json(new ApiResponse(200, { ...event, activities }, "Event fetched"));
});

/* ══════════════════════════════════════════════════════════
   UPDATE EVENT  (partial — excludes status, use /publish)
   PATCH /api/v1/events/:eventId
   Auth: required
══════════════════════════════════════════════════════════ */
export const updateEvent = asynchandler(async (req, res) => {
  const { eventId } = req.params;
  if (!isValidId(eventId)) throw new ApiError(400, "Invalid eventId");

  // Strip system-managed and status fields
  const { status, totalActivities, totalRegistrations, ...updates } = req.body;

  if (updates.startDate && updates.endDate) {
    if (new Date(updates.startDate) > new Date(updates.endDate)) {
      throw new ApiError(400, "startDate cannot be after endDate");
    }
  }

  const updated = await Event.findByIdAndUpdate(
    eventId,
    { $set: updates },
    { new: true, runValidators: true }
  );
  if (!updated) throw new ApiError(404, "Event not found");

  return res.status(200).json(new ApiResponse(200, updated, "Event updated"));
});

/* ══════════════════════════════════════════════════════════
   PUBLISH EVENT
   PATCH /api/v1/events/:eventId/publish
   Auth: required
   Rule: event must have at least one activity before it can be published
══════════════════════════════════════════════════════════ */
export const publishEvent = asynchandler(async (req, res) => {
  const { eventId } = req.params;
  if (!isValidId(eventId)) throw new ApiError(400, "Invalid eventId");

  const event = await Event.findById(eventId);
  if (!event) throw new ApiError(404, "Event not found");

  if (event.status === "published") throw new ApiError(400, "Event is already published");
  if (event.status === "cancelled") throw new ApiError(400, "Cannot publish a cancelled event");

  const activityCount = await Activity.countDocuments({ eventId });
  if (activityCount === 0) {
    throw new ApiError(400, "Add at least one activity before publishing the event");
  }

  event.status = "published";
  await event.save();

  // FCM — notify club (non-blocking)
  admin.messaging().send({
    topic: `club_${event.clubId}`,
    notification: { title: "Event is Live! 🎉", body: `${event.name} is now open for registrations` },
    data: { eventId: event._id.toString(), type: "EVENT_PUBLISHED" },
  }).catch((e) => console.error("FCM publishEvent:", e.message));

  return res.status(200).json(new ApiResponse(200, event, "Event published successfully"));
});

/* ══════════════════════════════════════════════════════════
   DELETE EVENT  (cascade: activities + participations in transaction)
   DELETE /api/v1/events/:eventId
   Auth: required
══════════════════════════════════════════════════════════ */
export const deleteEvent = asynchandler(async (req, res) => {
  const { eventId } = req.params;
  if (!isValidId(eventId)) throw new ApiError(400, "Invalid eventId");

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const event = await Event.findByIdAndDelete(eventId, { session });
    if (!event) {
      await session.abortTransaction();
      throw new ApiError(404, "Event not found");
    }

    await Activity.deleteMany({ eventId }, { session });
    await EventParticipation.deleteMany({ eventId }, { session });

    await session.commitTransaction();
    return res.status(200).json(new ApiResponse(200, null, "Event, activities and participations deleted"));
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});
