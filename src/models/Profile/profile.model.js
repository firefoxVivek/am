import mongoose from "mongoose";

/* ===============================================================
   SUB-SCHEMAS
=============================================================== */

/* ---------- Experience ---------- */
const ExperienceSchema = new mongoose.Schema(
  {
    title:        { type: String, required: true, trim: true, maxlength: 200 },
    organization: { type: String, trim: true, maxlength: 200 },
    startDate:    { type: Date },
    endDate:      { type: Date },
    description:  { type: String, trim: true, maxlength: 2000 },
  },
  { _id: false }
);

/* ---------- Location Snapshot ---------- */
// Stored inline so reads never need a join.
// locationId is the queryable anchor — used in indexes for city-scoped discovery.
const ProfileLocationSchema = new mongoose.Schema(
  {
    locationId:   { type: mongoose.Schema.Types.ObjectId, ref: "Location", default: null },
    officeName:   { type: String, default: null },
    pincode:      { type: Number, default: null },
    taluk:        { type: String, default: null },
    districtName: { type: String, default: null },
    stateName:    { type: String, default: null },
  },
  { _id: false }
);

/* ---------- Social Links ---------- */
const SocialLinksSchema = new mongoose.Schema(
  {
    instagram: { type: String, trim: true, default: null },
    linkedIn:  { type: String, trim: true, default: null },
    twitter:   { type: String, trim: true, default: null },
    website:   { type: String, trim: true, default: null },
    phone:     { type: String, trim: true, default: null },
  },
  { _id: false }
);

/* ---------- Portfolio Link ---------- */
const PortfolioLinkSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, maxlength: 100 },
    url:   { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
);

/* ---------- Freelancer Profile ---------- */
const FreelancerProfileSchema = new mongoose.Schema(
  {
    isFreelancer:   { type: Boolean, default: false },
    skills:         { type: [String], default: [] },
    serviceTags:    { type: [String], default: [] },
    availability: {
      type: String,
      enum: ["available", "busy", "not_available"],
      default: "not_available",
    },
    hourlyRate:     { type: Number, default: null, min: 0 },
    portfolioLinks: { type: [PortfolioLinkSchema], default: [] },
    tagline:        { type: String, trim: true, maxlength: 150, default: null },
  },
  { _id: false }
);

/* ===============================================================
   MAIN USER PROFILE SCHEMA
=============================================================== */

const UserProfileSchema = new mongoose.Schema(
  {
    /* ------ Identity ------ */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    username: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 50,
      unique: true,
      sparse: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    bio:      { type: String, maxlength: 1000, default: "" },
    imageUrl: { type: String, default: null },

    /* ------ Content ------ */
    hobbies:     { type: [String], default: [] },
    experiences: { type: [ExperienceSchema], default: [] },

    /* ------ Location ------ */
    // Top-level locationId — the queryable anchor for all city-scoped discovery.
    // Powers: freelancers near me, events in my city, clubs in my district.
    // The full snapshot inside location{} is for zero-join display reads.
    locationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      default: null,
      index: true,
    },

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

    /* ------ Social & Freelancer ------ */
    socialLinks: {
      type: SocialLinksSchema,
      default: () => ({}),
    },

    freelancer: {
      type: FreelancerProfileSchema,
      default: () => ({ isFreelancer: false }),
    },

    /* ------ System-managed Stats ------ */
    // Written ONLY by Mongoose post-hooks. No controller may $set these.
    totalFriends:        { type: Number, default: 0, min: 0 },
    totalPosts:          { type: Number, default: 0, min: 0 },
    totalParticipations: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

/* ===============================================================
   INDEXES
=============================================================== */

// Full-text search: name, username, freelancer tags
UserProfileSchema.index({
  name: "text",
  username: "text",
  "freelancer.serviceTags": "text",
});

// City-scoped freelancer discovery
UserProfileSchema.index({
  locationId: 1,
  "freelancer.isFreelancer": 1,
  "freelancer.availability": 1,
});

// District string fallback
UserProfileSchema.index({
  "location.districtName": 1,
  "freelancer.isFreelancer": 1,
});

export const UserProfile = mongoose.model("UserProfile", UserProfileSchema);
export default UserProfile;