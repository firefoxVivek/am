import { Router } from "express";
import {
  searchLocationByText,
  searchLocationByPincode,
} from "../../controllers/location/location.controller.js";

const router = Router();

/**
 * 🔍 Search by city / district / taluk
 * GET /api/v1/locations/search?q=raebareli
 */
router.get("/search", searchLocationByText);

/**
 * 🔢 Search by pincode
 * GET /api/v1/locations/pincode?pincode=229307
 */
router.get("/pincode", searchLocationByPincode);

export default router;
