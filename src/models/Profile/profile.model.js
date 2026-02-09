import mongoose from "mongoose";

/* ================= EXPERIENCE ================= */

const ExperienceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    organization: { type: String, trim: true, maxlength: 200 },
    startDate: { type: Date },
    endDate: { type: Date },
    description: { type: String, trim: true, maxlength: 2000 },
  },
  { _id: false }
);

/* ================= LOCATION SNAPSHOT ================= */

const ProfileLocationSchema = new mongoose.Schema(
  {
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: false,
    },
    officeName: { type: String },
    pincode: { type: Number },
    taluk: { type: String },
    districtName: { type: String },
    stateName: { type: String },
  },
  { _id: false }
);

/* ================= USER PROFILE ================= */

const UserProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    username: {
      type: String,
      trim: true,
      maxlength: 50,
      unique: true,
      sparse: true,
      index: true,
    },

    bio: {
      type: String,
      maxlength: 1000,
      default: "",
    },

    hobbies: {
      type: [String],
      default: [],
    },

    imageUrl: {
      type: String,
      default: null,
    },

    experiences: [ExperienceSchema],

    /* ===== NEW LOCATION FIELDS ===== */

    location: {
      type: ProfileLocationSchema,
      default: null,
    },

    address: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },

    userTypeMeta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    /* ---------- Stats ---------- */

    totalFriends: { type: Number, default: 0 },
    totalPosts: { type: Number, default: 0 },
    totalParticipations: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/* ================= INDEXES ================= */

UserProfileSchema.index({ name: "text", username: "text" });

export const UserProfile = mongoose.model("UserProfile", UserProfileSchema);
export default UserProfile;
