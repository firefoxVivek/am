import mongoose from "mongoose";

const postSchema = new mongoose.Schema(
  {
    /* =========================
       BASIC POST INFO
    ========================== */
    clubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Club",
      required: true,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    title: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    content: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: ["Announcement", "Update", "Felicitation"],
      required: true,
      index: true,
    },

    /* =========================
       TAGGING (ID + NAME)
    ========================== */
    taggedUsers: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        name: {
          type: String,
          required: true,
          trim: true,
        },
      },
    ],

    /* =========================
       PUBLISHING
    ========================== */
    publishAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    // Auto-expire ONLY when set
    expireAt: {
      type: Date,
      default: null,
    },

    /* =========================
       MODERATION & STATE
    ========================== */
    isEdited: {
      type: Boolean,
      default: false,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

/* =========================
   INDEXES
========================== */

// Feed optimization
postSchema.index({ clubId: 1, publishAt: -1 });

// TTL (only docs with expireAt set)
postSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

/* ---------------------------------------------------------------
   POST-HOOKS — maintain totalPosts on UserProfile
   Only real new posts increment the counter.
   Soft-deleted posts (isDeleted = true) are NOT counted here
   because we track the raw creation count — the UI can filter.
   If you want to decrement on soft-delete, add a pre("save") flag
   and a post("save") check for isDeleted transition.
--------------------------------------------------------------- */

postSchema.pre("save", function (next) {
  this._wasNew = this.isNew;
  next();
});

postSchema.post("save", async function (doc) {
  if (!doc._wasNew) return;

  const UserProfile = mongoose.model("UserProfile");

  await UserProfile.findOneAndUpdate(
    { userId: doc.createdBy },
    { $inc: { totalPosts: 1 } }
  ).catch((e) => console.error("[ClubPost hook] totalPosts inc failed:", e.message));
});

// Hard-delete path — decrement only if the deleted post was not already soft-deleted
// (to avoid double-counting if you later add soft-delete decrement too)
postSchema.post("findOneAndDelete", async function (doc) {
  if (!doc || doc.isDeleted) return; // already handled if soft-delete decrements

  const UserProfile = mongoose.model("UserProfile");

  await UserProfile.findOneAndUpdate(
    { userId: doc.createdBy, totalPosts: { $gt: 0 } },
    { $inc: { totalPosts: -1 } }
  ).catch((e) => console.error("[ClubPost hook] totalPosts dec failed:", e.message));
});

/* ---------------------------------------------------------------
   EXPORT
--------------------------------------------------------------- */

export const ClubPost = mongoose.model("ClubPost", postSchema);