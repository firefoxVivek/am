import mongoose from "mongoose";
import { UserProfile } from "../../models/Profile/profile.model.js";
import User            from "../../models/Profile/auth.models.js";
import { Location }    from "../../models/misc/cities.model.js";
import { ClubMembership } from "../../models/connections/userToClub.model.js";
import { ApiError }    from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asynchandler } from "../../utils/asynchandler.js";

/* ---------------------------------------------------------------
   WHITELIST — the only top-level fields a user can write via
   updateMyProfile. Stats, locationId, and system fields are
   intentionally absent — they have dedicated endpoints.
--------------------------------------------------------------- */
const ALLOWED_UPDATE_FIELDS = new Set([
  "name",
  "bio",
  "hobbies",
  "imageUrl",
  "experiences",
  "address",
  "socialLinks",
  "freelancer",
]);

/* ===============================================================
   CREATE PROFILE
   POST /api/v1/profile/
=============================================================== */
export const createUserProfile = asynchandler(async (req, res) => {
  const userId = req.user._id;

  const existing = await UserProfile.findOne({ userId }).lean();
  if (existing) throw new ApiError(409, "Profile already exists for this user");

  const { name, bio, hobbies, imageUrl, experiences, address, socialLinks, freelancer } = req.body;
  if (!name?.trim()) throw new ApiError(400, "Name is required");

  // Pull authoritative username from User — never from req.body
  const authUser = await User.findById(userId).select("username").lean();
  if (!authUser) throw new ApiError(404, "Auth user not found");

  const profile = await UserProfile.create({
    userId,
    username: authUser.username || null,
    name:     name.trim(),
    bio,
    hobbies,
    imageUrl,
    experiences,
    address,
    socialLinks,
    freelancer,
  });

  return res.status(201).json(new ApiResponse(201, profile, "Profile created successfully"));
});

/* ===============================================================
   GET MY PROFILE
   GET /api/v1/profile/me
   Merges auth-layer fields so frontend needs only one call.
=============================================================== */
export const getMyProfile = asynchandler(async (req, res) => {
  const userId = req.user._id;

  const [profile, authUser] = await Promise.all([
    UserProfile.findOne({ userId })
      .populate("locationId", "officeName pincode taluk districtName stateName")
      .lean(),
    User.findById(userId).select("email role status lastLoginAt").lean(),
  ]);

  if (!profile) throw new ApiError(404, "Profile not found. Please create your profile first.");

  return res.status(200).json(
    new ApiResponse(200, {
      ...profile,
      email:       authUser?.email       ?? null,
      role:        authUser?.role        ?? null,
      status:      authUser?.status      ?? null,
      lastLoginAt: authUser?.lastLoginAt ?? null,
    }, "Profile fetched successfully")
  );
});

/* ===============================================================
   UPDATE MY PROFILE
   PATCH /api/v1/profile/me
   Whitelisted fields only — stats and location via dedicated routes.
=============================================================== */
export const updateMyProfile = asynchandler(async (req, res) => {
  const userId  = req.user._id;
  const rawBody = req.body;

  const safeUpdates = {};
  for (const key of Object.keys(rawBody)) {
    if (ALLOWED_UPDATE_FIELDS.has(key)) safeUpdates[key] = rawBody[key];
  }

  if (Object.keys(safeUpdates).length === 0) {
    throw new ApiError(400, "No valid fields provided for update");
  }

  const profile = await UserProfile.findOneAndUpdate(
    { userId },
    { $set: safeUpdates },
    { new: true, runValidators: true }
  );

  if (!profile) throw new ApiError(404, "Profile not found");

  return res.status(200).json(new ApiResponse(200, profile, "Profile updated successfully"));
});

/* ===============================================================
   SET MY CITY
   PATCH /api/v1/profile/me/city
   Accepts a locationId from the Location collection.
   Writes both the top-level locationId (for indexed queries) and
   the inline snapshot (for zero-join display reads) atomically.
   This is the same pattern Institution uses.
=============================================================== */
export const setMyCity = asynchandler(async (req, res) => {
  const userId     = req.user._id;
  const { locationId } = req.body;

  if (!locationId) throw new ApiError(400, "locationId is required");
  if (!mongoose.Types.ObjectId.isValid(locationId)) throw new ApiError(400, "Invalid locationId");

  // Fetch the location doc to build the snapshot
  const loc = await Location.findById(locationId).lean();
  if (!loc) throw new ApiError(404, "Location not found");

  const profile = await UserProfile.findOneAndUpdate(
    { userId },
    {
      $set: {
        // Top-level anchor for indexed discovery queries
        locationId: loc._id,

        // Inline snapshot — zero-join reads on every profile fetch
        location: {
          locationId:   loc._id,
          officeName:   loc.officeName   ?? null,
          pincode:      loc.pincode      ?? null,
          taluk:        loc.taluk        ?? null,
          districtName: loc.districtName ?? null,
          stateName:    loc.stateName    ?? null,
        },
      },
    },
    { new: true, runValidators: true }
  );

  if (!profile) throw new ApiError(404, "Profile not found");

  return res.status(200).json(
    new ApiResponse(200, {
      locationId:  profile.locationId,
      location:    profile.location,
    }, `City set to ${loc.districtName}, ${loc.stateName}`)
  );
});

/* ===============================================================
   CLEAR MY CITY
   DELETE /api/v1/profile/me/city
   Removes location from profile — user appears in no city feed.
=============================================================== */
export const clearMyCity = asynchandler(async (req, res) => {
  const userId = req.user._id;

  const profile = await UserProfile.findOneAndUpdate(
    { userId },
    { $set: { locationId: null, location: null } },
    { new: true }
  );

  if (!profile) throw new ApiError(404, "Profile not found");

  return res.status(200).json(new ApiResponse(200, {}, "City removed from profile"));
});

/* ===============================================================
   UPDATE USERNAME
   PATCH /api/v1/profile/me/username
   Syncs User and UserProfile atomically.
=============================================================== */
export const updateUsername = asynchandler(async (req, res) => {
  const userId = req.user._id;
  const { username } = req.body;

  if (!username?.trim()) throw new ApiError(400, "Username is required");

  const normalized = username.trim().toLowerCase();

  if (!/^[a-z0-9._]{3,30}$/.test(normalized)) {
    throw new ApiError(400, "Username must be 3-30 characters: letters, numbers, dots, underscores only");
  }

  // Check availability
  const taken = await UserProfile.findOne({
    username: normalized,
    userId: { $ne: userId },
  }).lean();
  if (taken) throw new ApiError(409, "Username is already taken");

  // Sync both models atomically
  const [, updatedProfile] = await Promise.all([
    User.findByIdAndUpdate(userId, { $set: { username: normalized } }),
    UserProfile.findOneAndUpdate(
      { userId },
      { $set: { username: normalized } },
      { new: true, runValidators: true }
    ),
  ]);

  if (!updatedProfile) throw new ApiError(404, "Profile not found");

  return res.status(200).json(
    new ApiResponse(200, { username: updatedProfile.username }, "Username updated successfully")
  );
});

/* ===============================================================
   DELETE ACCOUNT (Soft)
   DELETE /api/v1/profile/me
   Blocks the User auth record and nullifies PII on UserProfile.
   Hard deletion is handled by a scheduled cleanup job (future).
=============================================================== */
export const deleteAccount = asynchandler(async (req, res) => {
  const userId = req.user._id;

  await Promise.all([
    // Block auth so login is immediately rejected
    User.findByIdAndUpdate(userId, {
      $set: {
        status:       "blocked",
        refreshToken: null,
        deviceTokens: [],
      },
    }),

    // Nullify PII but keep the document so foreign-key references (posts, events) don't break
    UserProfile.findOneAndUpdate(
      { userId },
      {
        $set: {
          name:        "[Deleted User]",
          bio:         "",
          imageUrl:    null,
          hobbies:     [],
          experiences: [],
          socialLinks: {},
          freelancer:  { isFreelancer: false },
          locationId:  null,
          location:    null,
          address:     "",
        },
      }
    ),
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Account deleted successfully"));
});

/* ===============================================================
   GET USER'S CLUBS
   GET /api/v1/profile/:userId/clubs
   Returns all clubs a user is an active member of.
   Shown on public profile.
=============================================================== */
export const getUserClubs = asynchandler(async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const memberships = await ClubMembership.find({
    userId,
    status: "approved",
  })
    .populate({
      path:   "clubId",
      select: "clubId clubName image about privacy membersCount",
      match:  { status: "active" },
    })
    .sort({ joinedAt: -1 })
    .lean();

  // Filter out nulls (club was deleted after membership was created)
  const clubs = memberships
    .filter((m) => m.clubId !== null)
    .map((m) => ({ ...m.clubId, role: m.role, joinedAt: m.joinedAt }));

  return res
    .status(200)
    .json(new ApiResponse(200, { count: clubs.length, clubs }, "User clubs fetched successfully"));
});