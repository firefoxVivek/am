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

/*
 * Wire in app.js:
 *   import institutionRoutes from "./routes/institution/profile.routes.js";
 *   app.use("/api/v1/institutions", institutionRoutes);
 *
 * ORDERING: fixed paths (/shelf, /search, /discover, /me)
 * MUST come before /:institutionId GET routes.
 */

const router = express.Router();
router.use(verifyJWT);

/* ── Fixed paths ─────────────────────────────────────────────────*/

// GET /api/v1/institutions/shelf?locationId=&limit=6
// The Kindle-style home screen — all genres with institution preview rows
router.get("/profile/shelf",   getInstitutionShelves);

// GET /api/v1/institutions/search?q=&categoryId=&locationId=
router.get("/search",  searchInstitutions);

// GET /api/v1/institutions/discover?categoryId=&locationId=&page=&limit=
router.get("/discover", getInstitutionsByFilter);

// GET  /api/v1/institutions/me
// POST /api/v1/institutions
router.get( "/me", getMyInstitution);
router.post("/",   createInstitution);

/* ── Param routes /:institutionId ────────────────────────────────*/

// GET   /api/v1/institutions/:institutionId
// PATCH /api/v1/institutions/:institutionId
router.get(  "/:institutionId", getPublicInstitution);
router.patch("/:institutionId", updateInstitution);

// POST   /api/v1/institutions/:institutionId/subscribe  → follow
// DELETE /api/v1/institutions/:institutionId/subscribe  → unfollow
router.post(  "/:institutionId/subscribe", subscribeToInstitution);
router.delete("/:institutionId/subscribe", unsubscribeFromInstitution);

// GET /api/v1/institutions/:institutionId/clubs
// GET /api/v1/institutions/:institutionId/councils
router.get("/:institutionId/clubs",    getInstitutionClubs);
router.get("/:institutionId/councils", getInstitutionCouncils);

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