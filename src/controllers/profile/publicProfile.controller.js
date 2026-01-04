import { ApiResponse } from "../../utils/ApiResponse.js";
import { asynchandler } from "../../utils/asynchandler.js";
import mongoose from "mongoose";

import { User } from "../../models/Profile/auth.models.js"; 
import { ApiError } from "../../utils/ApiError.js";

export const getPublicUserProfile = asynchandler(async (req, res) => {
  const { userId } = req.params;
  const viewerId = req.user?._id;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user id");
  }

  const uid = new mongoose.Types.ObjectId(userId);
  const vid = viewerId ? new mongoose.Types.ObjectId(viewerId) : null;

  const result = await User.aggregate([
    // 1️⃣ Match user
    { $match: { _id: uid } },

    // 2️⃣ Join profile
    {
      $lookup: {
        from: "userprofiles",
        localField: "_id",
        foreignField: "userId",
        as: "profile",
      },
    },
    { $unwind: { path: "$profile", preserveNullAndEmptyArrays: true } },

    // 3️⃣ Count friends
    {
      $lookup: {
        from: "friendships",
        let: { uid: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$status", "accepted"] },
                  {
                    $or: [
                      { $eq: ["$requester", "$$uid"] },
                      { $eq: ["$recipient", "$$uid"] },
                    ],
                  },
                ],
              },
            },
          },
        ],
        as: "friends",
      },
    },

    // 4️⃣ Friendship vs viewer
    {
      $lookup: {
        from: "friendships",
        let: { uid: "$_id", vid },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  {
                    $and: [
                      { $eq: ["$requester", "$$vid"] },
                      { $eq: ["$recipient", "$$uid"] },
                    ],
                  },
                  {
                    $and: [
                      { $eq: ["$requester", "$$uid"] },
                      { $eq: ["$recipient", "$$vid"] },
                    ],
                  },
                ],
              },
            },
          },
        ],
        as: "friendship",
      },
    },

    // 5️⃣ Compute fields
    {
      $addFields: {
        isSelf: { $eq: ["$_id", vid] },

        stats: {
          friends: { $size: "$friends" },
        },

        friendship: {
          $cond: [
            { $eq: ["$_id", vid] },
            {
              status: "self",
              isFriend: false,
              canSendRequest: false,
            },
            {
              $cond: [
                { $gt: [{ $size: "$friendship" }, 0] },
                {
                  $let: {
                    vars: { f: { $arrayElemAt: ["$friendship", 0] } },
                    in: {
                      status: "$$f.status",
                      isFriend: { $eq: ["$$f.status", "accepted"] },
                      canSendRequest: {
                        $not: {
                          $in: ["$$f.status", ["accepted", "pending"]],
                        },
                      },
                    },
                  },
                },
                {
                  status: "none",
                  isFriend: false,
                  canSendRequest: true,
                },
              ],
            },
          ],
        },
      },
    },

    // 6️⃣ Final SAFE projection
    {
      $project: {
        _id: 1,
        displayName: 1,
        username: 1,

        imageUrl: {
          $ifNull: [
            "$profile.imageUrl",
            {
              $cond: [
                { $eq: ["$imageUrl", ""] },
                null,
                "$imageUrl",
              ],
            },
          ],
        },

        about: { $ifNull: ["$profile.about", ""] },
        hobbies: { $ifNull: ["$profile.hobbies", []] },
        experiences: { $ifNull: ["$profile.experiences", []] },
        userTypeMeta: { $ifNull: ["$profile.userTypeMeta", {}] },

        friendship: 1,
        isSelf: 1,
        stats: 1,
      },
    },
  ]);

  if (!result.length) {
    throw new ApiError(404, "Public profile not found");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, result[0], "Public profile fetched successfully")
    );
});
 

export const searchPublicUserProfiles = asynchandler(async (req, res) => {
  const { q = "", page = 1, limit = 10 } = req.query;

  if (!q.trim()) {
    throw new ApiError(400, "Search query is required");
  }

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const pageLimit = Math.min(parseInt(limit, 10), 50);
  const skip = (pageNumber - 1) * pageLimit;

  // 🔍 Search by displayName or username (case-insensitive)
  const searchFilter = {
    $or: [
      { displayName: { $regex: q.trim(), $options: "i" } },
      { username: { $regex: q.trim(), $options: "i" } },
    ],
    status: "registered", // only show registered users
  };

  const [users, total] = await Promise.all([
    User.find(searchFilter)
      .select("_id displayName username imageUrl role createdAt")
      .sort({ displayName: 1 })
      .skip(skip)
      .limit(pageLimit),
    User.countDocuments(searchFilter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        results: users,
        pagination: {
          total,
          page: pageNumber,
          limit: pageLimit,
          totalPages: Math.ceil(total / pageLimit),
          hasNextPage: skip + users.length < total,
        },
      },
      "User profiles fetched successfully"
    )
  );
});
