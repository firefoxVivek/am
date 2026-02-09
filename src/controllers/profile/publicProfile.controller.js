import { ApiResponse } from "../../utils/ApiResponse.js";
import { asynchandler } from "../../utils/asynchandler.js";
import mongoose from "mongoose";

import { User } from "../../models/Profile/auth.models.js"; 
import { ApiError } from "../../utils/ApiError.js";
import { Friendship } from "../../models/connections/usersToUser.model.js";
import UserProfile from "../../models/Profile/profile.model.js";

export const getPublicUserProfile =  async (req, res) => {
  const viewerId = req.user?._id; // logged-in user
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user id");
  }

  const uid = new mongoose.Types.ObjectId(userId);
  const vid = viewerId ? new mongoose.Types.ObjectId(viewerId) : null;

  // 1️⃣ Fetch profile + stats
  const profile = await UserProfile.findOne({ userId: uid })
    .select(
      "name username imageUrl location about hobbies experiences totalFriends totalPosts totalParticipations"
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
    }).lean();

    if (friendship) {
      friendshipStatus = {
        status: friendship.status, // pending / accepted / rejected / blocked
        requester: friendship.requester.toString(),
        recipient: friendship.recipient.toString(),
        isRequester: friendship.requester.toString() === vid.toString(),
        isRecipient: friendship.recipient.toString() === vid.toString(),
        isFriend: friendship.status === "accepted",
      };
    } else {
      friendshipStatus = {
        status: "none", // no request exists
        isRequester: false,
        isRecipient: false,
        isFriend: false,
      };
    }
  }

  // 4️⃣ Return clean public response
  const data = {
    userId: uid,
    displayName: profile.name,
    username: profile.username,
    imageUrl: profile.imageUrl,
    bio: profile.about,
    hobbies: profile.hobbies,
    experiences: profile.experiences,
    totalFriends: profile.totalFriends ?? 0,
    totalPosts: profile.totalPosts ?? 0,
    totalParticipations: profile.totalParticipations ?? 0,
    isSelf,
    friendship: friendshipStatus,
    location: profile.location || null,
  };

  return res
    .status(200)
    .json(new ApiResponse(200, data, "Public profile fetched successfully"));
};
 

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
