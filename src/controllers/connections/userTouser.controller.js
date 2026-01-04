import mongoose from "mongoose";
import { Friendship } from "../../models/connections/usersToUser.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";


export const sendFriendRequest = async (req, res) => {
  const requesterId = req.user._id;
  const { userId: recipientId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(recipientId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  if (requesterId.toString() === recipientId) {
    throw new ApiError(400, "Cannot send request to yourself");
  }

  const existing = await Friendship.findOne({
    $or: [
      { requester: requesterId, recipient: recipientId },
      { requester: recipientId, recipient: requesterId },
    ],
  });

  if (existing) {
    if (existing.status === "accepted") {
      throw new ApiError(409, "Already friends");
    }

    if (existing.status === "pending") {
      // Reverse pending → auto accept
      if (existing.requester.toString() === recipientId) {
        existing.status = "accepted";
        existing.actionBy = requesterId;
        await existing.save();

        return res.status(200).json(
          new ApiResponse(200, existing, "Friend request accepted")
        );
      }

      throw new ApiError(409, "Friend request already sent");
    }

    if (existing.status === "blocked") {
      throw new ApiError(403, "You cannot send a request to this user");
    }
  }

  const request = await Friendship.create({
    requester: requesterId,
    recipient: recipientId,
    status: "pending",
    actionBy: requesterId,
  });

  return res.status(201).json(
    new ApiResponse(201, request, "Friend request sent")
  );
};
export const acceptFriendRequest = async (req, res) => {
  const userId = req.user._id;
  const { requestId } = req.params;

  const request = await Friendship.findById(requestId);

  if (!request) {
    throw new ApiError(404, "Friend request not found");
  }

  if (
    request.recipient.toString() !== userId.toString() ||
    request.status !== "pending"
  ) {
    throw new ApiError(403, "Not authorized to accept this request");
  }

  request.status = "accepted";
  request.actionBy = userId;
  await request.save();

  return res.status(200).json(
    new ApiResponse(200, request, "Friend request accepted")
  );
};
export const rejectFriendRequest = async (req, res) => {
  const userId = req.user._id;
  const { requestId } = req.params;

  const request = await Friendship.findById(requestId);

  if (!request) {
    throw new ApiError(404, "Friend request not found");
  }

  if (
    request.recipient.toString() !== userId.toString() ||
    request.status !== "pending"
  ) {
    throw new ApiError(403, "Not authorized to reject this request");
  }

  request.status = "rejected";
  request.actionBy = userId;
  await request.save();

  return res.status(200).json(
    new ApiResponse(200, request, "Friend request rejected")
  );
};
export const cancelFriendRequest = async (req, res) => {
  const userId = req.user._id;
  const { requestId } = req.params;

  const request = await Friendship.findById(requestId);

  if (!request) {
    throw new ApiError(404, "Friend request not found");
  }

  if (
    request.requester.toString() !== userId.toString() ||
    request.status !== "pending"
  ) {
    throw new ApiError(403, "Not authorized to cancel this request");
  }

  await request.deleteOne();

  return res.status(200).json(
    new ApiResponse(200, null, "Friend request cancelled")
  );
};
export const removeFriend = async (req, res) => {
  const userId = req.user._id;
  const { userId: otherUserId } = req.params;

  const friendship = await Friendship.findOne({
    status: "accepted",
    $or: [
      { requester: userId, recipient: otherUserId },
      { requester: otherUserId, recipient: userId },
    ],
  });

  if (!friendship) {
    throw new ApiError(404, "Friendship not found");
  }

  await friendship.deleteOne();

  return res.status(200).json(
    new ApiResponse(200, null, "Friend removed successfully")
  );
};
export const getMyFriends = async (req, res) => {
  const userId = req.user._id;

  const friends = await Friendship.find({
    status: "accepted",
    $or: [{ requester: userId }, { recipient: userId }],
  })
    .populate("requester", "name imageUrl")
    .populate("recipient", "name imageUrl");

  return res.status(200).json(
    new ApiResponse(200, friends, "Friends fetched successfully")
  );
};
export const getIncomingRequests = async (req, res) => {
  const userId = req.user._id;

  const requests = await Friendship.find({
    recipient: userId,
    status: "pending",
  }).populate("requester", "name imageUrl");

  return res.status(200).json(
    new ApiResponse(200, requests, "Incoming requests fetched")
  );
};
export const getOutgoingRequests = async (req, res) => {
  const userId = req.user._id;

  const requests = await Friendship.find({
    requester: userId,
    status: "pending",
  }).populate("recipient", "name imageUrl");

  return res.status(200).json(
    new ApiResponse(200, requests, "Outgoing requests fetched")
  );
};
export const getFriendshipStatus = async (req, res) => {
  const userId = req.user._id;
  const { userId: otherUserId } = req.params;

  const friendship = await Friendship.findOne({
    $or: [
      { requester: userId, recipient: otherUserId },
      { requester: otherUserId, recipient: userId },
    ],
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      friendship
        ? {
            status: friendship.status,
            actionBy: friendship.actionBy,
            requestId: friendship._id,
          }
        : { status: "none" },
      "Friendship status fetched"
    )
  );
};
export const getFriendCount = async (req, res) => {
  const { userId } = req.params;

  const count = await Friendship.countDocuments({
    status: "accepted",
    $or: [{ requester: userId }, { recipient: userId }],
  });

  return res.status(200).json(
    new ApiResponse(200, { count }, "Friend count fetched")
  );
};
