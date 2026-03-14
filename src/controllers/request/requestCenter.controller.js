import mongoose from "mongoose";
import { Friendship }             from "../../models/connections/usersToUser.model.js";
import { ClubMembership }         from "../../models/connections/userToClub.model.js";
import { CouncilPosition }        from "../../models/club/councilPosition.js";
import { CouncilClubMembership }  from "../../models/connections/councilClubMembership.js";
 
import { ApiResponse }            from "../../utils/ApiResponse.js";
import { asynchandler }           from "../../utils/asynchandler.js";

/*
 * REQUEST CENTER CONTROLLER
 * ──────────────────────────────────────────────────────────────────
 * Unified inbox for all pending actionable requests.
 * No new model — aggregates existing collections.
 *
 * FOUR REQUEST TYPES:
 *
 *  1. FRIEND_REQUEST
 *     → pending Friendship docs where recipient = me
 *     → action: accept / reject (existing friend routes)
 *
 *  2. CLUB_JOIN_REQUEST
 *     → pending ClubMembership docs for clubs I own/admin
 *     → action: approve / reject (existing membership routes)
 *
 *  3. COUNCIL_POSITION_INVITE
 *     → invited CouncilPosition docs where userId = me
 *     → action: accept / reject (existing position routes)
 *
 *  4. COUNCIL_CLUB_INVITE
 *     → invited CouncilClubMembership docs for clubs I own/admin
 *     → action: accept / reject via council club routes
 *
 * DESIGN:
 *  - GET /requests          → all pending counts + preview per type
 *  - GET /requests/friends  → paginated friend requests
 *  - GET /requests/clubs    → paginated club join requests (my clubs)
 *  - GET /requests/positions → paginated council position invites
 *  - GET /requests/council-clubs → paginated council club invites
 */

/* ── Helper: get all club IDs where I am owner or admin ──────────*/
async function getMyAdminClubIds(userId) {
  const memberships = await ClubMembership.find({
    userId,
    role:   { $in: ["owner", "admin"] },
    status: "approved",
  })
    .select("clubId")
    .lean();

  return memberships.map((m) => m.clubId);
}

/* ================================================================
   GET REQUEST CENTER SUMMARY
   GET /api/v1/requests

   Returns pending counts for each request type + a small preview
   (first 3 items) of each. Flutter uses this to show badge counts
   and populate the Request Center home screen without separate calls.
================================================================ */
export const getRequestSummary = asynchandler(async (req, res) => {
  const userId = req.user._id;

  // Get clubs where I'm admin/owner — needed for club + council queries
  const adminClubIds = await getMyAdminClubIds(userId);

  // Run all 4 queries in parallel
  const [
    friendRequests,
    clubJoinRequests,
    positionInvites,
    councilClubInvites,
  ] = await Promise.all([

    // 1. Friend requests — sent to me, still pending
    Friendship.find({ recipient: userId, status: "pending" })
      .sort({ createdAt: -1 })
      .limit(3)
      .populate("requester", "displayName imageUrl username")
      .lean(),

    // 2. Club join requests — for clubs I admin
    adminClubIds.length
      ? ClubMembership.find({
          clubId: { $in: adminClubIds },
          status: "pending",
        })
          .sort({ createdAt: -1 })
          .limit(3)
          .populate("userId",  "displayName imageUrl username")
          .populate("clubId",  "clubName image")
          .lean()
      : [],

    // 3. Council position invites — I was invited
    CouncilPosition.find({ userId, status: "invited" })
      .sort({ createdAt: -1 })
      .limit(3)
      .populate("councilId", "councilName image institution")
      .lean(),

    // 4. Council club invites — for clubs I admin
    adminClubIds.length
      ? CouncilClubMembership.find({
          clubId:      { $in: adminClubIds },
          status:      "invited",
          initiatedBy: "council",
        })
          .sort({ createdAt: -1 })
          .limit(3)
          .populate("councilId", "councilName image")
          .populate("clubId",    "clubName image")
          .lean()
      : [],
  ]);

  // Get exact counts (not just preview counts)
  const [
    friendCount,
    clubJoinCount,
    positionCount,
    councilClubCount,
  ] = await Promise.all([
    Friendship.countDocuments({ recipient: userId, status: "pending" }),
    adminClubIds.length
      ? ClubMembership.countDocuments({ clubId: { $in: adminClubIds }, status: "pending" })
      : 0,
    CouncilPosition.countDocuments({ userId, status: "invited" }),
    adminClubIds.length
      ? CouncilClubMembership.countDocuments({
          clubId: { $in: adminClubIds }, status: "invited", initiatedBy: "council",
        })
      : 0,
  ]);

  const totalPending = friendCount + clubJoinCount + positionCount + councilClubCount;

  return res.status(200).json(
    new ApiResponse(200, {
      totalPending,
      sections: {
        friendRequests: {
          count:   friendCount,
          preview: friendRequests,
        },
        clubJoinRequests: {
          count:   clubJoinCount,
          preview: clubJoinRequests,
        },
        positionInvites: {
          count:   positionCount,
          preview: positionInvites,
        },
        councilClubInvites: {
          count:   councilClubCount,
          preview: councilClubInvites,
        },
      },
    }, "Request center fetched")
  );
});

/* ================================================================
   GET FRIEND REQUESTS  (paginated)
   GET /api/v1/requests/friends?page=&limit=
================================================================ */
export const getFriendRequests = asynchandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const pageLimit  = Math.min(parseInt(limit, 10), 50);
  const skip       = (pageNumber - 1) * pageLimit;

  const filter = { recipient: userId, status: "pending" };

  const [requests, total] = await Promise.all([
    Friendship.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit)
      .populate("requester", "displayName imageUrl username")
      .lean(),
    Friendship.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      requests,
      pagination: {
        total, page: pageNumber, limit: pageLimit,
        totalPages:  Math.ceil(total / pageLimit),
        hasNextPage: skip + requests.length < total,
      },
    }, "Friend requests fetched")
  );
});

/* ================================================================
   GET CLUB JOIN REQUESTS  (paginated)
   GET /api/v1/requests/clubs?page=&limit=

   Returns pending join requests for all clubs where I'm admin/owner.
================================================================ */
export const getClubJoinRequests = asynchandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const pageLimit  = Math.min(parseInt(limit, 10), 50);
  const skip       = (pageNumber - 1) * pageLimit;

  const adminClubIds = await getMyAdminClubIds(userId);

  if (!adminClubIds.length) {
    return res.status(200).json(
      new ApiResponse(200, {
        requests: [],
        pagination: { total: 0, page: pageNumber, limit: pageLimit, totalPages: 0, hasNextPage: false },
      }, "No clubs to manage")
    );
  }

  const filter = { clubId: { $in: adminClubIds }, status: "pending" };

  const [requests, total] = await Promise.all([
    ClubMembership.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit)
      .populate("userId",  "displayName imageUrl username")
      .populate("clubId",  "clubName image")
      .lean(),
    ClubMembership.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      requests,
      pagination: {
        total, page: pageNumber, limit: pageLimit,
        totalPages:  Math.ceil(total / pageLimit),
        hasNextPage: skip + requests.length < total,
      },
    }, "Club join requests fetched")
  );
});

/* ================================================================
   GET POSITION INVITES  (paginated)
   GET /api/v1/requests/positions?page=&limit=

   Council position invites sent to me — pending my acceptance.
================================================================ */
export const getPositionInvites = asynchandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const pageLimit  = Math.min(parseInt(limit, 10), 50);
  const skip       = (pageNumber - 1) * pageLimit;

  const filter = { userId, status: "invited" };

  const [invites, total] = await Promise.all([
    CouncilPosition.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit)
      .populate("councilId", "councilName image institution")
      .lean(),
    CouncilPosition.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      invites,
      pagination: {
        total, page: pageNumber, limit: pageLimit,
        totalPages:  Math.ceil(total / pageLimit),
        hasNextPage: skip + invites.length < total,
      },
    }, "Position invites fetched")
  );
});

/* ================================================================
   GET COUNCIL CLUB INVITES  (paginated)
   GET /api/v1/requests/council-clubs?page=&limit=

   Council invites sent to clubs I admin — pending my acceptance.
================================================================ */
export const getCouncilClubInvites = asynchandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const pageLimit  = Math.min(parseInt(limit, 10), 50);
  const skip       = (pageNumber - 1) * pageLimit;

  const adminClubIds = await getMyAdminClubIds(userId);

  if (!adminClubIds.length) {
    return res.status(200).json(
      new ApiResponse(200, {
        invites: [],
        pagination: { total: 0, page: pageNumber, limit: pageLimit, totalPages: 0, hasNextPage: false },
      }, "No clubs to manage")
    );
  }

  const filter = {
    clubId:      { $in: adminClubIds },
    status:      "invited",
    initiatedBy: "council",
  };

  const [invites, total] = await Promise.all([
    CouncilClubMembership.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit)
      .populate("councilId", "councilName image institution")
      .populate("clubId",    "clubName image")
      .lean(),
    CouncilClubMembership.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      invites,
      pagination: {
        total, page: pageNumber, limit: pageLimit,
        totalPages:  Math.ceil(total / pageLimit),
        hasNextPage: skip + invites.length < total,
      },
    }, "Council club invites fetched")
  );
});