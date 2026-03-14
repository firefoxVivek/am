import express from "express";
import {
  registerFcmToken,
  unregisterFcmToken,
  recoverMySubscriptions,
  getMySubscriptions,
  getMyNotifications,
  markOneAsRead,
  markAllAsRead,
  deleteNotification,
} from "../../controllers/notifications/notification.controller.js";
import { verifyJWT } from "../../middleware/auth.middleware.js";

const router = express.Router();
router.use(verifyJWT); // all notification routes require auth

/*
 * Wire in app.js:
 *   import notificationRoutes from "./routes/notifications/notification.routes.js";
 *   app.use("/api/v1/notifications", notificationRoutes);
 */

// ── FCM token lifecycle ──────────────────────────────────────────
// POST   /api/v1/notifications/token   { fcmToken }  → register + auto-recover
// DELETE /api/v1/notifications/token                 → logout cleanup
router.post("/token",   registerFcmToken);
router.delete("/token", unregisterFcmToken);

// ── Manual recovery (debug / Firebase reset) ─────────────────────
// POST /api/v1/notifications/recover
router.post("/recover", recoverMySubscriptions);

// ── Subscription state (for Follow/Unfollow UI) ──────────────────
// GET /api/v1/notifications/subscriptions?entityType=institution
router.get("/subscriptions", getMySubscriptions);

// ── In-app notification inbox ────────────────────────────────────
// IMPORTANT: /read-all MUST be registered before /:notificationId
// so Express doesn't interpret "read-all" as an :id parameter value.
router.get("/",                        getMyNotifications); // P1
router.patch("/read-all",              markAllAsRead);      // P2
router.patch("/:notificationId/read",  markOneAsRead);      // P1
router.delete("/:notificationId",      deleteNotification); // P3

export default router;