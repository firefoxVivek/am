import express from "express";
import { verifyJWT } from "../../middleware/auth.middleware.js";
import {
  getRequestSummary,
  getFriendRequests,
  getClubJoinRequests,
  getPositionInvites,
  getCouncilClubInvites,
} from "../../controllers/request/requestCenter.controller.js";

/*
 * Wire in app.js:
 *   import requestRoutes from "./routes/request/requestCenter.routes.js";
 *   app.use("/api/v1/requests", requestRoutes);
 *
 * ACTIONS (accept/reject) are NOT here — they live in their own modules:
 *
 *   Friend request accept/reject  → PATCH /api/v1/friends/accept/:requestId
 *                                    PATCH /api/v1/friends/reject/:requestId
 *
 *   Club join approve/reject      → POST /api/v1/memberships/request/:membershipId/accept
 *                                    POST /api/v1/memberships/request/:membershipId/reject
 *
 *   Position invite accept/reject → PATCH /api/v1/councils/positions/:positionId/accept
 *                                    PATCH /api/v1/councils/positions/:positionId/reject
 *
 *   Council club invite accept    → POST /api/v1/councils/:councilId/clubs/request
 *   (club side accepts by sending a matching request — cross-detection auto-approves)
 *
 * The Request Center is READ ONLY — it shows what's pending.
 * Actions are performed via the respective module routes.
 * This keeps the API clean and avoids duplication.
 */

const router = express.Router();
router.use(verifyJWT);

// GET /api/v1/requests
// Summary: all pending counts + 3-item preview per type
// Flutter uses this for badge counts and the main Request Center screen
router.get("/", getRequestSummary);

// GET /api/v1/requests/friends?page=&limit=
// All pending friend requests sent to me
router.get("/friends", getFriendRequests);

// GET /api/v1/requests/clubs?page=&limit=
// All pending join requests for clubs I admin
router.get("/clubs", getClubJoinRequests);

// GET /api/v1/requests/positions?page=&limit=
// All pending council position invites sent to me
router.get("/positions", getPositionInvites);

// GET /api/v1/requests/council-clubs?page=&limit=
// All pending council invites for clubs I admin
router.get("/council-clubs", getCouncilClubInvites);

export default router;