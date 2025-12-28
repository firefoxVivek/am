import express from "express";
import { getPublicUserProfile } from "../../controllers/profile/publicProfile.controller.js";

const router = express.Router();

/* ---------------------------------------
   Public Routes (No Auth)
--------------------------------------- */

router.get("/users/:userId", getPublicUserProfile);

export default router;
