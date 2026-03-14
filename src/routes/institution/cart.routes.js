import express from "express";
import { verifyJWT } from "../../middleware/auth.middleware.js";
import {
  addToCart,
  getCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  checkout,
} from "../../controllers/institution/cart.controller.js";

/*
 * Wire in app.js:
 *   import cartRoutes from "./routes/institution/cart.routes.js";
 *   app.use("/api/v1/cart", cartRoutes);
 *
 * ORDERING:
 *   /checkout and /items must come before /:itemId on the same method.
 */

const router = express.Router();
router.use(verifyJWT);

/* ── Cart ────────────────────────────────────────────────────────*/

// GET    /api/v1/cart           → view cart (grouped by institution)
// DELETE /api/v1/cart           → clear entire cart
router.get(   "/", getCart);
router.delete("/", clearCart);

/* ── Fixed sub-paths — before /:itemId ───────────────────────────*/

// POST /api/v1/cart/items       → add item
// Must be before DELETE /api/v1/cart/items/:itemId
router.post("/items", addToCart);

// POST /api/v1/cart/checkout    → checkout all items
router.post("/checkout", checkout);

/* ── Item-level operations ───────────────────────────────────────*/

// PATCH  /api/v1/cart/items/:itemId   → update qty / schedule / note
// DELETE /api/v1/cart/items/:itemId   → remove single item
router.patch( "/items/:itemId", updateCartItem);
router.delete("/items/:itemId", removeFromCart);

export default router;