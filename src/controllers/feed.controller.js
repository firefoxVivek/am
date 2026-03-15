 
import mongoose from "mongoose";
 
 
 
 
 
 
 
import { asynchandler } from "../utils/asynchandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import Story from "../models/story/masterStory.model.js";
import { ClubPost } from "../models/club/posts.model.js";
import InstitutionPost from "../models/institution/institutionPost.model.js";
import { Friendship } from "../models/connections/usersToUser.model.js";
import { ClubMembership } from "../models/connections/userToClub.model.js";

// ─────────────────────────────────────────────
// Helper — resolve the social graph for the caller
// Returns: { friendIds, memberClubIds, followedInstitutionIds }
// ─────────────────────────────────────────────
async function resolveGraph(userId) {
  const [friendships, memberships] = await Promise.all([
    // accepted friendships in either direction
    Friendship.find({
      $or: [{ requester: userId }, { recipient: userId }],
      status: "accepted",
    }).select("requester recipient"),

    // active club memberships
    ClubMembership.find({
      user: userId,
      status: "active",
    }).select("club followedInstitutions"),
  ]);

  const friendIds = friendships.map((f) =>
    f.requester.toString() === userId.toString() ? f.recipient : f.requester
  );

  const memberClubIds = memberships.map((m) => m.club);

  // followedInstitutions is stored on the User model (assumed as an array of ObjectIds)
  // We pull it directly from the user document passed via req.user
  return { friendIds, memberClubIds };
}

// ─────────────────────────────────────────────
// 1. Stories Feed   GET /feed/stories
//    Sources:
//      • Stories posted by friends (Story.author in friendIds)
//      • Stories posted by clubs the user is a member of (Story.club in memberClubIds)
//      • Stories posted by institutions the user follows (Story.institution in followedInstitutions)
//    Stories expire after 24 h — filter by createdAt >= now - 24h
// ─────────────────────────────────────────────
export const getStoriesFeed = asynchandler(async (req, res) => {
  const { page = 1, limit = 30 } = req.query;
  const userId = req.user._id;

  const { friendIds, memberClubIds } = await resolveGraph(userId);

  // followedInstitutions lives on the User document
  const followedInstitutionIds = req.user.followedInstitutions || [];

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24 hours

  const filter = {
    createdAt: { $gte: since },
    $or: [
      // Stories from friends
      ...(friendIds.length
        ? [{ author: { $in: friendIds }, club: null, institution: null }]
        : []),
      // Stories from clubs I'm a member of
      ...(memberClubIds.length
        ? [{ club: { $in: memberClubIds } }]
        : []),
      // Stories from institutions I follow
      ...(followedInstitutionIds.length
        ? [{ institution: { $in: followedInstitutionIds } }]
        : []),
    ],
  };

  // If the social graph is completely empty, return early
  if (!filter.$or.length) {
    return res.json(
      new ApiResponse(200, { stories: [], total: 0, page: Number(page), limit: Number(limit) })
    );
  }

  const [stories, total] = await Promise.all([
    Story.find(filter)
      .populate("author", "fullName avatar")
      .populate("club", "name logo")
      .populate("institution", "name logo")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit)),
    Story.countDocuments(filter),
  ]);

  return res.json(
    new ApiResponse(200, {
      stories,
      total,
      page: Number(page),
      limit: Number(limit),
    })
  );
});

// ─────────────────────────────────────────────
// 2. Updates Feed   GET /feed/updates
//    Sources:
//      • Posts from clubs the user follows / is a member of  → sourceType: "club"
//      • Posts from institutions the user follows            → sourceType: "institution"
//    Each item in the response carries a `sourceType` flag.
// ─────────────────────────────────────────────
export const getUpdatesFeed = asynchandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const userId = req.user._id;

  const { memberClubIds } = await resolveGraph(userId);
  const followedInstitutionIds = req.user.followedInstitutions || [];

  const skip = (page - 1) * limit;
  const lim = Number(limit);

  // Run both queries in parallel
  const [clubPosts, institutionPosts] = await Promise.all([
    memberClubIds.length
      ? ClubPost.find({ club: { $in: memberClubIds } })
          .populate("club", "name logo")
          .populate("author", "fullName avatar")
          .lean()
      : Promise.resolve([]),

    followedInstitutionIds.length
      ? InstitutionPost.find({ institution: { $in: followedInstitutionIds } })
          .populate("institution", "name logo")
          .populate("author", "fullName avatar")
          .lean()
      : Promise.resolve([]),
  ]);

  // Tag each item with sourceType
  const tagged = [
    ...clubPosts.map((p) => ({ ...p, sourceType: "club" })),
    ...institutionPosts.map((p) => ({ ...p, sourceType: "institution" })),
  ];

  // Sort merged list by createdAt descending
  tagged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = tagged.length;
  const paginated = tagged.slice(skip, skip + lim);

  return res.json(
    new ApiResponse(200, {
      updates: paginated,
      total,
      page: Number(page),
      limit: lim,
    })
  );
});