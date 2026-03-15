import mongoose from "mongoose";
import { Event }              from "../../models/event/event.model.js";
import { Activity }           from "../../models/event/Activity/masterday.model.js";
import { EventParticipation } from "../../models/event/participation.model.js";
import { ApiError }           from "../../utils/ApiError.js";
import { ApiResponse }        from "../../utils/ApiResponse.js";
import { asynchandler }       from "../../utils/asynchandler.js";
import { notifyTopic }        from "../../utils/notify.js";   // ← never call admin.messaging() directly

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* ══════════════════════════════════════════════════════════
   CREATE EVENT
   POST /api/v1/events/create
   Body: name, banner, description, type, genre, location{},
         locationId, startDate, endDate, clubId, isPublic
         [institutionId, councilId]
══════════════════════════════════════════════════════════ */
export const createEvent = asynchandler(async (req, res) => {
  const {
    name, banner, description, type, genre,
    location, locationId,
    startDate, endDate,
    clubId, institutionId, councilId,
    isPublic,
  } = req.body;

  if (!name || !banner || !description || !type || !genre || !startDate || !endDate || !clubId) {
    throw new ApiError(400, "name, banner, description, type, genre, startDate, endDate, clubId are required");
  }

  if (new Date(startDate) > new Date(endDate)) {
    throw new ApiError(400, "startDate cannot be after endDate");
  }

  const event = await Event.create({
    name, banner, description, type, genre,
    location: location || {},
    locationId: locationId || null,
    startDate, endDate,
    clubId,
    isPublic: isPublic ?? true,
    ...(institutionId && { institutionId }),
    ...(councilId     && { councilId }),
  });

  // Notify club members via topic
  notifyTopic(
    `club_${clubId}`,
    "New Event Announced! 📣",
    `${name} is coming. Stay tuned.`,
    { eventId: event._id.toString(), type: "EVENT_CREATED" }
  );

  return res.status(201).json(new ApiResponse(201, event, "Event created successfully"));
});

/* ══════════════════════════════════════════════════════════
   GET EVENTS BY CLUB
   GET /api/v1/events/club/:clubId
   Query: status, genre, type, upcoming
══════════════════════════════════════════════════════════ */
export const getEventsByClub = asynchandler(async (req, res) => {
  const { clubId } = req.params;
  if (!isValidId(clubId)) throw new ApiError(400, "Invalid clubId");

  const { status, genre, type, upcoming } = req.query;
  const filter = { clubId };

  if (status)           filter.status    = status;
  if (genre)            filter.genre     = genre;
  if (type)             filter.type      = type;
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
    .select("name banner type genre location locationId startDate endDate totalActivities totalRegistrations status isPublic")
    .sort({ startDate: 1 })
    .lean();

  return res.status(200).json(new ApiResponse(200, { count: events.length, events }, "Upcoming events fetched"));
});

/* ══════════════════════════════════════════════════════════
   SEARCH EVENTS
   GET /api/v1/events/search?q=hackathon&genre=technical&status=published
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

  const activities = await Activity.find({ eventId })
    .select("activityName category dayNumber date participationFee registrationDeadline maxParticipants registrationsCount teamAllowed teamSize status venueLogistics.venueName")
    .sort({ dayNumber: 1, date: 1 })
    .lean();

  return res.status(200).json(new ApiResponse(200, { ...event, activities }, "Event fetched"));
});

/* ══════════════════════════════════════════════════════════
   UPDATE EVENT
   PATCH /api/v1/events/:eventId
   Allowed: all fields except status, totalActivities, totalRegistrations
   Use /publish to change status
══════════════════════════════════════════════════════════ */
export const updateEvent = asynchandler(async (req, res) => {
  const { eventId } = req.params;
  if (!isValidId(eventId)) throw new ApiError(400, "Invalid eventId");

  const { status, totalActivities, totalRegistrations, ...updates } = req.body;

  if (updates.startDate && updates.endDate) {
    if (new Date(updates.startDate) > new Date(updates.endDate)) {
      throw new ApiError(400, "startDate cannot be after endDate");
    }
  }

  // Sync districtName snapshot into location if locationId is being updated
  // (full sync should happen via a location lookup service — here we just accept
  //  the caller passing location.districtName alongside locationId)

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
   Rule: must have at least one activity
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

  notifyTopic(
    `club_${event.clubId}`,
    "Event is Live! 🎉",
    `${event.name} is now open for registrations`,
    { eventId: event._id.toString(), type: "EVENT_PUBLISHED" }
  );

  return res.status(200).json(new ApiResponse(200, event, "Event published successfully"));
});

/* ══════════════════════════════════════════════════════════
   DELETE EVENT  (cascade in transaction)
   DELETE /api/v1/events/:eventId
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