import mongoose from "mongoose";

/*
 * INSTITUTION POST MODEL
 * ──────────────────────────────────────────────────────────────────
 * Posts published by an institution to their followers.
 * FCM delivery via the institution_{id} topic — all subscribers
 * receive a push when a new post is created.
 *
 * DIFFERENCES FROM ClubPost:
 *   - Author is always the institution (founderId), not a club member
 *   - Supports image attachments (institutions share photos, notices)
 *   - No taggedUsers — institution posts are broadcasts, not mentions
 *   - type enum reflects institution use-cases (Notice, Event, Achievement)
 *   - isPinned — institutions can pin one announcement at the top of feed
 */

const InstitutionPostSchema = new mongoose.Schema(
  {
    institutionId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Institution",
      required: true,
      index:    true,
    },

    // The institution founder who published this post
    authorId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
      index:    true,
    },

    title: {
      type:      String,
      trim:      true,
      maxlength: 200,
      default:   "",
    },

    content: {
      type:     String,
      required: true,
      trim:     true,
      maxlength: 3000,
    },

    // Optional image URL (Cloudinary)
    imageUrl: {
      type:    String,
      default: null,
    },

    type: {
      type:  String,
      enum:  ["Announcement", "Notice", "Achievement", "Event", "Update"],
      default: "Announcement",
      index: true,
    },

    // Pinned posts appear at the top of the feed regardless of createdAt.
    // Only one post can be pinned per institution (enforced in controller).
    isPinned: {
      type:    Boolean,
      default: false,
      index:   true,
    },

    isEdited: {
      type:    Boolean,
      default: false,
    },

    // Soft delete — keep for subscribers who haven't loaded feed yet
    isDeleted: {
      type:    Boolean,
      default: false,
      index:   true,
    },
  },
  { timestamps: true }
);

/* ── Indexes ──────────────────────────────────────────────────────*/

// Primary feed query: active posts for institution, pinned first then newest
InstitutionPostSchema.index({ institutionId: 1, isDeleted: 1, isPinned: -1, createdAt: -1 });

// Author's posts (for profile / admin view)
InstitutionPostSchema.index({ authorId: 1, createdAt: -1 });

export const InstitutionPost = mongoose.model("InstitutionPost", InstitutionPostSchema);
export default InstitutionPost;