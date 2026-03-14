import mongoose from "mongoose";

/*
 * SUBSCRIPTION MODEL
 * ──────────────────────────────────────────────────────────────────
 * Source of truth for every FCM topic subscription in the system.
 * Firebase holds no persistent state — this collection does.
 *
 * ENTITY TYPES & LIFETIMES
 * ────────────────────────
 *  institution  →  expiresAt: null   (permanent, user follows institution)
 *  council      →  expiresAt: null   (permanent, user follows council)
 *  club         →  expiresAt: null   (permanent, user is a member)
 *  city         →  expiresAt: null   (permanent, one at a time, swapped on setMyCity)
 *  event        →  expiresAt: event.endDate   (auto-deleted by TTL after event ends)
 *  activity     →  expiresAt: activity.endDate (auto-deleted by TTL after activity ends)
 *
 * TOPIC NAME CONVENTIONS (never deviate — must match Flutter + recovery code)
 * ──────────────────────────────────────────────────────────────────────────
 *  institution_{objectId}
 *  council_{objectId}
 *  club_{objectId}
 *  city_{locationId}
 *  event_{objectId}
 *  activity_{objectId}
 *
 * RECOVERY FLOW
 * ─────────────
 *  App reinstall / token rotation
 *    → POST /api/v1/notifications/token   { fcmToken }
 *    → registerFcmToken detects token change
 *    → queries all active Subscription docs for this user
 *    → calls Firebase subscribeToTopic for each
 *    → updates deviceToken snapshot on each doc
 *    → Firebase fully restored, zero manual work
 */

const SubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },

    // FCM topic string — built by topicFor() helper in notify.js
    topic: {
      type:     String,
      required: true,
      trim:     true,
    },

    // What kind of entity this subscription is for
    entityType: {
      type:     String,
      required: true,
      enum:     ["institution", "council", "club", "city", "event", "activity"],
    },

    // The MongoDB ObjectId of the followed/joined entity
    entityId: {
      type:     mongoose.Schema.Types.ObjectId,
      required: true,
    },

    // Snapshot of the user's FCM token at subscription time.
    // Nulled on logout. Repopulated on next registerFcmToken call.
    deviceToken: {
      type:    String,
      default: null,
    },

    // false = user has unsubscribed. Doc is kept for audit trail.
    // TTL index handles deletion of expired temporary subscriptions.
    isActive: {
      type:    Boolean,
      default: true,
    },

    /*
     * TEMPORARY SUBSCRIPTIONS ONLY (event, activity)
     * Set to entity.endDate. MongoDB TTL auto-deletes the doc
     * after this date passes — no cron job needed.
     *
     * PERMANENT SUBSCRIPTIONS (institution, council, club, city)
     * Leave as null. The TTL index has a partialFilterExpression
     * that completely ignores docs where expiresAt is null.
     */
    expiresAt: {
      type:    Date,
      default: null,
    },
  },
  { timestamps: true }
);

// ── Indexes ──────────────────────────────────────────────────────

// Unique: one subscription per user per entity
SubscriptionSchema.index({ userId: 1, entityId: 1 }, { unique: true });

// Recovery query: all active subs for a user when token changes
SubscriptionSchema.index({ userId: 1, isActive: 1 });

// Admin / analytics: who is subscribed to an entity
SubscriptionSchema.index({ entityId: 1, isActive: 1 });

// TTL cleanup for event/activity subscriptions.
// partialFilterExpression: docs where expiresAt is null are ignored entirely.
SubscriptionSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { expiresAt: { $type: "date" } },
  }
);

export const Subscription = mongoose.model("Subscription", SubscriptionSchema);
export default Subscription;