import mongoose from "mongoose";

/*
 * NOTIFICATION MODEL
 * ──────────────────────────────────────────────────────────────────
 * Stores in-app notification records. One document per notification.
 *
 * TWO DELIVERY LAYERS — same payload, different transport:
 *
 *  FCM push     → pings the device while app is background/killed.
 *                  Flutter reads RemoteMessage.data for routing.
 *
 *  In-app doc   → this model. Flutter reads on bell tap / app open.
 *                  Shape is identical to FCM data payload.
 *
 * FLUTTER ROUTING CONTRACT
 * ────────────────────────
 * Every notification has a `payload` object. Flutter uses it like this:
 *
 *   // works for both FCM RemoteMessage.data and API response
 *   final screen   = notification['payload']['screen'];
 *   final entityId = notification['payload']['entityId'];
 *   final extra    = notification['payload']['extra'];   // Map<String,String>
 *
 *   context.pushNamed(
 *     screen,
 *     pathParameters: { 'id': entityId },
 *     extra: extra,
 *   );
 *
 * SCREEN REGISTRY  (keep in sync with Flutter GoRouter route names)
 * ─────────────────────────────────────────────────────────────────
 *  Screen name           entityId field       extra keys
 *  ──────────────────    ──────────────────   ────────────────────
 *  FriendRequests        friendRequestId      —
 *  UserProfile           userId               —
 *  ClubDetail            clubId               —
 *  EventDetail           eventId              —
 *  ActivityDetail        activityId           eventId
 *  BookingDetail         bookingId            —
 *  InstitutionDetail     institutionId        —
 *  CouncilDetail         councilId            —
 *  CouncilPositions      councilId            positionId
 *  PostDetail            postId               clubId
 *  FreelancerProfile     userId               —
 *  SponsorshipDetail     sponsorshipId        —
 *  Notifications         —                    — (fallback)
 *
 * ACTOR FIELDS
 * ────────────
 * actorId, actorName, actorImage — the user who triggered the action.
 * Flutter uses these to show the sender avatar in the notification row
 * without a separate profile fetch.
 */

// ── Payload sub-schema ───────────────────────────────────────────
// All fields are strings — FCM data payload only supports string values.
// Using the same types here keeps FCM and in-app payloads identical.
const PayloadSchema = new mongoose.Schema(
  {
    // Flutter GoRouter route name — must match exactly
    screen: {
      type:     String,
      required: true,
      enum: [
        "FriendRequests",
        "UserProfile",
        "ClubDetail",
        "EventDetail",
        "ActivityDetail",
        "BookingDetail",
        "InstitutionDetail",
        "CouncilDetail",
        "CouncilPositions",
        "PostDetail",
        "FreelancerProfile",
        "SponsorshipDetail",
        "Notifications",
      ],
    },

    // Primary ID the screen needs to load its data.
    // Always stored as a string (ObjectId.toString()).
    entityId: {
      type:    String,
      default: "",
    },

    // Who triggered the action — for avatar display in notification row.
    // Always strings so FCM data payload can carry them directly.
    actorId: {
      type:    String,
      default: "",
    },
    actorName: {
      type:    String,
      default: "",
    },
    actorImage: {
      type:    String,
      default: "",
    },

    // Secondary IDs the screen also needs (e.g. eventId for ActivityDetail).
    // Flat Map<String, String> — Flutter iterates this directly.
    extra: {
      type:    Map,
      of:      String,
      default: {},
    },
  },
  { _id: false }
);

// ── Main notification schema ─────────────────────────────────────
const NotificationSchema = new mongoose.Schema(
  {
    // Who receives this notification
    recipientId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },

    // Who triggered it — null for system notifications
    senderId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
    },

    // Drives icon + badge colour on Flutter side.
    // Booking types split out so Flutter can show correct status colour.
    type: {
      type:     String,
      required: true,
      enum: [
        // Friends
        "FRIEND_REQUEST",
        "FRIEND_REQUEST_ACCEPTED",
        "FRIEND_REQUEST_REJECTED",
        // Clubs
        "CLUB_JOIN_REQUEST",
        "CLUB_JOIN_ACCEPTED",
        "CLUB_JOIN_REJECTED",
        "CLUB_PROMOTED_TO_ADMIN",
        "CLUB_REMOVED",
        // Events
        "EVENT_PUBLISHED",
        "EVENT_UPDATED",
        "EVENT_CANCELLED",
        // Activities
        "ACTIVITY_UPDATED",
        "ACTIVITY_CANCELLED",
        // Participation
        "PARTICIPATION_CONFIRMED",
        // Bookings — split so Flutter can show correct status colour
        "NEW_BOOKING",
        "BOOKING_CONFIRMED",
        "BOOKING_REJECTED",
        "BOOKING_COMPLETED",
        "BOOKING_CANCELLED",
        // Institutions
        "INSTITUTION_POST",
        // Councils
        "COUNCIL_POSITION_INVITE",
        "COUNCIL_POSITION_ACCEPTED",
        "COUNCIL_POSITION_REJECTED",
        "COUNCIL_CLUB_REQUEST",
        "COUNCIL_CLUB_ACCEPTED",
        "COUNCIL_CLUB_REJECTED",
        // Freelancer
        "FREELANCE_WORK_REQUEST",
        "FREELANCE_REQUEST_ACCEPTED",
        "FREELANCE_REQUEST_REJECTED",
        // Sponsorship
        "SPONSORSHIP_REQUEST",
        "SPONSORSHIP_OFFER",
        "SPONSORSHIP_ACCEPTED",
        "SPONSORSHIP_REJECTED",
        // Posts
        "POST_LIKE",
        "POST_TAGGED",
        // System
        "SYSTEM",
      ],
    },

    // Display strings shown in notification bell UI
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body:  { type: String, default: "",    trim: true, maxlength: 500 },

    // Flutter deep-link payload — identical structure in FCM data and here
    payload: {
      type:     PayloadSchema,
      required: true,
    },

    isRead: { type: Boolean, default: false },
    readAt: { type: Date,    default: null  },
  },
  { timestamps: true }
);

// ── Indexes ──────────────────────────────────────────────────────

// Primary inbox: all notifications for a user, newest first
NotificationSchema.index({ recipientId: 1, createdAt: -1 });

// Unread badge count
NotificationSchema.index({ recipientId: 1, isRead: 1 });

// Auto-delete after 90 days
NotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
);

const NotificationModel = mongoose.model("Notification", NotificationSchema);
export default NotificationModel;