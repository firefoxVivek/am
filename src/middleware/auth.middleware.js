import { ApiError } from "../utils/ApiError.js";
import { asynchandler } from "../utils/asynchandler.js";
import jwt from "jsonwebtoken";

export const verifyJWT = asynchandler(async (req, _, next) => {
  try {
  
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      throw new ApiError(401, "Unauthorized request");
    }

    // Verify JWT signature and expiration
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
 
    // Attach decoded token payload directly to request
    req.user = {
      _id: decodedToken._id,
      email: decodedToken.email,
      username: decodedToken.username,
      displayName: decodedToken.displayName,
      role: decodedToken.role,
      status: decodedToken.status,
      isProfileComplete: decodedToken.isProfileComplete,
    };

    next();
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid or expired access token");
  }
});
