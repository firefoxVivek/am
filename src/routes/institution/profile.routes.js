import express from "express";
import {
  createInstitution,
  getMyInstitution,
  getPublicInstitution,
  getInstitutionsByFilter,
  updateInstitution,
  subscribeToInstitution,
  unsubscribeFromInstitution,
} from "../../controllers/institution/profile.controller.js";
import { verifyJWT } from "../../middleware/auth.middleware.js";

const router = express.Router();

// ── Public (but still requires login for isSubscribed / isOwner context) ──

// GET /api/v1/institution/profile/discover?categoryId=&locationId=&page=&limit=
router.get("/discover", verifyJWT, getInstitutionsByFilter);

// GET /api/v1/institution/profile/:institutionId  — public profile view
router.get("/:institutionId", verifyJWT, getPublicInstitution);

// ── Authenticated owner routes ────────────────────────────────

router.post("/create",    verifyJWT, createInstitution);
router.get("/me",         verifyJWT, getMyInstitution);
router.patch("/update",   verifyJWT, updateInstitution);

// Subscribe / unsubscribe
router.post("/subscribe/:institutionId",   verifyJWT, subscribeToInstitution);
router.post("/unsubscribe/:institutionId", verifyJWT, unsubscribeFromInstitution);

export default router;