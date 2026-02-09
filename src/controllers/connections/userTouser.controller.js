import mongoose from "mongoose";
import { Friendship } from "../../models/connections/usersToUser.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import admin from "../../../config/firebase.js"; // path may vary

import { log } from "../../utils/logger.js";
import User from "../../models/Profile/auth.models.js";

export const sendFriendRequest = async (req, res) => {
  console.log("🟢 STEP 1: sendFriendRequest controller HIT");

  const requesterId = req.user._id;
  const { userId: recipientId } = req.params;

  log.info("Friend request initiated", { requesterId, recipientId });

  // ----------------- VALIDATIONS -----------------
  if (!mongoose.Types.ObjectId.isValid(recipientId)) {
    log.warn("Invalid recipient ID", { recipientId });
    throw new ApiError(400, "Invalid user ID");
  }

  if (requesterId.toString() === recipientId) {
    log.warn("Self friend request attempt", { requesterId });
    throw new ApiError(400, "Cannot send request to yourself");
  }

  // ----------------- CHECK EXISTING FRIENDSHIP -----------------
  const existing = await Friendship.findOne({
    $or: [
      { requester: requesterId, recipient: recipientId },
      { requester: recipientId, recipient: requesterId },
    ],
  });

  if (existing) {
    log.info("Existing friendship found", { status: existing.status, id: existing._id });

    if (existing.status === "accepted") throw new ApiError(409, "Already friends");
    if (existing.status === "blocked") throw new ApiError(403, "You cannot send a request to this user");

    if (existing.status === "pending") {
      if (existing.requester.toString() === recipientId) {
        existing.status = "accepted";
        existing.actionBy = requesterId;
        await existing.save();
        log.info("Friend request auto-accepted", { friendshipId: existing._id });

        return res.status(200).json(new ApiResponse(200, existing, "Friend request accepted"));
      }
      throw new ApiError(409, "Friend request already sent");
    }
  }

  // ----------------- CREATE FRIEND REQUEST -----------------
  const request = await Friendship.create({
    requester: requesterId,
    recipient: recipientId,
    status: "pending",
    actionBy: requesterId,
  });

  log.info("Friend request created", { friendshipId: request._id });

  // ----------------- FETCH RECIPIENT -----------------
  const recipientUser = await User.findById(recipientId).select("deviceTokens displayName");

  if (!recipientUser) {
    log.warn("Recipient user not found", { recipientId });
  }

  console.log("📱 STEP 2: recipientUser =", {
    id: recipientUser?._id,
    tokens: recipientUser?.deviceTokens,
  });

 
 // ----------------- SEND PUSH NOTIFICATION (SINGLE TOKEN) -----------------
if (recipientUser?.deviceTokens?.length > 0) {
  console.log("🟢 STEP 3: Entered FCM block (single token send)");

  const message = {
    token: recipientUser.deviceTokens[0], // ✅ single token
    notification: {
      title: "New Friend Request 👋",
      body: `${req.user.displayName} sent you a friend request`,
    },
    data: {
      type: "FRIEND_REQUEST",
      requesterId: requesterId.toString(),
    },
  };

  try {
    console.log("🚀 STEP 4: Sending FCM notification (single token)");
    const response = await admin.messaging().send(message);

    console.log("✅ STEP 5: FCM response", response);
  } catch (err) {
    console.error("🔥 STEP 7: FCM SEND ERROR", {
      message: err.message,
      stack: err.stack,
    });
  }
} else {
  console.log("ℹ️ No device tokens found for recipient", { recipientId });
}


  console.log("🟢 STEP 8: Finished FCM block");

  // ----------------- RETURN RESPONSE -----------------
  return res.status(201).json(new ApiResponse(201, request, "Friend request sent"));
};
 

export const acceptFriendRequest = async (req, res) => {
  const userId = req.user._id;
  const { requestId } = req.params;

  const request = await Friendship.findById(requestId);
  if (!request) throw new ApiError(404, "Friend request not found");

  if (
    request.recipient.toString() !== userId.toString() ||
    request.status !== "pending"
  ) {
    throw new ApiError(403, "Not authorized to accept this request");
  }

  // 1️⃣ Accept request
  request.status = "accepted";
  request.actionBy = userId;
  await request.save();

  const requesterId = request.requester.toString();
  const recipientId = userId.toString();

  // 2️⃣ Fetch both users with tokens
  const [requester, recipient] = await Promise.all([
    User.findById(requesterId).select("deviceTokens displayName"),
    User.findById(recipientId).select("deviceTokens displayName"),
  ]);

  // 3️⃣ Subscribe both users to each other’s topics
  const subscribePromises = [];

  if (requester?.deviceTokens?.length) {
    subscribePromises.push(
      admin.messaging().subscribeToTopic(
        requester.deviceTokens,
        `user_${recipientId}`
      )
    );
  }

  if (recipient?.deviceTokens?.length) {
    subscribePromises.push(
      admin.messaging().subscribeToTopic(
        recipient.deviceTokens,
        `user_${requesterId}`
      )
    );
  }

  if (subscribePromises.length) {
    try {
      await Promise.all(subscribePromises);
      log.info("Users subscribed to each other topics", {
        requesterId,
        recipientId,
      });
    } catch (err) {
      log.error("Topic subscription failed", { error: err.message });
    }
  }

  // 4️⃣ Notify requester (optional but good UX)
  if (requester?.deviceTokens?.length) {
    try {
      await admin.messaging().send({
        tokens: requester.deviceTokens,
        notification: {
          title: "Friend Request Accepted 🎉",
          body: `${recipient.displayName} accepted your friend request`,
        },
        data: {
          type: "FRIEND_REQUEST_ACCEPTED",
          userId: recipientId,
        },
      });
    } catch (err) {
      log.error("FCM notification failed", { error: err.message });
    }
  }

  return res.status(200).json(
    new ApiResponse(200, request, "Friend request accepted")
  );
};


export const rejectFriendRequest = async (req, res) => {
  console.log("🟢 STEP 1: rejectFriendRequest controller HIT");

  const userId = req.user._id;
  const { requestId } = req.params;

  // ----------------- FETCH FRIEND REQUEST -----------------
  const request = await Friendship.findById(requestId);

  if (!request) {
    throw new ApiError(404, "Friend request not found");
  }

  if (request.recipient.toString() !== userId.toString() || request.status !== "pending") {
    throw new ApiError(403, "Not authorized to reject this request");
  }

  log.info("Rejecting friend request", { requestId, userId });

  // ----------------- UPDATE STATUS -----------------
  request.status = "rejected";
  request.actionBy = userId;
  await request.save();

  log.info("Friend request marked as rejected", { requestId });

  // ----------------- NOTIFY REQUESTER -----------------
  const requesterUser = await User.findById(request.requester).select("deviceTokens displayName");

  if (requesterUser?.deviceTokens?.length > 0) {
    const message = {
      token: requesterUser.deviceTokens[0], // single device token for now
      notification: {
        title: "Friend Request Rejected ❌",
        body: `${req.user.displayName} rejected your friend request.`,
      },
      data: {
        type: "FRIEND_REQUEST_REJECTED",
        recipientId: userId.toString(),
        requestId: requestId,
      },
    };

    try {
      console.log("🚀 STEP 2: Sending FCM to requester");
      const response = await admin.messaging().send(message);
      log.info("FCM sent to requester", { success: response, requestId });
    } catch (err) {
      log.error("🔥 FCM send failed", { error: err.message, requestId });
    }
  } else {
    log.info("No device tokens found for requester", { requesterId: request.requester });
  }

  // ----------------- DELETE FRIEND REQUEST -----------------
  await Friendship.findByIdAndDelete(requestId);
  log.info("Friend request document deleted", { requestId });

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Friend request rejected and deleted"));
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

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Friend request cancelled"));
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

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Friend removed successfully"));
};
export const getMyFriends = async (req, res) => {
  const userId = req.user._id;

  const friends = await Friendship.find({
    status: "accepted",
    $or: [{ requester: userId }, { recipient: userId }],
  })
    .populate("requester", "username displayName imageUrl")
    .populate("recipient", "username displayName imageUrl");

  return res
    .status(200)
    .json(new ApiResponse(200, friends, "Friends fetched successfully"));
};
export const getIncomingRequests = async (req, res) => {
  const userId = req.user._id;

  const requests = await Friendship.find({
    recipient: userId,
    status: "pending",
  }).populate("requester", "username imageUrl");

  return res
    .status(200)
    .json(new ApiResponse(200, requests, "Incoming requests fetched"));
};
export const getOutgoingRequests = async (req, res) => {
  const userId = req.user._id;

  const requests = await Friendship.find({
    requester: userId,
    status: "pending",
  }).populate("recipient", "name imageUrl");

  return res
    .status(200)
    .json(new ApiResponse(200, requests, "Outgoing requests fetched"));
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

  return res
    .status(200)
    .json(new ApiResponse(200, { count }, "Friend count fetched"));
};
