import express from "express";
 
import {
  createClub,
  updateClub,
  deleteClub,getDeletedClubByUserId,
  checkClubIdAvailability,

  getClubByClubId,getClubById,
  getClubByUserId,
  getAllClubs,
  getClubsByCategory,
  getClubsByCouncil,
  getClubsByInstitution,
  searchClubs,
  discoverClubs,

  joinClub,
  leaveClub,
//   requestToJoinClub,
//   acceptJoinRequest,
//   rejectJoinRequest,

  promoteToAdmin,
  removeAdmin,
  removeMember,

  changeClubPrivacy,
//   changeClubStatus,

  getClubStats,
//   getInstitutionClubStats,

  getMyClub,
  getMyJoinedClubs,
  getMyAdminClubs,

  uploadClubImage,
} from "../../controllers/clubs/club.controller.js";

 
import { verifyJWT } from "../../middleware/auth.middleware.js";
import { isClubAdmin, isClubOwner } from "../../middleware/clubs/club.middleware.js";

const router = express.Router();

/* ===============================
   CREATE & MANAGEMENT
================================ */

// Create club
router.post("/", verifyJWT, createClub);

// Update club
router.patch("/:clubId", verifyJWT, isClubAdmin, updateClub);

// Delete club (soft delete)
router.delete("/:clubId", verifyJWT, deleteClub);

// Check clubId availability
router.get("/check/:clubId", checkClubIdAvailability);

/* ===============================
   FETCH & DISCOVERY
================================ */
router.get("/search",  searchClubs);

// Get club by clubId (public)
router.get("/:clubId", getClubByClubId);
router.get("/:clubId", getClubById);

// Get club by owner (user)
router.get("/user/:userId", getClubByUserId);
// Public route (used by the main app)
router.get('/user/:userId', getClubByUserId);

// Admin/History route (used for recovery or support)
router.get('/admin/user/:userId/history', getDeletedClubByUserId);
// Get all public clubs (paginated)
router.get("/", getAllClubs);

// Get clubs by category
router.get("/category/:categoryId", getClubsByCategory);

// Get clubs by council
router.get("/council/:councilId", getClubsByCouncil);

// Get clubs by institution
router.get("/institution/:institutionId", getClubsByInstitution);

// Text search

// Discover (combined filters)
router.get("/discover", discoverClubs);

/* ===============================
   MEMBERSHIP
================================ */

// Join club
router.post("/:clubId/join", verifyJWT, joinClub);

// Leave club
router.post("/:clubId/leave", verifyJWT, leaveClub);

// Request to join (private clubs)
// router.post("/:clubId/request", verifyJWT, requestToJoinClub);

// Accept join request
// router.post(
//   "/:clubId/request/:userId/accept",
//   verifyJWT,
//   isClubAdmin,
//   acceptJoinRequest
// );

// Reject join request
// router.post(
//   "/:clubId/request/:userId/reject",
//   verifyJWT,
//   isClubAdmin,
//   rejectJoinRequest
// );

/* ===============================
   ADMIN & ROLES
================================ */

// Promote member to admin
router.post(
  "/:clubId/admins/:userId",
  verifyJWT,
  isClubOwner,
  promoteToAdmin
);

// Remove admin
router.delete(
  "/:clubId/admins/:userId",
  verifyJWT,
  isClubOwner,
  removeAdmin
);

// Remove member
router.delete(
  "/:clubId/members/:userId",
  verifyJWT,
  isClubAdmin,
  removeMember
);

/* ===============================
   PRIVACY & MODERATION
================================ */

// Change privacy
router.patch(
  "/:clubId/privacy",
  verifyJWT,
  isClubAdmin,
  changeClubPrivacy
);

// Suspend / Activate club
// router.patch(
//   "/:clubId/status",
//   verifyJWT,
//   isSuperAdmin,
//   changeClubStatus
// );

/* ===============================
   STATS & ANALYTICS
================================ */

// Club stats
router.get("/:clubId/stats", verifyJWT, isClubAdmin, getClubStats);

// Institution-level club stats
// router.get(
//   "/institution/:institutionId/stats",
//   verifyJWT,
//   isSuperAdmin,
//   getInstitutionClubStats
// );

/* ===============================
   USER-CENTRIC ROUTES
================================ */

// My club
router.get("/me", verifyJWT, getMyClub);

// Clubs I joined
router.get("/me/joined", verifyJWT, getMyJoinedClubs);

// Clubs I admin
router.get("/me/admin", verifyJWT, getMyAdminClubs);

/* ===============================
   MEDIA
================================ */

// Upload club image
router.post(
  "/:clubId/image",
  verifyJWT,
  isClubAdmin,
  uploadClubImage
);

export default router;
