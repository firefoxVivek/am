import express from "express";
import {
  createInstitution,
  updateInstitution,
  getMyInstitution,
  getInstitutionsByFilter,
} from "../../controllers/institution/profile.controller.js";
import { verifyJWT } from "../../middleware/auth.middleware.js";

const router = express.Router();

router.post("/create", verifyJWT, createInstitution);

router.get("/me", verifyJWT, getMyInstitution);
router.get("/discover", verifyJWT, getInstitutionsByFilter);
router.patch("/update", verifyJWT, updateInstitution);

export default router;
