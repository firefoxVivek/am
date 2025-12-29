import express from "express";
import { getPublicUserProfile,  searchPublicUserProfiles } from "../../controllers/profile/publicProfile.controller.js";

const router = express.Router();
 

router.get("/users/:userId", getPublicUserProfile);
router.get("/search", searchPublicUserProfiles);

export default router;
