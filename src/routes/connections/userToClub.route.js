import express from "express";
import { verifyJWT } from "../../middleware/auth.middleware.js";
import {
  joinClub,
  leaveClub,
  requestToJoinClub,
  acceptJoinRequest,
  rejectJoinRequest,
  promoteToAdmin,
  removeAdmin,
  removeMember,
  getClubMembers,
  getPendingJoinRequests,
  getMyClubs,
  getClubMemberCount,
  getMyRoleInClub,
} from "../../controllers/connections/userToClub.controller.js";

const router = express.Router();

router.use(verifyJWT);

router.post("/:clubId/join", joinClub);
router.post("/:clubId/request", requestToJoinClub);
router.post("/:clubId/leave", leaveClub);

router.post("/request/:membershipId/accept", acceptJoinRequest);
router.post("/request/:membershipId/reject", rejectJoinRequest);

router.post("/member/:membershipId/promote", promoteToAdmin);
router.post("/admin/:membershipId/remove", removeAdmin);
router.post("/member/:membershipId/remove", removeMember);

router.get("/:clubId/members", getClubMembers);

router.get("/:clubId/requests/pending", getPendingJoinRequests);

router.get("/:clubId/members/count", getClubMemberCount);

router.get("/:clubId/my-role", getMyRoleInClub);

router.get("/my/clubs", getMyClubs);

export default router;
