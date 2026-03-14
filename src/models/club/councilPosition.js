import mongoose from "mongoose";

/*
 * COUNCIL POSITION MODEL
 * ──────────────────────────────────────────────────────────────────
 * Named positions within a council held by individual users.
 * e.g. President, Vice President, Secretary, Treasurer, Cultural Head
 *
 * FLOW:
 *   1. Council owner defines a position (title, description)
 *   2. Council owner invites a specific user to fill it
 *      → status: "invited", user gets COUNCIL_POSITION_INVITE notification
 *   3. User accepts or rejects
 *      → "active" or "rejected"
 *   4. Council owner can also revoke at any time → "revoked"
 *   5. User can resign → "resigned"
 *
 * DESIGN DECISIONS:
 *   - A position can only have ONE active holder at a time
 *     (enforced by partial unique index on councilId+title+status:"active")
 *   - Multiple invites for the same position are allowed as long as
 *     none are currently active (so you can re-invite after rejection)
 *   - userId is nullable until a user accepts (invite sent, not yet accepted)
 *     Actually: userId is set at invite time — the position is reserved for them.
 *     If rejected, a new invite can be sent to someone else.
 */

const CouncilPositionSchema = new mongoose.Schema(
  {
    councilId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Council",
      required: true,
      index:    true,
    },

    // Position title — free text, council defines their own hierarchy
    // e.g. "President", "NSS Secretary", "Cultural Head"
    title: {
      type:      String,
      required:  true,
      trim:      true,
      maxlength: 100,
    },

    description: {
      type:      String,
      trim:      true,
      maxlength: 500,
      default:   "",
    },

    // The user invited/holding this position
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
      index:    true,
    },

    // Snapshot of user's name at time of invite — survives profile edits
    userName: {
      type:    String,
      trim:    true,
      default: "",
    },

    userImage: {
      type:    String,
      default: null,
    },

    // Who sent the invite
    invitedBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },

    status: {
      type:  String,
      enum:  ["invited", "active", "rejected", "revoked", "resigned"],
      default: "invited",
      index: true,
    },

    // Optional message from council when inviting
    inviteMessage: {
      type:    String,
      trim:    true,
      maxlength: 300,
      default: "",
    },

    // Optional reason when revoking
    revokeReason: {
      type:    String,
      trim:    true,
      maxlength: 300,
      default: "",
    },

    acceptedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    revokedAt:  { type: Date, default: null },
    resignedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/* ── Indexes ──────────────────────────────────────────────────────*/

// One active holder per position title per council
CouncilPositionSchema.index(
  { councilId: 1, title: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
  }
);

// Fetch all positions for a council (public view)
CouncilPositionSchema.index({ councilId: 1, status: 1 });

// Fetch all positions a user holds or was invited to (user's request center)
CouncilPositionSchema.index({ userId: 1, status: 1 });

export const CouncilPosition = mongoose.model("CouncilPosition", CouncilPositionSchema);
export default CouncilPosition;