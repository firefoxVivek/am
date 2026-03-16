import { Router } from "express";
import express from "express";
 
import { verifyJWT } from "../middleware/auth.middleware.js";
import { createOrder, getPayment, getPaymentHistory, handleWebhook, initiateRefund, verifyPayment } from "../controllers/payment.controller.js";

const router = Router();

// ── Webhook (no JWT — Razorpay calls this directly) ───────────────────────────
// Raw body parser needed so we can verify the HMAC signature
// Must be mounted BEFORE express.json() in app.js for this specific route.
// In app.js add:
//   app.use("/api/v1/payments/webhook", express.raw({ type: "application/json" }));
//   Then inside the handler, req.rawBody = req.body.toString()
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req, _res, next) => {
    req.rawBody = req.body.toString();
    req.body    = JSON.parse(req.rawBody);
    next();
  },
  handleWebhook
);

// ── All other routes require JWT ──────────────────────────────────────────────
router.use(verifyJWT);

// POST /api/v1/payments/create-order   → create Razorpay order
// POST /api/v1/payments/verify         → verify after frontend checkout
// GET  /api/v1/payments/history        → paginated payment history
router.post("/create-order", createOrder);
router.post("/verify",       verifyPayment);
router.get( "/history",      getPaymentHistory);

// GET  /api/v1/payments/:paymentId          → single payment detail
// POST /api/v1/payments/:paymentId/refund   → initiate refund
router.get( "/:paymentId",         getPayment);
router.post("/:paymentId/refund",  initiateRefund);

export default router;