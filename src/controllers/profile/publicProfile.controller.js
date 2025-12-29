import { UserProfile } from "../../models/Profile/profile.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asynchandler } from "../../utils/asynchandler.js";
 
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
 
 
export const searchPublicUserProfiles = asynchandler(async (req, res) => {
  const { q = "", page = 1, limit = 10 } = req.query;

  if (!q.trim()) {
    throw new ApiError(400, "Search query is required");
  }

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const pageLimit = Math.min(parseInt(limit, 10), 50);  
  const skip = (pageNumber - 1) * pageLimit;

 
  const searchFilter = {
    name: { $regex: q.trim(), $options: "i" },
  };

  const [profiles, total] = await Promise.all([
    UserProfile.find(searchFilter)
      .select("name  userId imageUrl     createdAt")
      .sort({ name: 1 })
      .skip(skip)
      .limit(pageLimit),
    UserProfile.countDocuments(searchFilter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        results: profiles,
        pagination: {
          total,
          page: pageNumber,
          limit: pageLimit,
          totalPages: Math.ceil(total / pageLimit),
          hasNextPage: skip + profiles.length < total,
        },
      },
      "User profiles fetched successfully"
    )
  );
});
