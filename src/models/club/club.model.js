import mongoose from "mongoose";

const ClubSchema = new mongoose.Schema(
  {
 

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      unique: true, // 🔒 one club per user (remove if not needed)
    },
 
//instagramlike_name
    clubId: {
      type: String,
      required: true,
      unique: true,
      index: true,
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

    image: {
      type: String,
      trim: true,
      default: null,
    },

    about: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
 

    categories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
        index: true,
      },
    ],
 

    councilId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Council",
      index: true,
      default: null,
    },

    institutionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Institution",
      index: true,
      default: null,
    },

 

    admins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
    ],

    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
    ],

 

    privacy: {
      type: String,
      enum: ["public", "private", "invite_only"],
      default: "public",
      index: true,
    },

    status: {
      type: String,
      enum: ["active", "suspended", "deleted"],
      default: "active",
      index: true,
    },

 

    membersCount: {
      type: Number,
      default: 0,
      index: true,
    },

    postsCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);
 
ClubSchema.index({
  clubName: "text",
  about: "text",
});
 
ClubSchema.index(
  { clubId: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

// Compound search indexes (🔥 very useful)
ClubSchema.index({ councilId: 1, institutionId: 1 });
ClubSchema.index({ institutionId: 1, categories: 1 });
ClubSchema.index({ councilId: 1, categories: 1 });

export const Club = mongoose.model("Club", ClubSchema);
export default Club;
