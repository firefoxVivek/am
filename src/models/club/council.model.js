import mongoose from "mongoose";

const CouncilSchema = new mongoose.Schema(
  {
    /**
     * 🔐 OWNER (source of truth + snapshot)
     */
    owner: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },
      name: {
        type: String,
        required: true,
        trim: true,
      },
    },


    /**
     * 🏷️ DISPLAY NAME
     */
    councilName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    /**
     * 🖼️ PROFILE IMAGE
     */
    image: {
      type: String,
      trim: true,
      default: null,
    },

    /**
     * 📝 ABOUT / DESCRIPTION
     */
    about: {
      type: String,
      trim: true,
      maxlength: 1500,
      default: "",
    },

    /**
     * 🏫 INSTITUTION (snapshot + ref)
     */
    institution: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },
      name: {
        type: String,
        required: true,
        trim: true,
      },
    },

    /**
     * 🛡️ PRIVACY
     */
    privacy: {
      type: String,
      enum: ["public", "private", "invite_only"],
      default: "public",
      index: true,
    },

    /**
     * ⚙️ STATUS
     */
    status: {
      type: String,
      enum: ["active", "suspended", "deleted"],
      default: "active",
      index: true,
    },

    /**
     * 📊 COUNTERS (cached)
     */
    clubsCount: {
      type: Number,
      default: 0,
      index: true,
    },

    membersCount: {
      type: Number,
      default: 0,
    },

    /**
     * 🔧 SYSTEM METADATA
     */
    createdBySystem: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);
// 🔍 Search & discovery
CouncilSchema.index({
  councilName: "text",
  about: "text",
  "owner.displayname": "text",
  "institution.name": "text",
});

// 🔍 Filtering & browsing
CouncilSchema.index({ "institution.id": 1, privacy: 1 });
CouncilSchema.index({ status: 1, privacy: 1 });

// 🔐 Case-insensitive uniqueness
CouncilSchema.index(
  { councilId: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);
