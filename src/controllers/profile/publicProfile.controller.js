import mongoose from "mongoose";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError }    from "../../utils/ApiError.js";
import { asynchandler } from "../../utils/asynchandler.js";
import { Friendship }  from "../../models/connections/usersToUser.model.js";
import UserProfile     from "../../models/Profile/profile.model.js";

/* ---------------------------------------------------------------
   HELPER — normalised friendship status object
   Attached to every public-facing user result so the frontend
   always knows which button to render without a second call.
--------------------------------------------------------------- */
function buildFriendshipStatus(friendship, viewerId) {
  if (!friendship) {
    return { status: "none", isFriend: false, isRequester: false, isRecipient: false, requestId: null };
  }
  const isRequester = friendship.requester.toString() === viewerId.toString();
  return {
    status:      friendship.status,
    isFriend:    friendship.status === "accepted",
    isRequester,
    isRecipient: !isRequester,
    requestId:   friendship._id,
  };
}

/* ---------------------------------------------------------------
   HELPER — batch friendship status
   One Friendship query for all userIds in a page, then a Map
   lookup per result. Total = 1 extra query regardless of page size.
--------------------------------------------------------------- */
async function batchFriendshipStatus(userIds, viewerId) {
  if (!userIds.length) return new Map();

  const friendships = await Friendship.find({
    $or: [
      { requester: viewerId,   recipient: { $in: userIds } },
      { requester: { $in: userIds }, recipient: viewerId },
    ],
  })
    .select("status requester recipient _id")
    .lean();

  const map = new Map();
  for (const f of friendships) {
    const otherId =
      f.requester.toString() === viewerId.toString()
        ? f.recipient.toString()
        : f.requester.toString();
    map.set(otherId, f);
  }
  return map;
}

/* ===============================================================
   GET PUBLIC USER PROFILE
   GET /api/v1/profile/public/users/:userId
   Returns public profile + friendship status relative to viewer.
   Freelancer block only shown if user has opted in.
=============================================================== */
export const getPublicUserProfile = asynchandler(async (req, res) => {
  const viewerId = req.user?._id;
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) throw new ApiError(400, "Invalid user ID");

  const uid = new mongoose.Types.ObjectId(userId);
  const vid = viewerId ? new mongoose.Types.ObjectId(viewerId) : null;

  const profile = await UserProfile.findOne({ userId: uid })
    .select(
      "name username imageUrl bio hobbies experiences location locationId address " +
      "socialLinks freelancer totalFriends totalPosts totalParticipations"
    )
    .lean();

  if (!profile) throw new ApiError(404, "User profile not found");

  const isSelf = vid?.toString() === uid.toString();

  let friendshipStatus = null;
  if (vid && !isSelf) {
    const friendship = await Friendship.findOne({
      $or: [
        { requester: vid, recipient: uid },
        { requester: uid, recipient: vid },
      ],
    }).select("status requester recipient _id").lean();

    friendshipStatus = buildFriendshipStatus(friendship, vid);
  }

  return res.status(200).json(
    new ApiResponse(200, {
      userId:              uid,
      name:                profile.name,
      username:            profile.username,
      imageUrl:            profile.imageUrl,
      bio:                 profile.bio,
      hobbies:             profile.hobbies,
      experiences:         profile.experiences,
      location:            profile.location   ?? null,
      address:             profile.address    ?? null,
      socialLinks:         profile.socialLinks ?? {},
      // Strip freelancer block if user hasn't opted in
      freelancer:          profile.freelancer?.isFreelancer ? profile.freelancer : null,
      totalFriends:        profile.totalFriends        ?? 0,
      totalPosts:          profile.totalPosts           ?? 0,
      totalParticipations: profile.totalParticipations  ?? 0,
      isSelf,
      friendship:          friendshipStatus,
    }, "Public profile fetched successfully")
  );
});

/* ===============================================================
   SEARCH USERS
   GET /api/v1/profile/public/search?q=&page=&limit=&locationId=&freelancerOnly=
   Queries UserProfile text index (name + username + serviceTags).
   Optionally scoped to a city via locationId.
   Returns batch friendship status — 2 total DB queries for any page size.
=============================================================== */
export const searchPublicUserProfiles = asynchandler(async (req, res) => {
  const viewerId = req.user._id;
  const { q = "", page = 1, limit = 10, locationId, freelancerOnly } = req.query;

  const trimmedQ = q.trim();
  if (!trimmedQ) throw new ApiError(400, "Search query is required");

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const pageLimit  = Math.min(parseInt(limit, 10), 50);
  const skip       = (pageNumber - 1) * pageLimit;

  const filter = {
    $text: { $search: trimmedQ },
    userId: { $ne: new mongoose.Types.ObjectId(viewerId) },
  };

  if (freelancerOnly === "true") filter["freelancer.isFreelancer"] = true;
  if (locationId && mongoose.Types.ObjectId.isValid(locationId)) {
    filter.locationId = new mongoose.Types.ObjectId(locationId);
  }

  const [profiles, total] = await Promise.all([
    UserProfile.find(filter)
      .select("userId name username imageUrl bio location locationId freelancer totalFriends")
      .sort({ score: { $meta: "textScore" } })
      .skip(skip)
      .limit(pageLimit)
      .lean(),
    UserProfile.countDocuments(filter),
  ]);

  if (!profiles.length) {
    return res.status(200).json(
      new ApiResponse(200, {
        results: [],
        pagination: { total: 0, page: pageNumber, limit: pageLimit, totalPages: 0, hasNextPage: false },
      }, "No results found")
    );
  }

  const userIds      = profiles.map((p) => p.userId);
  const friendshipMap = await batchFriendshipStatus(userIds, viewerId);

  const results = profiles.map((p) => ({
    userId:       p.userId,
    name:         p.name,
    username:     p.username,
    imageUrl:     p.imageUrl,
    bio:          p.bio,
    city:         p.location?.districtName ?? null,
    totalFriends: p.totalFriends ?? 0,
    freelancer:   p.freelancer?.isFreelancer
      ? { isFreelancer: true, availability: p.freelancer.availability, skills: p.freelancer.skills, tagline: p.freelancer.tagline }
      : null,
    friendship:   buildFriendshipStatus(friendshipMap.get(p.userId.toString()) ?? null, viewerId),
  }));

  return res.status(200).json(
    new ApiResponse(200, {
      results,
      pagination: {
        total,
        page:        pageNumber,
        limit:       pageLimit,
        totalPages:  Math.ceil(total / pageLimit),
        hasNextPage: skip + profiles.length < total,
      },
    }, "Search results fetched successfully")
  );
});

/* ===============================================================
   BROWSE FREELANCERS
   GET /api/v1/freelancers?locationId=&availability=&page=&limit=
   City-scoped discovery using the locationId compound index.
   Returns batch friendship status.
=============================================================== */
export const browseFreelancers = asynchandler(async (req, res) => {
  const viewerId = req.user._id;
  const { locationId, availability, page = 1, limit = 20 } = req.query;

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const pageLimit  = Math.min(parseInt(limit, 10), 50);
  const skip       = (pageNumber - 1) * pageLimit;

  // Base filter: only opted-in freelancers
  const filter = { "freelancer.isFreelancer": true };

  // City scope — uses the compound index { locationId, freelancer.isFreelancer, freelancer.availability }
  if (locationId && mongoose.Types.ObjectId.isValid(locationId)) {
    filter.locationId = new mongoose.Types.ObjectId(locationId);
  }

  if (availability && ["available", "busy", "not_available"].includes(availability)) {
    filter["freelancer.availability"] = availability;
  }

  const [profiles, total] = await Promise.all([
    UserProfile.find(filter)
      .select("userId name username imageUrl bio location locationId freelancer totalFriends")
      .sort({ "freelancer.availability": 1, createdAt: -1 })
      .skip(skip)
      .limit(pageLimit)
      .lean(),
    UserProfile.countDocuments(filter),
  ]);

  const userIds       = profiles.map((p) => p.userId);
  const friendshipMap = await batchFriendshipStatus(userIds, viewerId);

  const results = profiles.map((p) => ({
    userId:       p.userId,
    name:         p.name,
    username:     p.username,
    imageUrl:     p.imageUrl,
    bio:          p.bio,
    city:         p.location?.districtName ?? null,
    state:        p.location?.stateName    ?? null,
    totalFriends: p.totalFriends ?? 0,
    freelancer: {
      isFreelancer:   true,
      availability:   p.freelancer.availability,
      skills:         p.freelancer.skills,
      serviceTags:    p.freelancer.serviceTags,
      hourlyRate:     p.freelancer.hourlyRate,
      tagline:        p.freelancer.tagline,
      portfolioLinks: p.freelancer.portfolioLinks,
    },
    friendship: buildFriendshipStatus(friendshipMap.get(p.userId.toString()) ?? null, viewerId),
  }));

  return res.status(200).json(
    new ApiResponse(200, {
      results,
      pagination: {
        total,
        page:        pageNumber,
        limit:       pageLimit,
        totalPages:  Math.ceil(total / pageLimit),
        hasNextPage: skip + profiles.length < total,
      },
    }, "Freelancers fetched successfully")
  );
});

/* ===============================================================
   GET FREELANCER PROFILE
   GET /api/v1/freelancers/:userId
   Full public profile of a freelancer with complete portfolio.
=============================================================== */
export const getFreelancerProfile = asynchandler(async (req, res) => {
  const { userId } = req.params;
  const viewerId   = req.user._id;

  if (!mongoose.Types.ObjectId.isValid(userId)) throw new ApiError(400, "Invalid user ID");

  const uid  = new mongoose.Types.ObjectId(userId);
  const profile = await UserProfile.findOne({ userId: uid, "freelancer.isFreelancer": true })
    .select(
      "name username imageUrl bio hobbies experiences location socialLinks " +
      "freelancer totalFriends totalPosts totalParticipations"
    )
    .lean();

  if (!profile) throw new ApiError(404, "Freelancer profile not found");

  const isSelf = viewerId.toString() === uid.toString();

  let friendshipStatus = null;
  if (!isSelf) {
    const friendship = await Friendship.findOne({
      $or: [
        { requester: viewerId, recipient: uid },
        { requester: uid,      recipient: viewerId },
      ],
    }).select("status requester recipient _id").lean();

    friendshipStatus = buildFriendshipStatus(friendship, viewerId);
  }

  return res.status(200).json(
    new ApiResponse(200, {
      userId:     uid,
      name:       profile.name,
      username:   profile.username,
      imageUrl:   profile.imageUrl,
      bio:        profile.bio,
      hobbies:    profile.hobbies,
      experiences: profile.experiences,
      city:        profile.location?.districtName ?? null,
      state:       profile.location?.stateName    ?? null,
      socialLinks: profile.socialLinks ?? {},
      freelancer:  profile.freelancer,
      totalFriends:        profile.totalFriends        ?? 0,
      totalPosts:          profile.totalPosts           ?? 0,
      totalParticipations: profile.totalParticipations  ?? 0,
      isSelf,
      friendship: friendshipStatus,
    }, "Freelancer profile fetched successfully")
  );
});

/* ===============================================================
   REGISTER AS FREELANCER
   POST /api/v1/freelancers/register
   Opts the user into the freelancer system.
=============================================================== */
export const registerAsFreelancer = asynchandler(async (req, res) => {
  const userId = req.user._id;
  const { skills, serviceTags, availability, hourlyRate, portfolioLinks, tagline } = req.body;

  if (!skills?.length) throw new ApiError(400, "At least one skill is required to register as a freelancer");

  const profile = await UserProfile.findOneAndUpdate(
    { userId },
    {
      $set: {
        "freelancer.isFreelancer":   true,
        "freelancer.skills":         skills,
        "freelancer.serviceTags":    serviceTags    ?? [],
        "freelancer.availability":   availability   ?? "available",
        "freelancer.hourlyRate":     hourlyRate     ?? null,
        "freelancer.portfolioLinks": portfolioLinks ?? [],
        "freelancer.tagline":        tagline        ?? null,
      },
    },
    { new: true, runValidators: true }
  );

  if (!profile) throw new ApiError(404, "Profile not found — create your profile first");

  return res.status(200).json(
    new ApiResponse(200, profile.freelancer, "Registered as freelancer successfully")
  );
});

/* ===============================================================
   UPDATE FREELANCER PROFILE
   PATCH /api/v1/freelancers/profile
=============================================================== */
export const updateFreelancerProfile = asynchandler(async (req, res) => {
  const userId = req.user._id;

  const ALLOWED_FREELANCER_FIELDS = ["skills", "serviceTags", "availability", "hourlyRate", "portfolioLinks", "tagline"];
  const updates = {};

  for (const key of ALLOWED_FREELANCER_FIELDS) {
    if (req.body[key] !== undefined) {
      updates[`freelancer.${key}`] = req.body[key];
    }
  }

  if (!Object.keys(updates).length) throw new ApiError(400, "No valid freelancer fields provided");

  const profile = await UserProfile.findOneAndUpdate(
    { userId, "freelancer.isFreelancer": true },
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!profile) throw new ApiError(404, "Freelancer profile not found or you are not registered as a freelancer");

  return res.status(200).json(
    new ApiResponse(200, profile.freelancer, "Freelancer profile updated successfully")
  );
});

/* ===============================================================
   OPT OUT OF FREELANCER
   DELETE /api/v1/freelancers/profile
=============================================================== */
export const optOutFreelancer = asynchandler(async (req, res) => {
  const userId = req.user._id;

  const profile = await UserProfile.findOneAndUpdate(
    { userId },
    {
      $set: {
        freelancer: {
          isFreelancer:   false,
          skills:         [],
          serviceTags:    [],
          availability:   "not_available",
          hourlyRate:     null,
          portfolioLinks: [],
          tagline:        null,
        },
      },
    },
    { new: true }
  );

  if (!profile) throw new ApiError(404, "Profile not found");

  return res.status(200).json(
    new ApiResponse(200, {}, "Removed from freelancer listings successfully")
  );
});