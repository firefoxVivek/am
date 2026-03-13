import mongoose from "mongoose";

const friendshipSchema = new mongoose.Schema(
  {
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "blocked"],
      default: "pending",
    },

    // Who performed the last action (accept / block / reject)
    actionBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

/* ---------------------------------------------------------------
   INDEXES
--------------------------------------------------------------- */

// Uniqueness: A <-> B is the same pair as B <-> A
friendshipSchema.index({ requester: 1, recipient: 1 }, { unique: true });

// Fast lookup of all accepted friendships for a user (used by getMyFriends)
friendshipSchema.index({ requester: 1, status: 1 });
friendshipSchema.index({ recipient: 1, status: 1 });

/* ---------------------------------------------------------------
   HELPERS
   Capture the previous status before any save so post-hooks know
   whether a real state transition happened.
--------------------------------------------------------------- */

friendshipSchema.pre("save", function (next) {
  // Track whether this doc was new and what the old status was
  this._wasNew      = this.isNew;
  this._prevStatus  = this.isNew ? null : this._doc?.status ?? null;
  next();
});

/* ---------------------------------------------------------------
   POST-HOOKS — maintain totalFriends on UserProfile
   Rule: only increment when status transitions TO "accepted",
         only decrement when an "accepted" friendship is deleted.
--------------------------------------------------------------- */

friendshipSchema.post("save", async function (doc) {
  const UserProfile = mongoose.model("UserProfile");

  const justAccepted =
    doc.status === "accepted" &&
    (doc._wasNew || doc._prevStatus !== "accepted");

  if (!justAccepted) return;

  // Atomically increment both sides — min(0) guard via $max
  await Promise.all([
    UserProfile.findOneAndUpdate(
      { userId: doc.requester },
      { $inc: { totalFriends: 1 } }
    ),
    UserProfile.findOneAndUpdate(
      { userId: doc.recipient },
      { $inc: { totalFriends: 1 } }
    ),
  ]).catch((e) => console.error("[Friendship hook] totalFriends inc failed:", e.message));
});

// Called after removeFriend (friendship.deleteOne()) or cancelFriendRequest
// Only decrement if the deleted doc was accepted
friendshipSchema.post("findOneAndDelete", async function (doc) {
  if (!doc || doc.status !== "accepted") return;

  const UserProfile = mongoose.model("UserProfile");

  await Promise.all([
    // $max ensures the field never drops below 0
    UserProfile.findOneAndUpdate(
      { userId: doc.requester, totalFriends: { $gt: 0 } },
      { $inc: { totalFriends: -1 } }
    ),
    UserProfile.findOneAndUpdate(
      { userId: doc.recipient, totalFriends: { $gt: 0 } },
      { $inc: { totalFriends: -1 } }
    ),
  ]).catch((e) => console.error("[Friendship hook] totalFriends dec failed:", e.message));
});

// deleteOne() is used by cancelFriendRequest and rejectFriendRequest
// Mirror the same guard
friendshipSchema.post("deleteOne", { document: true, query: false }, async function (doc) {
  if (!doc || doc.status !== "accepted") return;

  const UserProfile = mongoose.model("UserProfile");

  await Promise.all([
    UserProfile.findOneAndUpdate(
      { userId: doc.requester, totalFriends: { $gt: 0 } },
      { $inc: { totalFriends: -1 } }
    ),
    UserProfile.findOneAndUpdate(
      { userId: doc.recipient, totalFriends: { $gt: 0 } },
      { $inc: { totalFriends: -1 } }
    ),
  ]).catch((e) => console.error("[Friendship hook] totalFriends dec (deleteOne) failed:", e.message));
});

/* ---------------------------------------------------------------
   EXPORT
--------------------------------------------------------------- */

export const Friendship = mongoose.model("Friendship", friendshipSchema);