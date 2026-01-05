import mongoose from "mongoose";

const ClubSchema = new mongoose.Schema(
  {
    owner: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        // unique: true is handled by the explicit index at the bottom
      },
      displayName: {
        type: String,
        required: true,
        trim: true,
      },
    },

    clubId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9._]+$/,
    },

    clubName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    image: { type: String, trim: true, default: null },
    about: { type: String, trim: true, maxlength: 1000, default: "" },

    council: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "Council", default: null },
      name: { type: String, trim: true, default: null },
    },

    institution: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "Institution", default: null },
      name: { type: String, trim: true, default: null },
    },

    privacy: {
      type: String,
      enum: ["public", "private", "invite_only"],
      default: "public",
    },

    status: {
      type: String,
      enum: ["active", "suspended", "deleted"],
      default: "active",
    },

    membersCount: { type: Number, default: 0 },
    postsCount: { type: Number, default: 0 },
    createdBySystem: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/* -------------------------------------------------------------------------- */
/* INDEXES                                   */
/* -------------------------------------------------------------------------- */

// ⚡ 1. DIRECT OWNER INDEX (For instant lookup via JWT)
// This ensures "owner.id" is indexed directly at the top level
ClubSchema.index({ "owner.id": 1 }, { unique: true });

// 🔐 2. Case-insensitive uniqueness for clubId
ClubSchema.index(
  { clubId: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

// 🔍 3. Text search
ClubSchema.index({
  clubName: "text",
  about: "text",
  "owner.displayName": "text",
  "institution.name": "text",
  "council.name": "text",
});

// 📊 4. Compound filters for performance
ClubSchema.index({ status: 1, privacy: 1 });
ClubSchema.index({ "council.id": 1, "institution.id": 1 });
ClubSchema.index({ "institution.id": 1, status: 1 });

export const Club = mongoose.model("Club", ClubSchema);

// Sync indexes to clear old ghost indexes
Club.syncIndexes().catch((err) => console.error("Index Sync Error:", err));

export default Club;