import { UserProfile } from "../../models/Profile/profile.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asynchandler } from "../../utils/asynchandler.js";

/* ---------------------------------------
   Get Public User Profile by User ID
--------------------------------------- */
export const getPublicUserProfile = asynchandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    throw new ApiError(400, "User ID is required");
  }

  const profile = await UserProfile.findOne({ userId }).select(
    "name about hobbies imageUrl experiences userTypeMeta createdAt"
  );

  if (!profile) {
    throw new ApiError(404, "Public profile not found");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      profile,
      "Public profile fetched successfully"
    )
  );
});
