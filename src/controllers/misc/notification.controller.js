import mongoose          from "mongoose";
import admin             from "../../firebase/firebase.js";
import User              from "../../models/Profile/auth.models.js";
import { Subscription }  from "../../models/misc/subscription.model.js";
import NotificationModel from "../../models/misc/notification.model.js";
import { ApiError }      from "../../utils/ApiError.js";
import { ApiResponse }   from "../../utils/ApiResponse.js";
import { asynchandler }  from "../../utils/asynchandler.js";

/*
 * NOTIFICATION CONTROLLER
 * ──────────────────────────────────────────────────────────────────
 * HTTP endpoints only. No FCM sending logic lives here.
 * All sending goes through utils/notify.js.
 *
 * ROUTES HANDLED:
 *   POST   /api/v1/notifications/token          registerFcmToken
 *   DELETE /api/v1/notifications/token          unregisterFcmToken
 *   POST   /api/v1/notifications/recover        recoverMySubscriptions
 *   GET    /api/v1/notifications/subscriptions  getMySubscriptions
 *   GET    /api/v1/notifications                getMyNotifications
 *   PATCH  /api/v1/notifications/read-all       markAllAsRead
 *   PATCH  /api/v1/notifications/:id/read       markOneAsRead
 *   DELETE /api/v1/notifications/:id            deleteNotification
 */

// ── Internal: recovery engine ─────────────────────────────────────
// Resubscribes a user to all their active topics.
// Called automatically on every token registration.
async function resubscribeAllTopics(userId, newToken) {
  const activeSubs = await Subscription.find({ userId, isActive: true }).lean();
  if (!activeSubs.length) return { restored: 0, failed: 0, total: 0 };

  const results = await Promise.allSettled(
    activeSubs.map((sub) => admin.messaging().subscribeToTopic(newToken, sub.topic))
  );

  // Update token snapshot in one write
  await Subscription.updateMany(
    { userId, isActive: true },
    { $set: { deviceToken: newToken } }
  );

  return {
    restored: results.filter((r) => r.status === "fulfilled").length,
    failed:   results.filter((r) => r.status === "rejected").length,
    total:    activeSubs.length,
  };
}

/*
 * REGISTER FCM TOKEN  (P0)
 * POST /api/v1/notifications/token
 * Body: { fcmToken: string }
 *
 * Call on every app launch and after login.
 * Detects token change → triggers automatic full recovery.
 * Token is stored as a single field — no array, no accumulation.
 */
export const registerFcmToken = asynchandler(async (req, res) => {
  const userId = req.user._id;
  const { fcmToken } = req.body;

  if (!fcmToken?.trim()) throw new ApiError(400, "fcmToken is required");

  const user = await User.findById(userId).select("deviceToken").lean();
  if (!user) throw new ApiError(404, "User not found");

  const isNewToken = user.deviceToken !== fcmToken;

  // Always overwrite — single token per user
  await User.findByIdAndUpdate(userId, { $set: { deviceToken: fcmToken } });

  // Auto-recover on any token change or first registration
  let recovery = null;
  if (isNewToken || !user.deviceToken) {
    recovery = await resubscribeAllTopics(userId, fcmToken);
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      { tokenRegistered: true, recovery },
      recovery
        ? `Token registered. ${recovery.restored}/${recovery.total} topic subscriptions restored.`
        : "Token is already up to date."
    )
  );
});

/*
 * UNREGISTER FCM TOKEN  (P1)
 * DELETE /api/v1/notifications/token
 *
 * Call on logout.
 * Unsubscribes all active topics in Firebase immediately.
 * Subscription docs survive with deviceToken nulled — ready for
 * recovery when the user logs back in.
 */
export const unregisterFcmToken = asynchandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId).select("deviceToken").lean();
  if (!user) throw new ApiError(404, "User not found");

  if (user.deviceToken) {
    const activeSubs = await Subscription.find({ userId, isActive: true }).lean();

    if (activeSubs.length) {
      // Unsubscribe all topics — non-blocking, failures are logged not thrown
      await Promise.allSettled(
        activeSubs.map((sub) =>
          admin.messaging().unsubscribeFromTopic(user.deviceToken, sub.topic)
        )
      );

      // Null token snapshots — marks them as needing recovery
      await Subscription.updateMany(
        { userId, isActive: true },
        { $set: { deviceToken: null } }
      );
    }

    await User.findByIdAndUpdate(userId, { $set: { deviceToken: null } });
  }

  return res.status(200).json(
    new ApiResponse(200, {}, "Logged out. Notifications paused until next login.")
  );
});

/*
 * MANUAL RECOVERY
 * POST /api/v1/notifications/recover
 *
 * Manually resubscribes all active topics for the current user.
 * Use after a Firebase project reset or if auto-recovery failed.
 */
export const recoverMySubscriptions = asynchandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId).select("deviceToken").lean();
  if (!user) throw new ApiError(404, "User not found");
  if (!user.deviceToken) {
    throw new ApiError(400, "No FCM token registered. Open the app on your device first.");
  }

  const result = await resubscribeAllTopics(userId, user.deviceToken);

  return res.status(200).json(
    new ApiResponse(
      200,
      result,
      `Recovery complete. ${result.restored}/${result.total} subscriptions restored.`
    )
  );
});

/*
 * GET MY SUBSCRIPTIONS  (P2)
 * GET /api/v1/notifications/subscriptions?entityType=institution
 *
 * Returns all active subscriptions grouped by entityType.
 * Flutter uses this to set correct Follow/Unfollow / Joined state
 * across institutions, councils, clubs, events — one call.
 *
 * Response shape:
 *   {
 *     total: 12,
 *     grouped: {
 *       institution: [{ entityId, topic, expiresAt }],
 *       club:        [{ entityId, topic, expiresAt }],
 *       event:       [{ entityId, topic, expiresAt }],
 *     }
 *   }
 */
export const getMySubscriptions = asynchandler(async (req, res) => {
  const userId = req.user._id;
  const { entityType } = req.query;

  const filter = { userId, isActive: true };
  if (entityType) filter.entityType = entityType;

  const subs = await Subscription.find(filter)
    .select("entityId entityType topic expiresAt")
    .lean();

  // Group by entityType — Flutter can check grouped.institution easily
  const grouped = {};
  for (const sub of subs) {
    if (!grouped[sub.entityType]) grouped[sub.entityType] = [];
    grouped[sub.entityType].push({
      entityId:  sub.entityId,
      topic:     sub.topic,
      expiresAt: sub.expiresAt ?? null,
    });
  }

  return res.status(200).json(
    new ApiResponse(200, { total: subs.length, grouped }, "Subscriptions fetched")
  );
});

/*
 * GET MY NOTIFICATIONS  (P1)
 * GET /api/v1/notifications?page=&limit=&unreadOnly=&type=
 *
 * Supports:
 *   ?unreadOnly=true        — inbox badge filter
 *   ?type=FRIEND_REQUEST    — filter by type (for Request Center tabs)
 *   ?page=1&limit=20        — cursor pagination
 */
export const getMyNotifications = asynchandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 20, unreadOnly, type } = req.query;

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const pageLimit  = Math.min(parseInt(limit, 10), 50);
  const skip       = (pageNumber - 1) * pageLimit;

  const filter = { recipientId: userId };
  if (unreadOnly === "true") filter.isRead = false;
  if (type)                  filter.type   = type;

  const [notifications, total, unreadCount] = await Promise.all([
    NotificationModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageLimit)
      .lean(),
    NotificationModel.countDocuments(filter),
    NotificationModel.countDocuments({ recipientId: userId, isRead: false }),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      unreadCount,
      notifications,
      pagination: {
        total,
        page:        pageNumber,
        limit:       pageLimit,
        totalPages:  Math.ceil(total / pageLimit),
        hasNextPage: skip + notifications.length < total,
      },
    }, "Notifications fetched")
  );
});

/*
 * MARK ONE AS READ  (P1)
 * PATCH /api/v1/notifications/:notificationId/read
 */
export const markOneAsRead = asynchandler(async (req, res) => {
  const { notificationId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    throw new ApiError(400, "Invalid notification ID");
  }

  const notification = await NotificationModel.findOneAndUpdate(
    { _id: notificationId, recipientId: req.user._id },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  );

  if (!notification) throw new ApiError(404, "Notification not found");

  return res.status(200).json(new ApiResponse(200, notification, "Marked as read"));
});

/*
 * MARK ALL AS READ  (P2)
 * PATCH /api/v1/notifications/read-all
 */
export const markAllAsRead = asynchandler(async (req, res) => {
  const result = await NotificationModel.updateMany(
    { recipientId: req.user._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  return res.status(200).json(
    new ApiResponse(200, { updated: result.modifiedCount }, "All notifications marked as read")
  );
});

/*
 * DELETE NOTIFICATION  (P3)
 * DELETE /api/v1/notifications/:notificationId
 */
export const deleteNotification = asynchandler(async (req, res) => {
  const { notificationId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    throw new ApiError(400, "Invalid notification ID");
  }

  const notification = await NotificationModel.findOneAndDelete({
    _id:         notificationId,
    recipientId: req.user._id,
  });

  if (!notification) throw new ApiError(404, "Notification not found");

  return res.status(200).json(new ApiResponse(200, {}, "Notification deleted"));
});