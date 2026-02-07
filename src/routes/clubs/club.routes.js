import express from "express";

import {
  createClub,
  updateClub,
  deleteClub,
  getDeletedClubByUserId,
  checkClubIdAvailability,
  getClubByClubId,
  getClubById,
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
 getMyClubs,
  
  uploadClubImage,
} from "../../controllers/clubs/club.controller.js";

import { verifyJWT } from "../../middleware/auth.middleware.js";
import {
  isClubAdmin,
  
} from "../../middleware/clubs/club.middleware.js";

const router = express.Router();

router.post("/", verifyJWT, createClub);

router.patch("/:clubId", verifyJWT, isClubAdmin, updateClub);

router.delete("/:clubId", verifyJWT, deleteClub);

router.get("/check/:clubId", checkClubIdAvailability);

router.get("/search", searchClubs);

router.get("/:clubId", getClubByClubId);


router.get("/id/:Id", getClubById);

router.get("/user/myclub", verifyJWT, getClubByUserId);

 

router.get("/admin/user/:userId/history", getDeletedClubByUserId);

router.get("/", getAllClubs);

router.get("/category/:categoryId", getClubsByCategory);

router.get("/council/:councilId", getClubsByCouncil);

router.get("/institution/:institutionId", getClubsByInstitution);

router.get("/discover", discoverClubs);

router.patch("/:clubId/privacy", verifyJWT, isClubAdmin, changeClubPrivacy);

router.get("/:clubId/stats", verifyJWT, getClubStats);

router.get("/my/clubs", verifyJWT, getMyClubs);

router.post("/:clubId/image", verifyJWT, isClubAdmin, uploadClubImage);

export default router;
