 
import { Location } from "../../models/misc/cities.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asynchandler } from "../../utils/asynchandler.js";
 
 
 

/**
 * 🔍 Search by district / city / taluk (text based)
 * Query param: ?q=raebareli
 */
export const searchLocationByText = asynchandler(async (req, res) => {
  const { q } = req.query;

  if (!q) {
    throw new ApiError(400, "Search query is required");
  }

  const locations = await Location.find(
    { $text: { $search: q } },
    { score: { $meta: "textScore" } }
  ).sort({ score: { $meta: "textScore" } });

  return res.status(200).json(
    new ApiResponse(200, locations, "Locations fetched successfully")
  );
});

/**
 * 🔢 Search by pincode
 * Query param: ?pincode=229307
 */
export const searchLocationByPincode = asynchandler(async (req, res) => {
  const { pincode } = req.query;

  if (!pincode) {
    throw new ApiError(400, "Pincode is required");
  }

  const locations = await Location.find({
    pincode: Number(pincode),
  });

  return res.status(200).json(
    new ApiResponse(200, locations, "Locations fetched successfully")
  );
});
