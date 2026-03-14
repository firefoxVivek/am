import mongoose from "mongoose";
import ServiceCard  from "../../models/institution/serviceCard.model.js";
import { Institution } from "../../models/Profile/institution.model.js";
import { ApiError }    from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asynchandler } from "../../utils/asynchandler.js";
import { notifyTopic, topicFor } from "../../utils/notify.js";

/* ── Ownership guard ─────────────────────────────────────────────*/
async function ensureCardOwner(cardId, userId) {
  if (!mongoose.Types.ObjectId.isValid(cardId)) {
    throw new ApiError(400, "Invalid card ID");
  }
  const card = await ServiceCard.findOne({
    _id:        cardId,
    providerId: userId,
    isActive:   true,
  }).lean();
  if (!card) throw new ApiError(404, "Card not found or you are not the owner");
  return card;
}

/* ================================================================
   CREATE SERVICE CARD
   POST /api/v1/institutions/:institutionId/services
================================================================ */
export const createServiceCard = asynchandler(async (req, res) => {
  const { institutionId }                          = req.params;
  const { title, about, imageUrl, customFields, itemsList } = req.body;

  if (!title?.trim()) throw new ApiError(400, "title is required");

  if (!mongoose.Types.ObjectId.isValid(institutionId)) {
    throw new ApiError(400, "Invalid institution ID");
  }

  // Verify caller owns this institution
  const institution = await Institution.findOne({
    _id:       institutionId,
    founderId: req.user._id,
    status:    "active",
  }).select("_id name").lean();

  if (!institution) {
    throw new ApiError(403, "Institution not found or you are not authorized");
  }

  const card = await ServiceCard.create({
    providerId:   req.user._id,
    institutionId,
    title:        title.trim(),
    about:        about?.trim() ?? "",
    imageUrl:     imageUrl ?? null,
    customFields: customFields ?? {},
    itemsList:    itemsList ?? [],
    availability: req.body.availability ?? { status: "open" },
  });

  // Notify all institution subscribers (non-blocking)
  notifyTopic({
    topic:   topicFor({ entityType: "institution", entityId: institutionId }),
    type:    "INSTITUTION_POST",
    title:   `New service from ${institution.name}`,
    body:    title.trim(),
    payload: {
      screen:   "InstitutionDetail",
      entityId: institutionId,
      extra:    { cardId: card._id.toString() },
    },
  });

  return res.status(201).json(
    new ApiResponse(201, card, "Service card created successfully")
  );
});

/* ================================================================
   GET ALL CARDS FOR AN INSTITUTION  (public)
   GET /api/v1/institutions/:institutionId/services
================================================================ */
export const getInstitutionCards = asynchandler(async (req, res) => {
  const { institutionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(institutionId)) {
    throw new ApiError(400, "Invalid institution ID");
  }

  const cards = await ServiceCard.find({
    institutionId,
    isActive: true,
  }).sort({ createdAt: -1 }).lean();

  return res.status(200).json(
    new ApiResponse(200, { count: cards.length, cards }, "Service cards fetched")
  );
});

/* ================================================================
   GET SINGLE CARD  (public)
   GET /api/v1/institutions/:institutionId/services/:cardId
================================================================ */
export const getSingleCard = asynchandler(async (req, res) => {
  const { institutionId, cardId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(cardId)) {
    throw new ApiError(400, "Invalid card ID");
  }

  const card = await ServiceCard.findOne({
    _id:           cardId,
    institutionId,
    isActive:      true,
  }).lean();

  if (!card) throw new ApiError(404, "Service card not found");

  return res.status(200).json(new ApiResponse(200, card, "Card fetched"));
});

/* ================================================================
   UPDATE SERVICE CARD
   PATCH /api/v1/institutions/:institutionId/services/:cardId
================================================================ */
export const updateServiceCard = asynchandler(async (req, res) => {
  const { cardId } = req.params;
  await ensureCardOwner(cardId, req.user._id);

  const ALLOWED = ["title", "about", "imageUrl", "customFields", "availability"];
  const updates = {};
  for (const key of ALLOWED) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (!Object.keys(updates).length) {
    throw new ApiError(400, "No valid fields to update");
  }

  const card = await ServiceCard.findByIdAndUpdate(
    cardId,
    { $set: updates },
    { new: true, runValidators: true }
  );

  return res.status(200).json(new ApiResponse(200, card, "Card updated"));
});

/* ================================================================
   DELETE SERVICE CARD  (soft)
   DELETE /api/v1/institutions/:institutionId/services/:cardId
================================================================ */
export const deleteServiceCard = asynchandler(async (req, res) => {
  const { cardId } = req.params;
  await ensureCardOwner(cardId, req.user._id);

  await ServiceCard.findByIdAndUpdate(cardId, { $set: { isActive: false } });

  return res.status(200).json(new ApiResponse(200, {}, "Card removed"));
});

/* ================================================================
   ADD ITEM TO CARD
   POST /api/v1/institutions/:institutionId/services/:cardId/items
   Body: { name, price, unit }

   Items are the menu/price-list rows inside a service card.
   e.g. "Admission Fee — ₹5,000 — per year"
        "Consultation — ₹500 — per visit"
================================================================ */
export const addItemToCard = asynchandler(async (req, res) => {
  const { cardId } = req.params;
  await ensureCardOwner(cardId, req.user._id);

  const { name, price, unit } = req.body;
  if (!name?.trim() || !price?.trim() || !unit?.trim()) {
    throw new ApiError(400, "name, price, and unit are required");
  }

  const card = await ServiceCard.findByIdAndUpdate(
    cardId,
    {
      $push: {
        itemsList: {
          _id:   new mongoose.Types.ObjectId(),
          name:  name.trim(),
          price: price.trim(),
          unit:  unit.trim(),
        },
      },
    },
    { new: true }
  );

  return res.status(201).json(
    new ApiResponse(201, card, "Item added")
  );
});

/* ================================================================
   UPDATE ITEM
   PATCH /api/v1/institutions/:institutionId/services/:cardId/items/:itemId
   Body: { name?, price?, unit? }
================================================================ */
export const updateItem = asynchandler(async (req, res) => {
  const { cardId, itemId } = req.params;
  await ensureCardOwner(cardId, req.user._id);

  const { name, price, unit } = req.body;

  // Build a positional update — only set fields that were sent
  const setFields = {};
  if (name  !== undefined) setFields["itemsList.$.name"]  = name.trim();
  if (price !== undefined) setFields["itemsList.$.price"] = price.trim();
  if (unit  !== undefined) setFields["itemsList.$.unit"]  = unit.trim();

  if (!Object.keys(setFields).length) {
    throw new ApiError(400, "No valid fields to update");
  }

  const card = await ServiceCard.findOneAndUpdate(
    { _id: cardId, "itemsList._id": itemId },
    { $set: setFields },
    { new: true }
  );

  if (!card) throw new ApiError(404, "Item not found");

  return res.status(200).json(new ApiResponse(200, card, "Item updated"));
});

/* ================================================================
   DELETE ITEM
   DELETE /api/v1/institutions/:institutionId/services/:cardId/items/:itemId
================================================================ */
export const deleteItem = asynchandler(async (req, res) => {
  const { cardId, itemId } = req.params;
  await ensureCardOwner(cardId, req.user._id);

  const card = await ServiceCard.findByIdAndUpdate(
    cardId,
    { $pull: { itemsList: { _id: itemId } } },
    { new: true }
  );

  if (!card) throw new ApiError(404, "Card not found");

  return res.status(200).json(new ApiResponse(200, card, "Item deleted"));
});