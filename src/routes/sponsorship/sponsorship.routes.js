import { Router } from "express";
 
import {
  // Requests
  createSponsorshipRequest,
  listSponsorshipRequests,
  getSponsorshipRequest,
  updateSponsorshipRequest,
  // Offers
  createSponsorshipOffer,
  listSponsorshipOffers,
  withdrawOffer,
  // Deals
  createDeal,
  acceptDeal,
  rejectDeal,
  withdrawDeal,
  addDealMessage,
  listDeals,
  getDeal,
} from "../../controllers/sponsorship/sponsorship.controller.js";
import { verifyJWT } from "../../middleware/auth.middleware.js";

const router = Router();

// All sponsorship routes require authentication
router.use(verifyJWT);

// ── Sponsorship Requests ──────────────────────────────────────────────
// POST   /sponsorships/requests          → create a request (club / event)
// GET    /sponsorships/requests          → list public open requests
// GET    /sponsorships/requests/:id      → get single request
// PATCH  /sponsorships/requests/:id      → update request (manager only)

router
  .route("/requests")
  .post(createSponsorshipRequest)
  .get(listSponsorshipRequests);

router
  .route("/requests/:requestId")
  .get(getSponsorshipRequest)
  .patch(updateSponsorshipRequest);

// ── Sponsorship Offers ────────────────────────────────────────────────
// POST   /sponsorships/offers                  → create offer (user / institution)
// GET    /sponsorships/offers                  → list public open offers
// PATCH  /sponsorships/offers/:offerId/withdraw → withdraw offer

router
  .route("/offers")
  .post(createSponsorshipOffer)
  .get(listSponsorshipOffers);

router.patch("/offers/:offerId/withdraw", withdrawOffer);

// ── Sponsorship Deals ─────────────────────────────────────────────────
// POST   /sponsorships/deals                         → initiate deal (offer → request)
// GET    /sponsorships/deals                         → list deals (filter by requestId/offerId)
// GET    /sponsorships/deals/:dealId                 → get single deal with messages
// PATCH  /sponsorships/deals/:dealId/accept          → accept (request manager)
// PATCH  /sponsorships/deals/:dealId/reject          → reject (request manager)
// PATCH  /sponsorships/deals/:dealId/withdraw        → withdraw (either party)
// POST   /sponsorships/deals/:dealId/messages        → add negotiation message

router
  .route("/deals")
  .post(createDeal)
  .get(listDeals);

router.get("/deals/:dealId", getDeal);
router.patch("/deals/:dealId/accept", acceptDeal);
router.patch("/deals/:dealId/reject", rejectDeal);
router.patch("/deals/:dealId/withdraw", withdrawDeal);
router.post("/deals/:dealId/messages", addDealMessage);

export default router;