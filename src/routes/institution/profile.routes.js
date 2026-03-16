import express from "express";
import { verifyJWT } from "../../middleware/auth.middleware.js";
import {
  createInstitution,
  getMyInstitution,
  getPublicInstitution,
  updateInstitution,
  getInstitutionsByFilter,
  getInstitutionShelves,
  searchInstitutions,
  subscribeToInstitution,
  unsubscribeFromInstitution,
  getInstitutionClubs,
  getInstitutionCouncils,
} from "../../controllers/institution/profile.controller.js";
import {
  createInstitutionPost,
  getInstitutionFeed,
  getInstitutionPost,
  updateInstitutionPost,
  deleteInstitutionPost,
} from "../../controllers/institution/institutionPost.controller.js";

const router = express.Router();
router.use(verifyJWT);

// ── Fixed paths (must come before /:institutionId) ────────────────────────────
router.get("/me",       getMyInstitution);
router.get("/discover", getInstitutionsByFilter);
router.get("/shelf",    getInstitutionShelves);
router.get("/search",   searchInstitutions);

// Create — RESTful + legacy alias
router.post("/",       createInstitution);
router.post("/create", createInstitution);

// Update legacy alias (no :id — uses founderId from JWT)
router.patch("/update", updateInstitution);

// ── Subscribe / Unsubscribe ───────────────────────────────────────────────────
// RESTful style
router.post(  "/:institutionId/subscribe", subscribeToInstitution);
router.delete("/:institutionId/subscribe", unsubscribeFromInstitution);

// Legacy style (Flutter currently uses these)
router.post("/subscribe/:institutionId",   subscribeToInstitution);
router.post("/unsubscribe/:institutionId", unsubscribeFromInstitution);

// ── Param routes /:institutionId ──────────────────────────────────────────────
router.get(  "/:institutionId", getPublicInstitution);
router.patch("/:institutionId", updateInstitution);

router.get("/:institutionId/clubs",    getInstitutionClubs);
router.get("/:institutionId/councils", getInstitutionCouncils);

// ── Institution Posts ─────────────────────────────────────────────────────────
router.get( "/:institutionId/posts", getInstitutionFeed);
router.post("/:institutionId/posts", createInstitutionPost);

router.get(   "/:institutionId/posts/:postId", getInstitutionPost);
router.patch( "/:institutionId/posts/:postId", updateInstitutionPost);
router.delete("/:institutionId/posts/:postId", deleteInstitutionPost);

export default router;