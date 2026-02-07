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
          default: null, // allows non-registered names
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
  {
    timestamps: true,
  }
);

/* =========================
   INDEXES
========================== */

// Feed optimization
postSchema.index({ clubId: 1, publishAt: -1 });

// TTL (only docs with expireAt)
postSchema.index(
  { expireAt: 1 },
  { expireAfterSeconds: 0 }
);

export const ClubPost = mongoose.model("ClubPost", postSchema);
