
 
import { ClubPost } from "../../models/club/posts.model.js";
import { asynchandler } from "../../utils/asynchandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import admin from "../../../config/firebase.js";
import User from "../../models/Profile/auth.models.js";
 

export const createPost = asynchandler(async (req, res) => {
  const { clubId, title, content, type, taggedUsers, publishAt, expireAt } =
    req.body;

  if (!clubId || !content || !type) {
    throw new ApiError(400, "Required fields missing");
  }

  const post = await ClubPost.create({
    clubId,
    title,
    content,
    type,
    taggedUsers,
    publishAt,
    expireAt,
    createdBy: req.user._id,
  });

  /* =========================
     CLUB TOPIC NOTIFICATION
  ========================== */
  const clubTopicMessage = {
    topic: `club_${clubId}`,
    notification: {
      title: title || "New Club Post 📢",
      body:
        content.length > 100
          ? content.slice(0, 97) + "..."
          : content,
    },
    data: {
      postId: post._id.toString(),
      clubId: clubId.toString(),
      type,
      screen: "club_post",
    },
  };

  // fire & forget
  admin.messaging().send(clubTopicMessage).catch(console.error);

  /* =========================
     TAGGED USERS NOTIFICATION
     (only those having userId)
  ========================== */
  if (Array.isArray(taggedUsers) && taggedUsers.length > 0) {
    // extract valid userIds
    const taggedUserIds = taggedUsers
      .filter((t) => t.userId)
      .map((t) => t.userId);

    if (taggedUserIds.length > 0) {
      const users = await User.find(
        { _id: { $in: taggedUserIds } },
        { deviceTokens: 1 }
      );

      // flatten + dedupe tokens
      const tokens = [
        ...new Set(users.flatMap((u) => u.deviceTokens || [])),
      ];

      if (tokens.length > 0) {
        const multicastMessage = {
          tokens,
          notification: {
            title: "👋 You were mentioned",
            body: title || "You were tagged in a club post",
          },
          data: {
            postId: post._id.toString(),
            clubId: clubId.toString(),
            type,
            screen: "club_post",
            isTagged: "true",
          },
        };

        const response = await admin
          .messaging()
          .sendEachForMulticast(multicastMessage);

        // OPTIONAL: cleanup dead tokens
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.error(
              "Invalid FCM token:",
              tokens[idx],
              resp.error?.message
            );
            // remove tokens[idx] from DB if needed
          }
        });
      }
    }
  }

  return res
    .status(201)
    .json(new ApiResponse(201, post, "Post created successfully"));
});


/* =========================
   GET CLUB POSTS (FEED)
========================== */
export const getClubPosts = asynchandler(async (req, res) => {
  const { clubId } = req.params;

  const posts = await ClubPost.find({
    clubId,
    isDeleted: false,

    // only published posts
    publishAt: { $lte: new Date() },

    // hide expired posts
    $or: [
      { expireAt: null },
      { expireAt: { $gt: new Date() } },
    ],
  })
    .sort({ publishAt: -1 })
    .populate("createdBy", "name avatar");

  return res
    .status(200)
    .json(new ApiResponse(200, posts, "Club posts fetched"));
});
/* =========================
   GET SINGLE POST
========================== */
export const getPostById = asynchandler(async (req, res) => {
  const { postId } = req.params;

  const post = await ClubPost.findOne({
    _id: postId,
    isDeleted: false,

    // hide expired posts
    $or: [
      { expireAt: null },
      { expireAt: { $gt: new Date() } },
    ],
  })
    .populate("createdBy", "name avatar");

  if (!post) {
    throw new ApiError(404, "Post not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, post, "Post fetched"));
});


/* =========================
   UPDATE POST
========================== */
export const updatePost = asynchandler(async (req, res) => {
  const { postId } = req.params;

  const post = await ClubPost.findOne({
    _id: postId,
    isDeleted: false,

    // prevent editing expired posts
    $or: [
      { expireAt: null },
      { expireAt: { $gt: new Date() } },
    ],
  });

  if (!post) {
    throw new ApiError(404, "Post not found or expired");
  }

  // Only creator (or admin – extend later)
  if (post.createdBy.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "Not allowed to edit this post");
  }

  /* =========================
     ALLOWED UPDATES
  ========================== */
  const allowedFields = [
    "title",
    "content",
    "type",
    "taggedUsers",
    "publishAt",
    "expireAt",
  ];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      post[field] = req.body[field];
    }
  });

  /* =========================
     VALIDATIONS
  ========================== */
  if (
    post.expireAt &&
    post.publishAt &&
    new Date(post.expireAt) <= new Date(post.publishAt)
  ) {
    throw new ApiError(
      400,
      "expireAt must be greater than publishAt"
    );
  }

  post.isEdited = true;

  await post.save();

  return res
    .status(200)
    .json(new ApiResponse(200, post, "Post updated successfully"));
});

/* =========================
   DELETE POST (SOFT)
========================== */
export const deletePost = asynchandler(async (req, res) => {
  const { postId } = req.params;

  const post = await ClubPost.findById(postId);

  if (!post || post.isDeleted) {
    throw new ApiError(404, "Post not found");
  }

  // Optional: only creator or admin
  if (post.createdBy.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "Not allowed to delete this post");
  }

  post.isDeleted = true;
  await post.save();

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Post deleted successfully"));
});
/* =========================
   GET CLUB POSTS BY DATE
   (YYYY-MM-DD)
========================== */
export const getClubPostsByDate = asynchandler(async (req, res) => {
  const { clubId, date } = req.params;
  const { type } = req.query; // optional filter

  /* =========================
     DATE VALIDATION
  ========================== */
  const selectedDate = new Date(date);
  if (isNaN(selectedDate.getTime())) {
    throw new ApiError(400, "Invalid date format. Use YYYY-MM-DD");
  }

  // Start & end of the selected day
  const startOfDay = new Date(selectedDate);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(selectedDate);
  endOfDay.setHours(23, 59, 59, 999);

  /* =========================
     QUERY BUILD
  ========================== */
  const query = {
    clubId,
    isDeleted: false,

    publishAt: {
      $gte: startOfDay,
      $lte: endOfDay,
    },

    // exclude expired posts (extra safety)
    $or: [
      { expireAt: null },
      { expireAt: { $gt: new Date() } },
    ],
  };

  // Optional type filter
  if (type) {
    query.type = type; // Announcement | Update | Felicitation
  }

  /* =========================
     FETCH POSTS
  ========================== */
  const posts = await ClubPost.find(query)
    .sort({ publishAt: -1 })
    .populate("createdBy", "name avatar");

  return res.status(200).json(
    new ApiResponse(200, posts, "Posts fetched for selected date")
  );
});

