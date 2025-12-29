import express from "express";
import {
  createUserProfile,
  getMyProfile,
  updateMyProfile,
} from "../../controllers/profile/profile.controller.js";
import { verifyJWT } from "../../middleware/auth.middleware.js";

const router = express.Router();

/* ---------------------------------------
   Protected Profile Routes
--------------------------------------- */

router.post("/", verifyJWT, createUserProfile);
router.get("/me", verifyJWT, getMyProfile);
router.patch("/me", verifyJWT, updateMyProfile);

export default router;
