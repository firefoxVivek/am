import express from "express";
import { verifyJWT } from "../../middleware/auth.middleware.js";
import {
  createServiceCard,
  getInstitutionCards,
  getSingleCard,
  updateServiceCard,
  deleteServiceCard,
  addItemToCard,
  updateItem,
  deleteItem,
} from "../../controllers/institution/services.controller.js";

/*
 * Wire in app.js:
 *   import serviceRoutes from "./routes/institution/services.routes.js";
 *   app.use("/api/v1/institutions", serviceRoutes);
 *
 * NOTE: mounted under /api/v1/institutions so URLs nest naturally:
 *   GET  /api/v1/institutions/:institutionId/services
 *   POST /api/v1/institutions/:institutionId/services
 *   etc.
 */

const router = express.Router({ mergeParams: true }); // inherit :institutionId
router.use(verifyJWT);

/* ── Service card CRUD ───────────────────────────────────────────*/

// GET  /api/v1/institutions/:institutionId/services        all cards (public)
// POST /api/v1/institutions/:institutionId/services        create card (owner)
router.get( "/", getInstitutionCards);
router.post("/", createServiceCard);

// GET    /api/v1/institutions/:institutionId/services/:cardId
// PATCH  /api/v1/institutions/:institutionId/services/:cardId
// DELETE /api/v1/institutions/:institutionId/services/:cardId
router.get(   "/:cardId", getSingleCard);
router.patch( "/:cardId", updateServiceCard);
router.delete("/:cardId", deleteServiceCard);

/* ── Item CRUD (rows inside a card) ──────────────────────────────*/

// POST   /api/v1/institutions/:institutionId/services/:cardId/items
// PATCH  /api/v1/institutions/:institutionId/services/:cardId/items/:itemId
// DELETE /api/v1/institutions/:institutionId/services/:cardId/items/:itemId
router.post(  "/:cardId/items",          addItemToCard);
router.patch( "/:cardId/items/:itemId",  updateItem);
router.delete("/:cardId/items/:itemId",  deleteItem);

export default router;