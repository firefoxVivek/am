import express from "express";
import { verifyJWT } from "../../middleware/auth.middleware.js";

import {
  createCouncil,
  getMyCouncils,
  getCouncilById,
  getCouncilsByInstitution,
  searchCouncils,
  updateCouncil,
  deleteCouncil,
  followCouncil,
  unfollowCouncil,
} from "../../controllers/clubs/council.controller.js";

import {
  inviteClubToCouncil,
  requestToJoinCouncil,
  approveClubRequest,
  rejectClubRequest,
  removeClubFromCouncil,
  leaveCouncil,
  getCouncilClubs,
  getPendingClubRequests,
} from "../../controllers/clubs/councilClub.controller.js";

import {
  createPositionAndInvite,
  getCouncilPositions,
  getMyPositionInvites,
  acceptPositionInvite,
  rejectPositionInvite,
  revokePosition,
  resignFromPosition,
} from "../../controllers/clubs/councilPositions.controller.js";

/*
 * Wire in app.js:
 *   import councilRoutes from "./routes/council/council.routes.js";
 *   app.use("/api/v1/councils", councilRoutes);
 *
 * ORDERING RULE (Express matches routes top-to-bottom):
 *   All fixed-path routes (/search, /mine, /positions/...) MUST be
 *   registered before any parameterised routes (/:councilId) that
 *   share the same HTTP method, or Express will swallow them.
 */

const router = express.Router();

/* ================================================================
   FIXED PATHS — PUBLIC  (no auth, no params)
   Must come before /:councilId on the same method.
================================================================ */

// GET /api/v1/councils/search?q=&page=&limit=
router.get("/search", searchCouncils);

// GET /api/v1/councils/institution/:institutionId
router.get("/institution/:institutionId", getCouncilsByInstitution);

/* ================================================================
   FIXED PATHS — AUTHENTICATED  (no /:councilId conflict)
   Registered before router.use(verifyJWT) would work too, but
   placing them here with explicit verifyJWT is cleaner and safer.
================================================================ */

// GET  /api/v1/councils/mine
// These share GET method with /:councilId — MUST be above it.
router.get("/mine", verifyJWT, getMyCouncils);

// Position invite actions — the invitee side.
// These are /positions/... — MUST be before /:councilId PATCH routes.
router.get(  "/positions/my-invites",             verifyJWT, getMyPositionInvites);
router.patch("/positions/:positionId/accept",     verifyJWT, acceptPositionInvite);
router.patch("/positions/:positionId/reject",     verifyJWT, rejectPositionInvite);
router.patch("/positions/:positionId/resign",     verifyJWT, resignFromPosition);

/* ================================================================
   PARAM ROUTES — PUBLIC
   /:councilId catch-all GET — must come after all fixed GETs above.
================================================================ */

// GET /api/v1/councils/:councilId    (accepts MongoDB _id or slug)
router.get("/:councilId", verifyJWT, getCouncilById);

/* ================================================================
   ALL REMAINING ROUTES REQUIRE AUTH
================================================================ */
router.use(verifyJWT);

/* ── Council CRUD ────────────────────────────────────────────────*/

// POST   /api/v1/councils
router.post("/", createCouncil);

// PATCH  /api/v1/councils/:councilId
// DELETE /api/v1/councils/:councilId
router.patch("/:councilId",  updateCouncil);
router.delete("/:councilId", deleteCouncil);

/* ── Follow / Unfollow ───────────────────────────────────────────*/

// POST   /api/v1/councils/:councilId/follow
// DELETE /api/v1/councils/:councilId/follow
router.post("/:councilId/follow",   followCouncil);
router.delete("/:councilId/follow", unfollowCouncil);

/* ── Positions (council-scoped) ──────────────────────────────────*/
// These are nested under /:councilId so no ordering conflict with
// the /positions/... routes above.

// GET  /api/v1/councils/:councilId/positions?status=active
// POST /api/v1/councils/:councilId/positions
router.get( "/:councilId/positions", getCouncilPositions);
router.post("/:councilId/positions", createPositionAndInvite);

// PATCH /api/v1/councils/:councilId/positions/:positionId/revoke
router.patch("/:councilId/positions/:positionId/revoke", revokePosition);

/* ── Council ↔ Club Membership ───────────────────────────────────*/

// Specific sub-paths first, then the broader ones.

// GET  /api/v1/councils/:councilId/clubs/pending  (owner only)
// GET  /api/v1/councils/:councilId/clubs          (public — after /pending)
router.get("/:councilId/clubs/pending", getPendingClubRequests);
router.get("/:councilId/clubs",         getCouncilClubs);

// POST /api/v1/councils/:councilId/clubs/invite   council invites a club
// POST /api/v1/councils/:councilId/clubs/request  club requests to join
router.post("/:councilId/clubs/invite",   inviteClubToCouncil);
router.post("/:councilId/clubs/request",  requestToJoinCouncil);

// PATCH  /api/v1/councils/:councilId/clubs/:membershipId/approve
// PATCH  /api/v1/councils/:councilId/clubs/:membershipId/reject
router.patch("/:councilId/clubs/:membershipId/approve", approveClubRequest);
router.patch("/:councilId/clubs/:membershipId/reject",  rejectClubRequest);

// DELETE /api/v1/councils/:councilId/clubs/:clubId/leave  (club leaves)
// DELETE /api/v1/councils/:councilId/clubs/:clubId        (council removes)
// /leave must be before /:clubId or Express matches /:clubId first
router.delete("/:councilId/clubs/:clubId/leave", leaveCouncil);
router.delete("/:councilId/clubs/:clubId",       removeClubFromCouncil);

export default router;