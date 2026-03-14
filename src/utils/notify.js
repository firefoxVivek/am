import admin            from "../../config/firebase.js";
import User             from "../models/Profile/auth.models.js";
import { Subscription } from "../models/misc/subscription.model.js";
import NotificationModel from "../models/misc/notification.model.js";

/*
 * ══════════════════════════════════════════════════════════════════
 * notify.js
 * ──────────────────────────────────────────────────────────────────
 * SINGLE entry point for ALL notification sending in the app.
 * Every controller that needs to notify a user calls notify() or
 * notifyMany() from here — never calls Firebase or writes
 * NotificationModel directly.
 *
 * ARCHITECTURE
 * ────────────
 *  notify()          → sends to one specific recipient (direct push + DB doc)
 *  notifyMany()      → sends to a list of recipients (loops notify)
 *  topicFor()        → builds the FCM topic string for any entity
 *  subscribeToTopic()   → subscribe user to a topic + write registry
 *  unsubscribeFromTopic() → unsubscribe user from a topic + update registry
 *
 * FLUTTER ROUTING CONTRACT (enforced by the payload builder below)
 * ────────────────────────
 * Both FCM RemoteMessage.data and the in-app API response carry
 * the same payload structure. Flutter reads it the same way
 * regardless of how the notification arrived:
 *
 *   final p = notification.payload;         // in-app API
 *   final p = remoteMessage.data;           // FCM background/killed
 *
 *   context.pushNamed(
 *     p['screen'],
 *     pathParameters: { 'id': p['entityId'] },
 *     extra: jsonDecode(p['extra']),         // Map<String,String>
 *   );
 *
 * ══════════════════════════════════════════════════════════════════
 */

// ── Topic name builder ────────────────────────────────────────────
/*
 * topicFor({ entityType, entityId })
 * Returns the canonical FCM topic string for any entity.
 * Use this everywhere — never hardcode topic strings.
 *
 *  topicFor({ entityType: "institution", entityId: inst._id })
 *  → "institution_64f3a..."
 */
export function topicFor({ entityType, entityId }) {
  return `${entityType}_${entityId}`;
}

// ── FCM data payload builder ──────────────────────────────────────
// All values MUST be strings — FCM rejects non-string data values.
// extra is serialised to JSON string for FCM, parsed back by Flutter.
function buildFcmData({ type, screen, entityId, actorId, actorName, actorImage, extra }) {
  return {
    type:       String(type       ?? ""),
    screen:     String(screen     ?? "Notifications"),
    entityId:   String(entityId   ?? ""),
    actorId:    String(actorId    ?? ""),
    actorName:  String(actorName  ?? ""),
    actorImage: String(actorImage ?? ""),
    // extra serialised so Flutter can JSON.decode it
    extra:      JSON.stringify(
      Object.fromEntries(
        Object.entries(extra ?? {}).map(([k, v]) => [k, String(v)])
      )
    ),
  };
}

/*
 * notify()
 * ──────────────────────────────────────────────────────────────────
 * Sends FCM push to a specific recipient AND stores an in-app doc.
 * Non-blocking — never throws to the caller; logs errors internally.
 *
 * REQUIRED ARGS:
 *   recipientId  {ObjectId|string}   who receives it
 *   type         {string}            NotificationModel type enum
 *   title        {string}            shown in notification tray
 *   payload      {object}            see PayloadSchema — screen + entityId + actor + extra
 *
 * OPTIONAL ARGS:
 *   senderId     {ObjectId|string}   who triggered it (null for system)
 *   body         {string}            notification body text
 *
 * PAYLOAD OBJECT:
 *   {
 *     screen:     "BookingDetail",           // Flutter GoRouter route name
 *     entityId:   booking._id.toString(),    // primary ID
 *     actorId:    req.user._id.toString(),   // who triggered (for avatar)
 *     actorName:  req.user.displayName,
 *     actorImage: req.user.imageUrl ?? "",
 *     extra:      { status: "confirmed" },   // flat string-value map
 *   }
 *
 * EXAMPLE:
 *   import { notify } from "../../utils/notify.js";
 *
 *   await notify({
 *     recipientId: booking.userId,
 *     senderId:    req.user._id,
 *     type:        "BOOKING_CONFIRMED",
 *     title:       "Booking confirmed",
 *     body:        `Your booking for ${card.name} is confirmed.`,
 *     payload: {
 *       screen:     "BookingDetail",
 *       entityId:   booking._id.toString(),
 *       actorId:    req.user._id.toString(),
 *       actorName:  req.user.displayName,
 *       actorImage: req.user.imageUrl ?? "",
 *       extra:      {},
 *     },
 *   });
 */
export async function notify({
  recipientId,
  senderId    = null,
  type,
  title,
  body        = "",
  payload,
}) {
  try {
    // ── Validate ──────────────────────────────────────────────
    if (!recipientId) { console.error("[notify] recipientId is required"); return; }
    if (!type)        { console.error("[notify] type is required");        return; }
    if (!payload?.screen) { console.error("[notify] payload.screen is required"); return; }

    const { screen, entityId = "", actorId = "", actorName = "", actorImage = "", extra = {} } = payload;

    // ── Build FCM data (all strings) ──────────────────────────
    const fcmData = buildFcmData({ type, screen, entityId, actorId, actorName, actorImage, extra });

    // ── FCM push ──────────────────────────────────────────────
    // Fire-and-forget — a failed push must never break the main action
    User.findById(recipientId).select("deviceToken").lean()
      .then((user) => {
        if (!user?.deviceToken) return;
        return admin.messaging().send({
          token:        user.deviceToken,
          notification: { title, body },
          data:         fcmData,
          android: {
            priority:     "high",
            notification: {
              sound:       "default",
              // Required for Flutter firebase_messaging background handler
              clickAction: "FLUTTER_NOTIFICATION_CLICK",
            },
          },
          apns: {
            payload: { aps: { sound: "default", badge: 1 } },
          },
        });
      })
      .catch((err) => console.error("[notify] FCM send error:", err.message));

    // ── In-app notification doc ───────────────────────────────
    // Stored in-band — await so the doc is committed before we return.
    // Caller doesn't need to care — the doc write is fast.
    await NotificationModel.create({
      recipientId,
      senderId: senderId ?? null,
      type,
      title,
      body,
      payload: {
        screen,
        entityId:   String(entityId),
        actorId:    String(actorId),
        actorName:  String(actorName),
        actorImage: String(actorImage),
        extra:      Object.fromEntries(
          Object.entries(extra).map(([k, v]) => [k, String(v)])
        ),
      },
    });

  } catch (err) {
    // Never propagate — a notification failure must not break the caller
    console.error("[notify] Unexpected error:", err.message);
  }
}

/*
 * notifyMany()
 * ──────────────────────────────────────────────────────────────────
 * Send the same notification to multiple specific recipients.
 * e.g. notify all club admins when a join request arrives.
 *
 * EXAMPLE:
 *   await notifyMany({
 *     recipientIds: adminIds,
 *     senderId:     req.user._id,
 *     type:         "CLUB_JOIN_REQUEST",
 *     title:        "New join request",
 *     body:         `${req.user.displayName} wants to join ${club.name}`,
 *     payload: {
 *       screen:     "ClubDetail",
 *       entityId:   club._id.toString(),
 *       actorId:    req.user._id.toString(),
 *       actorName:  req.user.displayName,
 *       actorImage: req.user.imageUrl ?? "",
 *       extra:      {},
 *     },
 *   });
 */
export async function notifyMany({ recipientIds = [], ...rest }) {
  if (!recipientIds.length) return;
  await Promise.allSettled(
    recipientIds.map((recipientId) => notify({ recipientId, ...rest }))
  );
}

/*
 * notifyTopic()
 * ──────────────────────────────────────────────────────────────────
 * Sends FCM to a topic (institution post, event update etc.)
 * Does NOT create individual in-app docs — topic messages are
 * broadcasts, not personal inbox items.
 *
 * EXAMPLE:
 *   await notifyTopic({
 *     topic:   topicFor({ entityType: "institution", entityId: inst._id }),
 *     type:    "INSTITUTION_POST",
 *     title:   `${inst.name} posted an update`,
 *     body:    post.content.slice(0, 100),
 *     payload: {
 *       screen:   "InstitutionDetail",
 *       entityId: inst._id.toString(),
 *       extra:    { postId: post._id.toString() },
 *     },
 *   });
 */
export async function notifyTopic({ topic, type, title, body = "", payload }) {
  try {
    if (!topic)         { console.error("[notifyTopic] topic is required");          return; }
    if (!payload?.screen) { console.error("[notifyTopic] payload.screen is required"); return; }

    const { screen, entityId = "", actorId = "", actorName = "", actorImage = "", extra = {} } = payload;

    await admin.messaging().send({
      topic,
      notification: { title, body },
      data:         buildFcmData({ type, screen, entityId, actorId, actorName, actorImage, extra }),
      android: {
        priority:     "high",
        notification: { sound: "default", clickAction: "FLUTTER_NOTIFICATION_CLICK" },
      },
      apns: {
        payload: { aps: { sound: "default" } },
      },
    });
  } catch (err) {
    console.error("[notifyTopic] Error:", err.message);
  }
}

/*
 * subscribeToTopic()
 * ──────────────────────────────────────────────────────────────────
 * Subscribe a user to an FCM topic AND write to the Subscription
 * registry. MUST be used instead of admin.messaging() directly
 * so recovery always works.
 *
 * USAGE:
 *   import { subscribeToTopic, topicFor } from "../../utils/notify.js";
 *
 *   // Permanent (institution, council, club, city)
 *   await subscribeToTopic({
 *     userId,
 *     entityId:   institutionId,
 *     entityType: "institution",
 *     expiresAt:  null,
 *   });
 *
 *   // Temporary (event, activity)
 *   await subscribeToTopic({
 *     userId,
 *     entityId:   event._id,
 *     entityType: "event",
 *     expiresAt:  event.endDate,   // MongoDB TTL auto-deletes after this
 *   });
 */
export async function subscribeToTopic({ userId, entityId, entityType, expiresAt = null }) {
  const user = await User.findById(userId).select("deviceToken").lean();
  if (!user?.deviceToken) return { subscribed: false, reason: "no_token" };

  const topic = topicFor({ entityType, entityId });

  // Upsert — safe to call multiple times (e.g. rejoin after leave)
  await Subscription.findOneAndUpdate(
    { userId, entityId },
    {
      $set: {
        userId,
        entityId,
        entityType,
        topic,
        deviceToken: user.deviceToken,
        isActive:    true,
        expiresAt:   expiresAt ?? null,
      },
    },
    { upsert: true, new: true }
  );

  await admin.messaging()
    .subscribeToTopic(user.deviceToken, topic)
    .catch((e) => console.error("[subscribeToTopic] FCM error:", e.message));

  return { subscribed: true, topic };
}

/*
 * unsubscribeFromTopic()
 * ──────────────────────────────────────────────────────────────────
 * Unsubscribe a user from an FCM topic AND mark inactive in registry.
 * Doc is kept for audit trail — TTL handles cleanup for temporaries.
 *
 * USAGE:
 *   await unsubscribeFromTopic({ userId, entityId: institutionId });
 */
export async function unsubscribeFromTopic({ userId, entityId }) {
  const [user, sub] = await Promise.all([
    User.findById(userId).select("deviceToken").lean(),
    Subscription.findOne({ userId, entityId }).lean(),
  ]);

  if (!sub) return { unsubscribed: false, reason: "not_subscribed" };

  // Mark inactive — keep doc for audit / recovery trail
  await Subscription.findOneAndUpdate(
    { userId, entityId },
    { $set: { isActive: false, deviceToken: null } }
  );

  if (user?.deviceToken) {
    await admin.messaging()
      .unsubscribeFromTopic(user.deviceToken, sub.topic)
      .catch((e) => console.error("[unsubscribeFromTopic] FCM error:", e.message));
  }

  return { unsubscribed: true, topic: sub.topic };
}