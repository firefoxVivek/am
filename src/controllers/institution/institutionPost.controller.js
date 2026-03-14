import mongoose from "mongoose";
import { Institution }     from "../../models/Profile/institution.model.js";
import { InstitutionPost } from "../../models/institution/institutionPost.model.js";
import { ApiError }        from "../../utils/ApiError.js";
import { ApiResponse }     from "../../utils/ApiResponse.js";
import { asynchandler }    from "../../utils/asynchandler.js";
import { notifyTopic, topicFor } from "../../utils/notify.js";

/* ── Ownership guard ─────────────────────────────────────────────*/
async function ensureInstitutionOwner(institutionId, userId) {
  if (!mongoose.Types.ObjectId.isValid(institutionId)) {
    throw new ApiError(400, "Invalid institution ID");
  }

  const institution = await Institution.findOne({
    _id:       institutionId,
    founderId: userId,
    status:    "active",
  }).lean();

  if (!institution) {
    throw new ApiError(403, "Institution not found or you are not the owner");
  }

  return institution;
}

/* ================================================================
   CREATE POST
   POST /api/v1/institutions/:institutionId/posts
   Body: { title, content, imageUrl, type, isPinned }

   Only the institution founder can post.
   Broadcasts to institution FCM topic immediately after save.
================================================================ */
export const createInstitutionPost = asynchandler(async (req, res) => {
  const { institutionId }             = req.params;
  const { title, content, imageUrl, type, isPinned } = req.body;

  if (!content?.trim()) throw new ApiError(400, "content is required");

  const institution = await ensureInstitutionOwner(institutionId, req.user._id);

  // If this post is being pinned, unpin any currently pinned post first
  if (isPinned) {
    await InstitutionPost.updateMany(
      { institutionId, isPinned: true, isDeleted: false },
      { $set: { isPinned: false } }
    );
  }

  const post = await InstitutionPost.create({
    institutionId,
    authorId:  req.user._id,
    title:     title?.trim() ?? "",
    content:   content.trim(),
    imageUrl:  imageUrl ?? null,
    type:      type ?? "Announcement",
    isPinned:  isPinned ?? false,
  });

  // Broadcast to all institution followers via FCM topic (non-blocking)
  notifyTopic({
    topic:   topicFor({ entityType: "institution", entityId: institutionId }),
    type:    "INSTITUTION_POST",
    title:   title?.trim() || `${institution.name} posted an update`,
    body:    content.length > 120 ? content.slice(0, 117) + "..." : content,
    payload: {
      screen:   "InstitutionDetail",
      entityId: institutionId,
      extra:    { postId: post._id.toString() },
    },
  });

  return res.status(201).json(
    new ApiResponse(201, post, "Post published successfully")
  );
});

/* ================================================================
   GET INSTITUTION FEED
   GET /api/v1/institutions/:institutionId/posts?page=&limit=&type=

   Public — any logged-in user can read the feed.
   Pinned post always surfaces at the top regardless of page.
================================================================ */
export const getInstitutionFeed = asynchandler(async (req, res) => {
  const { institutionId }       = req.params;
  const { page = 1, limit = 20, type } = req.query;

  if (!mongoose.Types.ObjectId.isValid(institutionId)) {
    throw new ApiError(400, "Invalid institution ID");
  }

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const pageLimit  = Math.min(parseInt(limit, 10), 50);
  const skip       = (pageNumber - 1) * pageLimit;

  const filter = { institutionId, isDeleted: false };
  if (type) filter.type = type;

  const [posts, total] = await Promise.all([
    InstitutionPost.find(filter)
      .sort({ isPinned: -1, createdAt: -1 })  // pinned first, then newest
      .skip(skip)
      .limit(pageLimit)
      .lean(),
    InstitutionPost.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      posts,
      pagination: {
        total,
        page:        pageNumber,
        limit:       pageLimit,
        totalPages:  Math.ceil(total / pageLimit),
        hasNextPage: skip + posts.length < total,
      },
    }, "Feed fetched successfully")
  );
});

/* ================================================================
   GET SINGLE POST
   GET /api/v1/institutions/:institutionId/posts/:postId
================================================================ */
export const getInstitutionPost = asynchandler(async (req, res) => {
  const { institutionId, postId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(postId)) {
    throw new ApiError(400, "Invalid post ID");
  }

  const post = await InstitutionPost.findOne({
    _id:           postId,
    institutionId,
    isDeleted:     false,
  }).lean();

  if (!post) throw new ApiError(404, "Post not found");

  return res.status(200).json(new ApiResponse(200, post, "Post fetched"));
});

/* ================================================================
   UPDATE POST
   PATCH /api/v1/institutions/:institutionId/posts/:postId
   Body: { title, content, imageUrl, type, isPinned }

   Only the institution founder can edit.
================================================================ */
export const updateInstitutionPost = asynchandler(async (req, res) => {
  const { institutionId, postId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(postId)) {
    throw new ApiError(400, "Invalid post ID");
  }

  await ensureInstitutionOwner(institutionId, req.user._id);

  const post = await InstitutionPost.findOne({
    _id:           postId,
    institutionId,
    isDeleted:     false,
  }).lean();

  if (!post) throw new ApiError(404, "Post not found");

  const ALLOWED = ["title", "content", "imageUrl", "type", "isPinned"];
  const updates = {};
  for (const key of ALLOWED) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (!Object.keys(updates).length) {
    throw new ApiError(400, "No valid fields to update");
  }

  // If pinning this post, unpin others first
  if (updates.isPinned === true) {
    await InstitutionPost.updateMany(
      { institutionId, isPinned: true, isDeleted: false, _id: { $ne: postId } },
      { $set: { isPinned: false } }
    );
  }

  updates.isEdited = true;

  const updated = await InstitutionPost.findByIdAndUpdate(
    postId,
    { $set: updates },
    { new: true, runValidators: true }
  );

  return res.status(200).json(new ApiResponse(200, updated, "Post updated"));
});

/* ================================================================
   DELETE POST  (soft)
   DELETE /api/v1/institutions/:institutionId/posts/:postId

   Only the institution founder can delete.
================================================================ */
export const deleteInstitutionPost = asynchandler(async (req, res) => {
  const { institutionId, postId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(postId)) {
    throw new ApiError(400, "Invalid post ID");
  }

  await ensureInstitutionOwner(institutionId, req.user._id);

  const post = await InstitutionPost.findOneAndUpdate(
    { _id: postId, institutionId, isDeleted: false },
    { $set: { isDeleted: true, isPinned: false } },
    { new: true }
  );

  if (!post) throw new ApiError(404, "Post not found");

  return res.status(200).json(new ApiResponse(200, {}, "Post deleted"));
});