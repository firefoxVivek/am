import express from "express";
import {
  getPublicUserProfile,
  searchPublicUserProfiles,
} from "../../controllers/profile/publicProfile.controller.js";
import { verifyJWT } from "../../middleware/auth.middleware.js";

const router = express.Router();

// View someone’s public profile (viewer must be logged in)
router.get("/users/:userId", verifyJWT, getPublicUserProfile);

// Search users (viewer context needed)
router.get("/search", verifyJWT, searchPublicUserProfiles);

export default router;
