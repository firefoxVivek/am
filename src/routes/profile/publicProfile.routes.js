import express from "express";
import {
  getPublicUserProfile,
  searchPublicUserProfiles,
  browseFreelancers,
  getFreelancerProfile,
  registerAsFreelancer,
  updateFreelancerProfile,
  optOutFreelancer,
} from "../../controllers/profile/publicProfile.controller.js";
import { verifyJWT } from "../../middleware/auth.middleware.js";

// ── Public profile routes (/api/v1/profile/public) ──────────────
const profileRouter = express.Router();
profileRouter.use(verifyJWT);

// GET /api/v1/profile/public/users/:userId
profileRouter.get("/users/:userId", getPublicUserProfile);

// GET /api/v1/profile/public/search?q=&page=&limit=&locationId=&freelancerOnly=true
profileRouter.get("/search", searchPublicUserProfiles);

export const publicProfileRouter = profileRouter;

// ── Freelancer routes (/api/v1/freelancers) ──────────────────────
const freelancerRouter = express.Router();
freelancerRouter.use(verifyJWT);

// Discovery
// GET /api/v1/freelancers?locationId=&availability=&page=&limit=
freelancerRouter.get("/",                    browseFreelancers);

// GET /api/v1/freelancers/search  →  reuse the same search endpoint with freelancerOnly=true
// Frontend passes ?freelancerOnly=true&q=  to /profile/public/search
// No separate route needed — one implementation, no duplication.

// GET /api/v1/freelancers/:userId
freelancerRouter.get("/:userId",             getFreelancerProfile);

// Freelancer self-management
freelancerRouter.post("/register",           registerAsFreelancer);
freelancerRouter.patch("/profile",           updateFreelancerProfile);
freelancerRouter.delete("/profile",          optOutFreelancer);

export const freelancerRoutes = freelancerRouter;