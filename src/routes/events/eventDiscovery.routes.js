import { Router } from "express";
 
 
import { verifyJWT } from "../../middleware/auth.middleware.js";
import { getClubEvents, getDistrictEvents, getOngoingEvents, getPublicEvents } from "../../controllers/events/eventDiscover.controller.js";

const router = Router();

router.use(verifyJWT);

// GET /events/discover/ongoing   — happening right now
// GET /events/discover/district  — upcoming in user's district
// GET /events/discover/clubs     — upcoming from user's member clubs
// GET /events/discover/public    — all upcoming public events

router.get("/ongoing",  getOngoingEvents);
router.get("/district", getDistrictEvents);
router.get("/clubs",    getClubEvents);
router.get("/public",   getPublicEvents);

export default router;