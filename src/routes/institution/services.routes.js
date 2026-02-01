import express from "express";
import { verifyJWT } from "../../middleware/auth.middleware.js";
import {
  createServiceCard,
  getInstitutionCards,
  updateServiceCard,
  deleteServiceCard
} from "../../controllers/institution/services.controller.js";

const router = express.Router();

// Public Route: Anyone can see the services of a Mall/School
router.get("/institution/:institutionId", getInstitutionCards);

// Protected Routes: Only for the Institution Owner
router.use(verifyJWT); 

router.post("/", createServiceCard);
router.patch("/:id", updateServiceCard);
router.delete("/:id", deleteServiceCard);

export default router;