import mongoose from "mongoose";
import { Council }     from "../../models/club/council.model.js";
import { Institution } from "../../models/Profile/institution.model.js";
import { ApiError }    from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asynchandler } from "../../utils/asynchandler.js";
import {
  subscribeToTopic,
  unsubscribeFromTopic,
  topicFor,
} from "../../utils/notify.js";

/* ── Ownership guard ─────────────────────────────────────────────*/
async function ensureCouncilOwner(councilId, userId) {
  const council = await Council.findById(councilId).lean();
  if (!council || council.status === "deleted") {
    throw new ApiError(404, "Council not found");
  }
  if (!council.owner?.id || council.owner.id.toString() !== userId.toString()) {
    throw new ApiError(403, "Only the council owner can perform this action");
  }
  return council;
}

/* ================================================================
   CREATE COUNCIL
   POST /api/v1/councils
   Body: { councilId, councilName, about, image, privacy, institutionId }

   Only institution founders can create a council for their institution.
================================================================ */
export const createCouncil = asynchandler(async (req, res) => {
  const userId = req.user._id;
  const { councilId, councilName, about, image, privacy, institutionId } = req.body;

  if (!councilId?.trim())   throw new ApiError(400, "councilId is required");
  if (!councilName?.trim()) throw new ApiError(400, "councilName is required");
  if (!institutionId)       throw new ApiError(400, "institutionId is required");

  // Verify the requester owns this institution
  const institution = await Institution.findOne({
    _id:       institutionId,
    founderId: userId,
    status:    { $ne: "draft" },
  }).lean();

  if (!institution) {
    throw new ApiError(403, "You must be the founder of this institution to create a council");
  }

  // Check councilId uniqueness (case-insensitive — handled by model index)
  const existing = await Council.findOne({
    councilId: councilId.toLowerCase().trim(),
  }).lean();
  if (existing) throw new ApiError(409, "Council ID is already taken");

  const council = await Council.create({
    councilId: councilId.toLowerCase().trim(),
    councilName: councilName.trim(),
    about:       about?.trim() ?? "",
    image:       image ?? null,
    privacy:     privacy ?? "public",
    owner: {
      id:   userId,
      name: req.user.displayName,
    },
    institution: {
      id:   institution._id,
      name: institution.name,
    },
  });

  return res.status(201).json(
    new ApiResponse(201, council, "Council created successfully")
  );
});

/* ================================================================
   GET MY COUNCILS  (councils I own)
   GET /api/v1/councils/mine
================================================================ */
export const getMyCouncils = asynchandler(async (req, res) => {
  const councils = await Council.find({
    "owner.id": req.user._id,
    status:     { $ne: "deleted" },
  })
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json(
    new ApiResponse(200, { count: councils.length, councils }, "Councils fetched")
  );
});

/* ================================================================
   GET COUNCIL BY ID  (public)
   GET /api/v1/councils/:councilId
================================================================ */
export const getCouncilById = asynchandler(async (req, res) => {
  const { councilId } = req.params;
 
  // Accept either MongoDB _id or the human-readable councilId slug
  const isObjectId = mongoose.Types.ObjectId.isValid(councilId);
  const filter = isObjectId
    ? { _id: councilId,    status: { $ne: "deleted" } }
    : { councilId,         status: { $ne: "deleted" } };

  const council = await Council.findOne(filter).lean();
  if (!council) throw new ApiError(404, "Council not found");

  const isOwner =
    council.owner?.id != null &&
    council.owner.id.toString() === req.user._id.toString();

  return res.status(200).json(
    new ApiResponse(200, { ...council, isOwner }, "Council fetched")
  );
});

/* ================================================================
   GET COUNCILS BY INSTITUTION  (public)
   GET /api/v1/councils/institution/:institutionId
================================================================ */
export const getCouncilsByInstitution = asynchandler(async (req, res) => {
  const { institutionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(institutionId)) {
    throw new ApiError(400, "Invalid institution ID");
  }

  const councils = await Council.find({
    "institution.id": institutionId,
    status:           "active",
    privacy:          { $ne: "private" },
  })
    .sort({ clubsCount: -1, createdAt: -1 })
    .lean();

  return res.status(200).json(
    new ApiResponse(200, { count: councils.length, councils }, "Councils fetched")
  );
});

/* ================================================================
   SEARCH COUNCILS
   GET /api/v1/councils/search?q=&page=&limit=
================================================================ */
export const searchCouncils = asynchandler(async (req, res) => {
  const { q, page = 1, limit = 15 } = req.query;

  if (!q?.trim() || q.trim().length < 2) {
    throw new ApiError(400, "Search query must be at least 2 characters");
  }

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const pageLimit  = Math.min(parseInt(limit, 10), 30);
  const skip       = (pageNumber - 1) * pageLimit;

  const filter = {
    $text:   { $search: q.trim() },
    status:  "active",
    privacy: { $ne: "private" },
  };

  const [councils, total] = await Promise.all([
    Council.find(filter, { score: { $meta: "textScore" } })
      .sort({ score: { $meta: "textScore" } })
      .skip(skip)
      .limit(pageLimit)
      .lean(),
    Council.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      councils,
      pagination: {
        total,
        page:        pageNumber,
        limit:       pageLimit,
        totalPages:  Math.ceil(total / pageLimit),
        hasNextPage: skip + councils.length < total,
      },
    }, "Search results")
  );
});

/* ================================================================
   UPDATE COUNCIL
   PATCH /api/v1/councils/:councilId
   Body: { councilName, about, image, privacy }
================================================================ */
export const updateCouncil = asynchandler(async (req, res) => {
  const council = await ensureCouncilOwner(req.params.councilId, req.user._id);

  const ALLOWED = ["councilName", "about", "image", "privacy"];
  const updates = {};
  for (const key of ALLOWED) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (!Object.keys(updates).length) {
    throw new ApiError(400, "No valid fields to update");
  }

  const updated = await Council.findByIdAndUpdate(
    council._id,
    { $set: updates },
    { new: true, runValidators: true }
  );

  return res.status(200).json(
    new ApiResponse(200, updated, "Council updated")
  );
});

/* ================================================================
   DELETE COUNCIL  (soft)
   DELETE /api/v1/councils/:councilId
================================================================ */
export const deleteCouncil = asynchandler(async (req, res) => {
  const council = await ensureCouncilOwner(req.params.councilId, req.user._id);

  await Council.findByIdAndUpdate(council._id, { $set: { status: "deleted" } });

  return res.status(200).json(
    new ApiResponse(200, {}, "Council deleted")
  );
});

/* ================================================================
   FOLLOW COUNCIL  (subscribe to topic)
   POST /api/v1/councils/:councilId/follow
================================================================ */
export const followCouncil = asynchandler(async (req, res) => {
  const userId     = req.user._id;
  const { councilId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(councilId)) {
    throw new ApiError(400, "Invalid council ID");
  }

  const council = await Council.findOne({
    _id:    councilId,
    status: "active",
  }).lean();

  if (!council) throw new ApiError(404, "Council not found");
  if (council.privacy === "private") {
    throw new ApiError(403, "This council is private");
  }

  const result = await subscribeToTopic({
    userId,
    entityId:   council._id,
    entityType: "council",
    expiresAt:  null,          // permanent subscription
  });

  // Increment followersCount atomically
  await Council.findByIdAndUpdate(council._id, { $inc: { followersCount: 1 } });

  return res.status(200).json(
    new ApiResponse(200, { topic: result.topic }, "Following council")
  );
});

/* ================================================================
   UNFOLLOW COUNCIL
   DELETE /api/v1/councils/:councilId/follow
================================================================ */
export const unfollowCouncil = asynchandler(async (req, res) => {
  const userId     = req.user._id;
  const { councilId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(councilId)) {
    throw new ApiError(400, "Invalid council ID");
  }

  await unsubscribeFromTopic({ userId, entityId: councilId });

  // Decrement floor at 0
  await Council.findOneAndUpdate(
    { _id: councilId, followersCount: { $gt: 0 } },
    [{ $set: { followersCount: { $max: [0, { $subtract: ["$followersCount", 1] }] } } }]
  );

  return res.status(200).json(
    new ApiResponse(200, {}, "Unfollowed council")
  );
});