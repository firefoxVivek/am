import express from "express";
import {
  createEvent,
  getEventsByClub,
  getUpcomingClubEvents,
  searchEvents,
  getEventById,
  updateEvent,
  publishEvent,
  deleteEvent,
} from "../../controllers/events/events.controller.js";
import { verifyJWT } from "../../middleware/auth.middleware.js";

const router = express.Router();

/**
 * Base: /api/v1/events
 * Rule: specific static paths MUST come before /:eventId param routes
 */

// ── Public ──────────────────────────────────────────────
router.get("/search",                   searchEvents);           // GET  /events/search?q=
router.get("/club/:clubId",             getEventsByClub);        // GET  /events/club/:clubId
router.get("/club/:clubId/upcoming",    getUpcomingClubEvents);  // GET  /events/club/:clubId/upcoming

// ── Single event (param route — after all static routes) ─
router.get("/:eventId",                 getEventById);           // GET  /events/:eventId

// ── Protected writes ────────────────────────────────────
router.post("/create",                  verifyJWT, createEvent);       // POST   /events/create
router.patch("/:eventId",               verifyJWT, updateEvent);       // PATCH  /events/:eventId
router.patch("/:eventId/publish",       verifyJWT, publishEvent);      // PATCH  /events/:eventId/publish
router.delete("/:eventId",              verifyJWT, deleteEvent);       // DELETE /events/:eventId

export default router;
