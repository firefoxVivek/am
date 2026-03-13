import express from "express";
import {
  createUserProfile,
  getMyProfile,
  updateMyProfile,
  setMyCity,
  clearMyCity,
  updateUsername,
  deleteAccount,
  getUserClubs,
} from "../../controllers/profile/profile.controller.js";
import { verifyJWT } from "../../middleware/auth.middleware.js";

const router = express.Router();

router.use(verifyJWT);

// Core profile CRUD
router.post("/",    createUserProfile);       // POST   /api/v1/profile/
router.get("/me",   getMyProfile);            // GET    /api/v1/profile/me
router.patch("/me", updateMyProfile);         // PATCH  /api/v1/profile/me
router.delete("/me", deleteAccount);          // DELETE /api/v1/profile/me

// Dedicated sub-resource updates
router.patch("/me/username", updateUsername); // PATCH  /api/v1/profile/me/username
router.patch("/me/city",     setMyCity);      // PATCH  /api/v1/profile/me/city
router.delete("/me/city",    clearMyCity);    // DELETE /api/v1/profile/me/city

// Public info about another user
router.get("/:userId/clubs", getUserClubs);   // GET    /api/v1/profile/:userId/clubs

export default router;