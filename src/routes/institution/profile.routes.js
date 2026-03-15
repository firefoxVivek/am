import express from "express";
import {
  createInstitution,
  getMyInstitution,
  getPublicInstitution,
  getInstitutionsByFilter,
  getInstitutionShelves,
  getInstitutionCouncils,
  updateInstitution,
  subscribeToInstitution,
  unsubscribeFromInstitution,
} from "../../controllers/institution/profile.controller.js";
import { verifyJWT } from "../../middleware/auth.middleware.js";

const router = express.Router();

// Fixed paths BEFORE /:institutionId
router.get("/me",       verifyJWT, getMyInstitution);
router.get("/discover", verifyJWT, getInstitutionsByFilter);
router.get("/shelf",    verifyJWT, getInstitutionShelves);

// ── Param routes ──────────────────────────────────────────────
router.get("/:institutionId",          verifyJWT, getPublicInstitution);
router.get("/:institutionId/councils", verifyJWT, getInstitutionCouncils);
router.post("/create",    verifyJWT, createInstitution);
router.patch("/update",   verifyJWT, updateInstitution);

router.post("/subscribe/:institutionId",   verifyJWT, subscribeToInstitution);
router.post("/unsubscribe/:institutionId", verifyJWT, unsubscribeFromInstitution);

export default router;