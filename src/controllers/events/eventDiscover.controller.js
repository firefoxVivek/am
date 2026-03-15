import mongoose from "mongoose";
import { asynchandler }     from "../../utils/asynchandler.js";
import { ApiResponse }      from "../../utils/ApiResponse.js";
import { Event }           from "../../models/event/event.model.js";
import { ClubMembership }  from "../../models/connections/userToClub.model.js";
import { UserProfile }     from "../../models/Profile/profile.model.js";
 
 

const now = () => new Date();

const EVENT_CARD_SELECT =
  "name banner type genre location locationId startDate endDate status isPublic clubId totalActivities totalRegistrations";

// ─── Helper — paginate ────────────────────────────────────────────────────────
function parsePage(query) {
  return {
    pageNumber: Math.max(parseInt(query.page  ?? 1,  10), 1),
    pageLimit:  Math.min(parseInt(query.limit ?? 10, 10), 30),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Ongoing Events   GET /events/discover/ongoing
//    Published events that have started but not yet ended
//    Visible: public ones + events from clubs the user is a member of
// ─────────────────────────────────────────────────────────────────────────────
export const getOngoingEvents = asynchandler(async (req, res) => {
  const { pageNumber, pageLimit } = parsePage(req.query);
  const skip = (pageNumber - 1) * pageLimit;
  const n    = now();

  const memberships   = await ClubMembership.find({ user: req.user._id, status: "active" }).select("club").lean();
  const memberClubIds = memberships.map((m) => m.club);

  const filter = {
    status:    "published",
    startDate: { $lte: n },
    endDate:   { $gte: n },
    $or: [
      { isPublic: true },
      ...(memberClubIds.length ? [{ clubId: { $in: memberClubIds } }] : []),
    ],
  };

  const [events, total] = await Promise.all([
    Event.find(filter)
      .select(EVENT_CARD_SELECT)
      .populate("clubId", "name logo")
      .sort({ endDate: 1 })        // ending soonest first
      .skip(skip)
      .limit(pageLimit)
      .lean(),
    Event.countDocuments(filter),
  ]);

  return res.json(new ApiResponse(200, {
    events, total, page: pageNumber, limit: pageLimit,
    totalPages: Math.ceil(total / pageLimit),
    hasNextPage: skip + events.length < total,
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. District Events   GET /events/discover/district
//    Upcoming published public events in the user's district
// ─────────────────────────────────────────────────────────────────────────────
export const getDistrictEvents = asynchandler(async (req, res) => {
  const { pageNumber, pageLimit } = parsePage(req.query);
  const skip = (pageNumber - 1) * pageLimit;

  const profile = await UserProfile.findOne({ userId: req.user._id }).select("locationId").lean();

  if (!profile?.locationId) {
    return res.json(new ApiResponse(200, {
      events: [], total: 0, page: pageNumber, limit: pageLimit, totalPages: 0, hasNextPage: false,
      hint: "Update your location in profile to see events near you.",
    }));
  }

  const filter = {
    locationId: new mongoose.Types.ObjectId(profile.locationId),
    status:     "published",
    isPublic:   true,
    startDate:  { $gte: now() },
  };

  const [events, total] = await Promise.all([
    Event.find(filter)
      .select(EVENT_CARD_SELECT)
      .populate("clubId", "name logo")
      .sort({ startDate: 1 })
      .skip(skip)
      .limit(pageLimit)
      .lean(),
    Event.countDocuments(filter),
  ]);

  return res.json(new ApiResponse(200, {
    events, total, page: pageNumber, limit: pageLimit,
    totalPages: Math.ceil(total / pageLimit),
    hasNextPage: skip + events.length < total,
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Club Events   GET /events/discover/clubs
//    Upcoming events from clubs the user is an active member of
// ─────────────────────────────────────────────────────────────────────────────
export const getClubEvents = asynchandler(async (req, res) => {
  const { pageNumber, pageLimit } = parsePage(req.query);
  const skip = (pageNumber - 1) * pageLimit;

  const memberships   = await ClubMembership.find({ user: req.user._id, status: "active" }).select("club").lean();
  const memberClubIds = memberships.map((m) => m.club);

  if (!memberClubIds.length) {
    return res.json(new ApiResponse(200, {
      events: [], total: 0, page: pageNumber, limit: pageLimit, totalPages: 0, hasNextPage: false,
      hint: "Join clubs to see their upcoming events here.",
    }));
  }

  const filter = {
    clubId:    { $in: memberClubIds },
    status:    "published",
    startDate: { $gte: now() },
  };

  const [events, total] = await Promise.all([
    Event.find(filter)
      .select(EVENT_CARD_SELECT)
      .populate("clubId", "name logo")
      .sort({ startDate: 1 })
      .skip(skip)
      .limit(pageLimit)
      .lean(),
    Event.countDocuments(filter),
  ]);

  return res.json(new ApiResponse(200, {
    events, total, page: pageNumber, limit: pageLimit,
    totalPages: Math.ceil(total / pageLimit),
    hasNextPage: skip + events.length < total,
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Public Events   GET /events/discover/public
//    All upcoming published public events — global explore tab
// ─────────────────────────────────────────────────────────────────────────────
export const getPublicEvents = asynchandler(async (req, res) => {
  const { pageNumber, pageLimit } = parsePage(req.query);
  const skip = (pageNumber - 1) * pageLimit;

  const filter = {
    isPublic:  true,
    status:    "published",
    startDate: { $gte: now() },
  };

  const [events, total] = await Promise.all([
    Event.find(filter)
      .select(EVENT_CARD_SELECT)
      .populate("clubId", "name logo")
      .sort({ startDate: 1 })
      .skip(skip)
      .limit(pageLimit)
      .lean(),
    Event.countDocuments(filter),
  ]);

  return res.json(new ApiResponse(200, {
    events, total, page: pageNumber, limit: pageLimit,
    totalPages: Math.ceil(total / pageLimit),
    hasNextPage: skip + events.length < total,
  }));
});