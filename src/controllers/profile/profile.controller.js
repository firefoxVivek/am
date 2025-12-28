import { UserProfile } from "../../models/Profile/profile.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asynchandler } from "../../utils/asynchandler.js";

/* ---------------------------------------
   Create Profile
--------------------------------------- */
export const createUserProfile = asynchandler(async (req, res) => {
  const userId = req.user._id;
  const { name, about, hobbies, imageUrl, experiences, userTypeMeta } =
    req.body;

  if (!name) {
    throw new ApiError(400, "Name is required");
  }

  const existingProfile = await UserProfile.findOne({ userId });
  if (existingProfile) {
    throw new ApiError(409, "Profile already exists");
  }

  const profile = await UserProfile.create({
    userId,
    name,
    about,
    hobbies,
    imageUrl,
    experiences,
    userTypeMeta,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, profile, "Profile created successfully"));
});

/* ---------------------------------------
   Get My Profile
--------------------------------------- */
export const getMyProfile = asynchandler(async (req, res) => {
  const profile = await UserProfile.findOne({ userId: req.user._id });

  if (!profile) {
    throw new ApiError(404, "Profile not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, profile, "Profile fetched successfully"));
});

/* ---------------------------------------
   Update My Profile
--------------------------------------- */
export const updateMyProfile = asynchandler(async (req, res) => {
  const updates = req.body;

  const profile = await UserProfile.findOneAndUpdate(
    { userId: req.user._id },
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!profile) {
    throw new ApiError(404, "Profile not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, profile, "Profile updated successfully"));
});
