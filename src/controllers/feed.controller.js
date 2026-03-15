 
import mongoose from "mongoose";
 
 
 
 
 
 
 
import { asynchandler } from "../utils/asynchandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import Story from "../models/story/masterStory.model.js";
import { ClubPost } from "../models/club/posts.model.js";
import InstitutionPost from "../models/institution/institutionPost.model.js";
import { Friendship } from "../models/connections/usersToUser.model.js";
import { ClubMembership } from "../models/connections/userToClub.model.js";
 
/* ─── social graph ─────────────────────────────────────────────────────────── */
async function resolveGraph(userId) {
  const [memberships, friendships] = await Promise.all([
    // ALL clubs where user has any role (member, admin, owner) and is approved
    ClubMembership.find({
      userId,
      status: { $in: ["approved", "active"] },
      role:   { $in: ["member", "admin", "owner"] },
    }).select("clubId").lean(),
 
    // Friends in either direction
    Friendship.find({
      $or: [{ requester: userId }, { recipient: userId }],
      status: "accepted",
    }).select("requester recipient").lean(),
  ]);
 
  const clubIds = [...new Set(memberships.map((m) => m.clubId?.toString()).filter(Boolean))];
  const friendIds = friendships.map((f) =>
    f.requester.toString() === userId.toString() ? f.recipient : f.requester
  );
 
  return { clubIds, friendIds };
}
 
/* ─── GET /api/v1/feed/updates ─────────────────────────────────────────────── */
export const getUpdatesFeed = asynchandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const userId = req.user._id;
 
  const { clubIds } = await resolveGraph(userId);
  const followedInstitutionIds = req.user.followedInstitutions ?? [];
 
  const skip = (Number(page) - 1) * Number(limit);
  const lim  = Number(limit);
 
  const [clubPosts, institutionPosts] = await Promise.all([
    clubIds.length
      ? ClubPost.find({ clubId: { $in: clubIds }, isActive: true })
          .populate("clubId",    "clubName image")
          .populate("createdBy", "displayName imageUrl username")
          .sort({ createdAt: -1 }).lean()
      : [],
    followedInstitutionIds.length
      ? InstitutionPost.find({ institutionId: { $in: followedInstitutionIds } })
          .populate("institutionId", "name logo")
          .sort({ createdAt: -1 }).lean()
      : [],
  ]);
 
  const tagged = [
    ...clubPosts.map((p) => ({ ...p, sourceType: "club" })),
    ...institutionPosts.map((p) => ({ ...p, sourceType: "institution" })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
 
  const total     = tagged.length;
  const paginated = tagged.slice(skip, skip + lim);
 
  return res.json(new ApiResponse(200, {
    updates:     paginated,
    total,
    page:        Number(page),
    limit:       lim,
    hasNextPage: skip + paginated.length < total,
  }, "Feed fetched"));
});
 
/* ─── GET /api/v1/feed/stories ─────────────────────────────────────────────── */
export const getStoriesFeed = asynchandler(async (req, res) => {
  const { page = 1, limit = 30 } = req.query;
  const userId = req.user._id;
 
  const { clubIds, friendIds } = await resolveGraph(userId);
  const followedInstitutionIds = req.user.followedInstitutions ?? [];
 
  const since  = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const orClauses = [];
 
  if (friendIds.length) orClauses.push({ userId: { $in: friendIds } });
  if (clubIds.length)   orClauses.push({ clubId: { $in: clubIds } });
 
  if (!orClauses.length) {
    return res.json(new ApiResponse(200, {
      stories: [], total: 0, page: Number(page), limit: Number(limit),
    }, "No stories"));
  }
 
  const filter = { createdAt: { $gte: since }, $or: orClauses };
 
  const [stories, total] = await Promise.all([
    Story.find(filter)
      .select("title image createdAt userId clubId")
      .populate("userId", "displayName imageUrl username")
      .populate("clubId", "clubName image")
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean(),
    Story.countDocuments(filter),
  ]);
 
  return res.json(new ApiResponse(200, {
    stories,
    total,
    page:        Number(page),
    limit:       Number(limit),
    hasNextPage: (Number(page) - 1) * Number(limit) + stories.length < total,
  }, "Stories fetched"));
});
 