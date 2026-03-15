 
import mongoose from "mongoose";
import {
  SponsorshipRequest,
  SponsorshipOffer,
  SponsorshipDeal,
} from "../../models/sponsorship/sponsorship.model.js";
import { Club } from "../../models/club/club.model.js";
import { ClubMembership } from "../../models/connections/userToClub.model.js";
import { Institution } from "../../models/Profile/institution.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { notify, notifyTopic } from "../../utils/notify.js";
import { asynchandler } from "../../utils/asynchandler.js";
 

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Resolve the FCM token / topic for the seeker side of a request */
async function seekerNotifyTarget(request) {
  if (request.seekerType === "Club") {
    return { topic: `club_${request.club}` };
  }
  // For events, notify the creator
  return { userId: request.createdBy };
}

/** Check whether the calling user owns the offer */
function assertOfferOwner(offer, userId) {
  if (offer.sponsorType === "User") {
    if (offer.user.toString() !== userId.toString()) {
      throw new ApiError(403, "Not authorised to manage this offer.");
    }
  } else {
    // Institution — ownership checked via institution.createdBy (populated)
    if (
      !offer.institution?.createdBy ||
      offer.institution.createdBy.toString() !== userId.toString()
    ) {
      throw new ApiError(403, "Not authorised to manage this offer.");
    }
  }
}

/** Check whether the calling user can manage a sponsorship request */
async function assertRequestManager(request, userId) {
  if (request.seekerType === "Club") {
    const membership = await ClubMembership.findOne({
      club: request.club,
      user: userId,
      role: { $in: ["admin", "moderator"] },
      status: "active",
    });
    if (!membership) {
      throw new ApiError(
        403,
        "Only club admins/moderators can manage this request."
      );
    }
  } else {
    // Event: only the creator can manage
    if (request.createdBy.toString() !== userId.toString()) {
      throw new ApiError(403, "Only the event creator can manage this request.");
    }
  }
}

// ─────────────────────────────────────────────
// 1. Create Sponsorship Request  POST /sponsorships/requests
// ─────────────────────────────────────────────
export const createSponsorshipRequest = asynchandler(async (req, res) => {
  const {
    seekerType,
    clubId,
    eventId,
    title,
    description,
    amountNeeded,
    perks,
    deadline,
    isPublic,
  } = req.body;

  if (!["Club", "Event"].includes(seekerType)) {
    throw new ApiError(400, "seekerType must be Club or Event.");
  }

  if (seekerType === "Club") {
    if (!clubId) throw new ApiError(400, "clubId is required for Club requests.");
    const membership = await ClubMembership.findOne({
      club: clubId,
      user: req.user._id,
      role: { $in: ["admin", "moderator"] },
      status: "active",
    });
    if (!membership) {
      throw new ApiError(
        403,
        "Only club admins/moderators can create sponsorship requests."
      );
    }
  }

  const request = await SponsorshipRequest.create({
    seekerType,
    club: seekerType === "Club" ? clubId : null,
    event: seekerType === "Event" ? eventId : null,
    createdBy: req.user._id,
    title,
    description,
    amountNeeded,
    perks,
    deadline,
    isPublic: isPublic ?? true,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, request, "Sponsorship request created."));
});

// ─────────────────────────────────────────────
// 2. List Sponsorship Requests  GET /sponsorships/requests
// ─────────────────────────────────────────────
export const listSponsorshipRequests = asynchandler(async (req, res) => {
  const { seekerType, status = "open", page = 1, limit = 20 } = req.query;

  const filter = { isPublic: true };
  if (seekerType) filter.seekerType = seekerType;
  if (status) filter.status = status;

  const requests = await SponsorshipRequest.find(filter)
    .populate("club", "name logo")
    .populate("event", "title coverImage")
    .populate("createdBy", "fullName avatar")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await SponsorshipRequest.countDocuments(filter);

  return res.json(
    new ApiResponse(200, { requests, total, page: Number(page), limit: Number(limit) })
  );
});

// ─────────────────────────────────────────────
// 3. Get Single Sponsorship Request  GET /sponsorships/requests/:requestId
// ─────────────────────────────────────────────
export const getSponsorshipRequest = asynchandler(async (req, res) => {
  const request = await SponsorshipRequest.findById(req.params.requestId)
    .populate("club", "name logo description")
    .populate("event", "title coverImage startDate")
    .populate("createdBy", "fullName avatar");

  if (!request) throw new ApiError(404, "Sponsorship request not found.");

  return res.json(new ApiResponse(200, request));
});

// ─────────────────────────────────────────────
// 4. Update Sponsorship Request  PATCH /sponsorships/requests/:requestId
// ─────────────────────────────────────────────
export const updateSponsorshipRequest = asynchandler(async (req, res) => {
  const request = await SponsorshipRequest.findById(req.params.requestId);
  if (!request) throw new ApiError(404, "Sponsorship request not found.");

  await assertRequestManager(request, req.user._id);

  const allowed = [
    "title",
    "description",
    "amountNeeded",
    "perks",
    "deadline",
    "status",
    "isPublic",
  ];
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) request[field] = req.body[field];
  });

  await request.save();
  return res.json(new ApiResponse(200, request, "Sponsorship request updated."));
});

// ─────────────────────────────────────────────
// 5. Create Sponsorship Offer  POST /sponsorships/offers
// ─────────────────────────────────────────────
export const createSponsorshipOffer = asynchandler(async (req, res) => {
  const {
    sponsorType,
    institutionId,
    requestId,
    title,
    description,
    amountOffered,
    terms,
    validUntil,
    isPublic,
  } = req.body;

  if (!["User", "Institution"].includes(sponsorType)) {
    throw new ApiError(400, "sponsorType must be User or Institution.");
  }

  if (sponsorType === "Institution") {
    if (!institutionId)
      throw new ApiError(400, "institutionId is required for Institution offers.");
    const institution = await Institution.findOne({
      _id: institutionId,
      createdBy: req.user._id,
    });
    if (!institution) {
      throw new ApiError(
        403,
        "You are not the owner of this institution."
      );
    }
  }

  // If targeting a specific request, validate it exists
  if (requestId) {
    const exists = await SponsorshipRequest.findById(requestId);
    if (!exists) throw new ApiError(404, "Sponsorship request not found.");
  }

  const offer = await SponsorshipOffer.create({
    sponsorType,
    user: sponsorType === "User" ? req.user._id : null,
    institution: sponsorType === "Institution" ? institutionId : null,
    request: requestId || null,
    title,
    description,
    amountOffered,
    terms,
    validUntil,
    isPublic: isPublic ?? true,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, offer, "Sponsorship offer created."));
});

// ─────────────────────────────────────────────
// 6. List Sponsorship Offers  GET /sponsorships/offers
// ─────────────────────────────────────────────
export const listSponsorshipOffers = asynchandler(async (req, res) => {
  const { sponsorType, requestId, page = 1, limit = 20 } = req.query;

  const filter = { isPublic: true, status: "open" };
  if (sponsorType) filter.sponsorType = sponsorType;
  if (requestId) filter.request = requestId;

  const offers = await SponsorshipOffer.find(filter)
    .populate("user", "fullName avatar")
    .populate("institution", "name logo")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await SponsorshipOffer.countDocuments(filter);

  return res.json(
    new ApiResponse(200, { offers, total, page: Number(page), limit: Number(limit) })
  );
});

// ─────────────────────────────────────────────
// 7. Withdraw Offer  PATCH /sponsorships/offers/:offerId/withdraw
// ─────────────────────────────────────────────
export const withdrawOffer = asynchandler(async (req, res) => {
  const offer = await SponsorshipOffer.findById(req.params.offerId).populate(
    "institution",
    "createdBy"
  );
  if (!offer) throw new ApiError(404, "Sponsorship offer not found.");

  assertOfferOwner(offer, req.user._id);

  if (offer.status === "withdrawn") {
    throw new ApiError(400, "Offer already withdrawn.");
  }

  offer.status = "withdrawn";
  await offer.save();

  // Notify seeker if there was a pending deal
  const pendingDeal = await SponsorshipDeal.findOne({
    offer: offer._id,
    status: "pending",
  }).populate("request");

  if (pendingDeal) {
    pendingDeal.status = "withdrawn";
    pendingDeal.resolvedAt = new Date();
    await pendingDeal.save();

    // Notify the request creator
    await notify(
      pendingDeal.request.createdBy,
      "Sponsorship Offer Withdrawn",
      `A sponsor withdrew their offer for "${pendingDeal.request.title}".`,
      { dealId: pendingDeal._id.toString(), type: "sponsorship_withdrawn" }
    );
  }

  return res.json(new ApiResponse(200, offer, "Offer withdrawn."));
});

// ─────────────────────────────────────────────
// 8. Connect (Create Deal)  POST /sponsorships/deals
//    Offer side initiates — creates a pending deal linking offer → request
// ─────────────────────────────────────────────
export const createDeal = asynchandler(async (req, res) => {
  const { offerId, requestId, agreedAmount, agreedTerms, message } = req.body;

  if (!offerId || !requestId) {
    throw new ApiError(400, "offerId and requestId are required.");
  }

  const [offer, request] = await Promise.all([
    SponsorshipOffer.findById(offerId).populate("institution", "createdBy"),
    SponsorshipRequest.findById(requestId),
  ]);

  if (!offer) throw new ApiError(404, "Sponsorship offer not found.");
  if (!request) throw new ApiError(404, "Sponsorship request not found.");

  // Only the offer owner can initiate a deal
  assertOfferOwner(offer, req.user._id);

  if (offer.status !== "open") {
    throw new ApiError(400, "Offer is not open.");
  }
  if (request.status !== "open") {
    throw new ApiError(400, "Sponsorship request is not open.");
  }

  // Prevent duplicate pending deals
  const existing = await SponsorshipDeal.findOne({
    offer: offerId,
    request: requestId,
    status: { $in: ["pending", "accepted"] },
  });
  if (existing) {
    throw new ApiError(409, "A deal between this offer and request already exists.");
  }

  const initialMessages = message
    ? [{ sender: req.user._id, text: message, sentAt: new Date() }]
    : [];

  const deal = await SponsorshipDeal.create({
    request: requestId,
    offer: offerId,
    agreedAmount: agreedAmount ?? offer.amountOffered,
    agreedTerms: agreedTerms ?? offer.terms,
    initiatedBy: req.user._id,
    messages: initialMessages,
  });

  // Notify the request creator
  await notify(
    request.createdBy,
    "New Sponsorship Offer",
    `Someone wants to sponsor "${request.title}" with ₹${deal.agreedAmount}.`,
    { dealId: deal._id.toString(), type: "sponsorship_deal_created" }
  );

  return res
    .status(201)
    .json(new ApiResponse(201, deal, "Sponsorship deal initiated."));
});

// ─────────────────────────────────────────────
// 9. Accept Deal  PATCH /sponsorships/deals/:dealId/accept
// ─────────────────────────────────────────────
export const acceptDeal = asynchandler(async (req, res) => {
  const deal = await SponsorshipDeal.findById(req.params.dealId)
    .populate("request")
    .populate({
      path: "offer",
      populate: { path: "institution", select: "createdBy" },
    });

  if (!deal) throw new ApiError(404, "Deal not found.");
  if (deal.status !== "pending") {
    throw new ApiError(400, `Deal is already ${deal.status}.`);
  }

  // Only the request manager can accept
  await assertRequestManager(deal.request, req.user._id);

  deal.status = "accepted";
  deal.resolvedAt = new Date();
  await deal.save();

  // Update amountRaised on the request
  deal.request.amountRaised =
    (deal.request.amountRaised || 0) + deal.agreedAmount;
  if (deal.request.amountRaised >= deal.request.amountNeeded) {
    deal.request.status = "fulfilled";
  }
  await deal.request.save();

  // Notify the offer creator
  const offerOwnerId =
    deal.offer.sponsorType === "User"
      ? deal.offer.user
      : deal.offer.institution?.createdBy;

  if (offerOwnerId) {
    await notify(
      offerOwnerId,
      "Sponsorship Accepted 🎉",
      `Your sponsorship offer for "${deal.request.title}" has been accepted!`,
      { dealId: deal._id.toString(), type: "sponsorship_accepted" }
    );
  }

  return res.json(new ApiResponse(200, deal, "Deal accepted."));
});

// ─────────────────────────────────────────────
// 10. Reject Deal  PATCH /sponsorships/deals/:dealId/reject
// ─────────────────────────────────────────────
export const rejectDeal = asynchandler(async (req, res) => {
  const deal = await SponsorshipDeal.findById(req.params.dealId)
    .populate("request")
    .populate({
      path: "offer",
      populate: { path: "institution", select: "createdBy" },
    });

  if (!deal) throw new ApiError(404, "Deal not found.");
  if (deal.status !== "pending") {
    throw new ApiError(400, `Deal is already ${deal.status}.`);
  }

  await assertRequestManager(deal.request, req.user._id);

  deal.status = "rejected";
  deal.resolvedAt = new Date();
  await deal.save();

  const offerOwnerId =
    deal.offer.sponsorType === "User"
      ? deal.offer.user
      : deal.offer.institution?.createdBy;

  if (offerOwnerId) {
    await notify(
      offerOwnerId,
      "Sponsorship Not Accepted",
      `Your sponsorship offer for "${deal.request.title}" was not accepted this time.`,
      { dealId: deal._id.toString(), type: "sponsorship_rejected" }
    );
  }

  return res.json(new ApiResponse(200, deal, "Deal rejected."));
});

// ─────────────────────────────────────────────
// 11. Withdraw Deal  PATCH /sponsorships/deals/:dealId/withdraw
//     Either side can withdraw (offer owner or request manager)
// ─────────────────────────────────────────────
export const withdrawDeal = asynchandler(async (req, res) => {
  const deal = await SponsorshipDeal.findById(req.params.dealId)
    .populate("request")
    .populate({
      path: "offer",
      populate: { path: "institution", select: "createdBy" },
    });

  if (!deal) throw new ApiError(404, "Deal not found.");
  if (!["pending", "accepted"].includes(deal.status)) {
    throw new ApiError(400, `Cannot withdraw a ${deal.status} deal.`);
  }

  // Check authorisation: must be offer owner OR request manager
  const isOfferOwner = (() => {
    try {
      assertOfferOwner(deal.offer, req.user._id);
      return true;
    } catch {
      return false;
    }
  })();

  const isRequestManager = await (async () => {
    try {
      await assertRequestManager(deal.request, req.user._id);
      return true;
    } catch {
      return false;
    }
  })();

  if (!isOfferOwner && !isRequestManager) {
    throw new ApiError(403, "Not authorised to withdraw this deal.");
  }

  // Reverse amountRaised if it was accepted
  if (deal.status === "accepted") {
    deal.request.amountRaised = Math.max(
      0,
      (deal.request.amountRaised || 0) - deal.agreedAmount
    );
    if (deal.request.status === "fulfilled") {
      deal.request.status = "open";
    }
    await deal.request.save();
  }

  deal.status = "withdrawn";
  deal.resolvedAt = new Date();
  await deal.save();

  // Notify the other party
  const offerOwnerId =
    deal.offer.sponsorType === "User"
      ? deal.offer.user
      : deal.offer.institution?.createdBy;

  if (isRequestManager && offerOwnerId) {
    await notify(
      offerOwnerId,
      "Sponsorship Deal Withdrawn",
      `The seeker withdrew the deal for "${deal.request.title}".`,
      { dealId: deal._id.toString(), type: "sponsorship_withdrawn" }
    );
  } else if (isOfferOwner) {
    await notify(
      deal.request.createdBy,
      "Sponsorship Deal Withdrawn",
      `The sponsor withdrew their deal for "${deal.request.title}".`,
      { dealId: deal._id.toString(), type: "sponsorship_withdrawn" }
    );
  }

  return res.json(new ApiResponse(200, deal, "Deal withdrawn."));
});

// ─────────────────────────────────────────────
// 12. Add Message to Deal  POST /sponsorships/deals/:dealId/messages
// ─────────────────────────────────────────────
export const addDealMessage = asynchandler(async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) throw new ApiError(400, "Message text is required.");

  const deal = await SponsorshipDeal.findById(req.params.dealId)
    .populate("request")
    .populate({
      path: "offer",
      populate: { path: "institution", select: "createdBy" },
    });

  if (!deal) throw new ApiError(404, "Deal not found.");
  if (deal.status === "rejected" || deal.status === "withdrawn") {
    throw new ApiError(400, "Cannot message on a closed deal.");
  }

  // Authorise: offer owner or request manager
  const isOfferOwner = (() => {
    try {
      assertOfferOwner(deal.offer, req.user._id);
      return true;
    } catch {
      return false;
    }
  })();

  const isRequestManager = await (async () => {
    try {
      await assertRequestManager(deal.request, req.user._id);
      return true;
    } catch {
      return false;
    }
  })();

  if (!isOfferOwner && !isRequestManager) {
    throw new ApiError(403, "Not a participant in this deal.");
  }

  deal.messages.push({ sender: req.user._id, text: text.trim() });
  await deal.save();

  // Notify the other party
  const offerOwnerId =
    deal.offer.sponsorType === "User"
      ? deal.offer.user
      : deal.offer.institution?.createdBy;

  const recipientId = isRequestManager ? offerOwnerId : deal.request.createdBy;
  if (recipientId) {
    await notify(
      recipientId,
      "New message on sponsorship deal",
      text.trim().slice(0, 80),
      { dealId: deal._id.toString(), type: "sponsorship_message" }
    );
  }

  return res.json(
    new ApiResponse(200, deal.messages.at(-1), "Message sent.")
  );
});

// ─────────────────────────────────────────────
// 13. List Deals (for a request OR offer)  GET /sponsorships/deals
// ─────────────────────────────────────────────
export const listDeals = asynchandler(async (req, res) => {
  const { requestId, offerId, status, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (requestId) filter.request = requestId;
  if (offerId) filter.offer = offerId;
  if (status) filter.status = status;

  const deals = await SponsorshipDeal.find(filter)
    .populate("request", "title amountNeeded amountRaised seekerType club event")
    .populate({
      path: "offer",
      populate: [
        { path: "user", select: "fullName avatar" },
        { path: "institution", select: "name logo" },
      ],
    })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await SponsorshipDeal.countDocuments(filter);

  return res.json(
    new ApiResponse(200, { deals, total, page: Number(page), limit: Number(limit) })
  );
});

// ─────────────────────────────────────────────
// 14. Get Single Deal  GET /sponsorships/deals/:dealId
// ─────────────────────────────────────────────
export const getDeal = asynchandler(async (req, res) => {
  const deal = await SponsorshipDeal.findById(req.params.dealId)
    .populate("request")
    .populate({
      path: "offer",
      populate: [
        { path: "user", select: "fullName avatar" },
        { path: "institution", select: "name logo" },
      ],
    })
    .populate("messages.sender", "fullName avatar");

  if (!deal) throw new ApiError(404, "Deal not found.");

  return res.json(new ApiResponse(200, deal));
});