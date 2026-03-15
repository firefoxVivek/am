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

// GET  /api/v1/institutions/me
router.get("/me", getMyInstitution);

// GET  /api/v1/institutions/discover?categoryId=&locationId=&page=&limit=
router.get("/discover", getInstitutionsByFilter);

// GET  /api/v1/institutions/shelf?locationId=&limit=6
router.get("/shelf", getInstitutionShelves);

// GET  /api/v1/institutions/search?q=&categoryId=&locationId=
router.get("/search", searchInstitutions);

// POST /api/v1/institutions          → create (RESTful)
// POST /api/v1/institutions/create   → legacy alias (kept so old clients don't break)
router.post("/",       createInstitution);
router.post("/create", createInstitution);

// PATCH /api/v1/institutions/update  → legacy alias (kept so old clients don't break)
// Note: proper PATCH is on /:institutionId below
router.patch("/update", updateInstitution);

// ── Subscribe / Unsubscribe ───────────────────────────────────────────────────

// New RESTful style
router.post(  "/:institutionId/subscribe", subscribeToInstitution);
router.delete("/:institutionId/subscribe", unsubscribeFromInstitution);

// Legacy style (kept so old clients don't break)
router.post("/subscribe/:institutionId",   subscribeToInstitution);
router.post("/unsubscribe/:institutionId", unsubscribeFromInstitution);

// ── Param routes /:institutionId ──────────────────────────────────────────────

// GET   /api/v1/institutions/:institutionId
// PATCH /api/v1/institutions/:institutionId
router.get(  "/:institutionId", getPublicInstitution);
router.patch("/:institutionId", updateInstitution);

// GET /api/v1/institutions/:institutionId/clubs
// GET /api/v1/institutions/:institutionId/councils
router.get("/:institutionId/clubs",    getInstitutionClubs);
router.get("/:institutionId/councils", getInstitutionCouncils);

// ── Institution Posts ─────────────────────────────────────────────────────────

// GET  /api/v1/institutions/:institutionId/posts
// POST /api/v1/institutions/:institutionId/posts
router.get( "/:institutionId/posts", getInstitutionFeed);
router.post("/:institutionId/posts", createInstitutionPost);

// GET    /api/v1/institutions/:institutionId/posts/:postId
// PATCH  /api/v1/institutions/:institutionId/posts/:postId
// DELETE /api/v1/institutions/:institutionId/posts/:postId
router.get(   "/:institutionId/posts/:postId", getInstitutionPost);
router.patch( "/:institutionId/posts/:postId", updateInstitutionPost);
router.delete("/:institutionId/posts/:postId", deleteInstitutionPost);

export default router;