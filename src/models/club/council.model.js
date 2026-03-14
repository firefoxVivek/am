import mongoose from "mongoose";

/*
 * COUNCIL MODEL
 * ──────────────────────────────────────────────────────────────────
 * A Council is the governing body that sits above clubs and below
 * an institution. One institution can have multiple councils.
 * One council can govern multiple clubs.
 *
 * HIERARCHY:
 *   Institution → Council → Club
 *
 * FIXES from original file:
 *   - `councilId` was referenced in an index but never defined → added
 *   - `institution.id` ref was pointing to "User" → fixed to "Institution"
 *   - Model was never exported → added export
 *   - Text index used `owner.displayname` (lowercase, wrong field) → fixed
 */

const CouncilSchema = new mongoose.Schema(
  {
    // Human-readable unique slug — used in URLs and FCM topic names
    // e.g. "nss-iit-bombay"
    councilId: {
      type:      String,
      required:  true,
      trim:      true,
      lowercase: true,
      unique:    true,
      index:     true,
    },

    councilName: {
      type:      String,
      required:  true,
      trim:      true,
      maxlength: 120,
    },

    image: {
      type:    String,
      trim:    true,
      default: null,
    },

    about: {
      type:      String,
      trim:      true,
      maxlength: 1500,
      default:   "",
    },

    // Owner = the user who created the council (institution admin)
    owner: {
      id: {
        type:     mongoose.Schema.Types.ObjectId,
        ref:      "User",
        required: true,
        index:    true,
      },
      name: {
        type:     String,
        required: true,
        trim:     true,
      },
    },

    // Parent institution — snapshot + ref
    institution: {
      id: {
        type:     mongoose.Schema.Types.ObjectId,
        ref:      "Institution",   // was "User" in original — fixed
        required: true,
        index:    true,
      },
      name: {
        type:     String,
        required: true,
        trim:     true,
      },
    },

    privacy: {
      type:    String,
      enum:    ["public", "private", "invite_only"],
      default: "public",
      index:   true,
    },

    status: {
      type:    String,
      enum:    ["active", "suspended", "deleted"],
      default: "active",
      index:   true,
    },

    // Cached counters — maintained by hooks on CouncilClubMembership
    clubsCount: {
      type:    Number,
      default: 0,
      min:     0,
    },

    // followersCount maintained by Subscription model (topic followers)
    followersCount: {
      type:    Number,
      default: 0,
      min:     0,
    },
  },
  { timestamps: true }
);

/* ── Indexes ──────────────────────────────────────────────────────*/

// Full-text search
CouncilSchema.index({
  councilName:      "text",
  about:            "text",
  "owner.name":     "text",      // fixed from owner.displayname
  "institution.name": "text",
});

CouncilSchema.index({ "institution.id": 1, privacy: 1 });
CouncilSchema.index({ status: 1, privacy: 1 });

export const Council = mongoose.model("Council", CouncilSchema);
export default Council;