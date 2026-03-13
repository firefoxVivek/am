import mongoose from "mongoose";
import admin        from "../../../config/firebase.js";
import ServiceCard  from "../../models/institution/serviceCard.model.js";
import { Institution } from "../../models/Profile/institution.model.js";
import { ApiError }    from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asynchandler } from "../../utils/asynchandler.js";

/* ---------------------------------------------------------------
   CREATE SERVICE CARD
   POST /api/v1/institution/services/
   Only the institution's own founder can create cards for it.
--------------------------------------------------------------- */
export const createServiceCard = asynchandler(async (req, res) => {
  const { title, about, imageUrl, customFields, itemsList, institutionId } = req.body;

  if (!title?.trim()) {
    throw new ApiError(400, "Title is required");
  }

  if (!institutionId) {
    throw new ApiError(400, "institutionId is required");
  }

  if (!mongoose.Types.ObjectId.isValid(institutionId)) {
    throw new ApiError(400, "Invalid institution ID");
  }

  // Verify institution exists AND belongs to this user
  const institution = await Institution.findOne({
    _id:       institutionId,
    founderId: req.user._id,        // ownership check — was missing before
    status:    "active",
  }).select("_id name").lean();

  if (!institution) {
    throw new ApiError(403, "Institution not found or you are not authorized to add services to it");
  }

  const serviceCard = await ServiceCard.create({
    providerId:   req.user._id,
    institutionId,                  // now correctly stored
    title:        title.trim(),
    about,
    imageUrl,
    customFields,
    itemsList,
  });

  // Notify institution subscribers (non-blocking)
  admin.messaging().send({
    topic: `institution_${institutionId}`,
    notification: {
      title: `New service from ${institution.name}`,
      body:  title.trim(),
    },
    data: {
      type:          "SERVICE_CREATED",
      serviceId:     serviceCard._id.toString(),
      institutionId: institutionId.toString(),
    },
  }).catch((e) => console.error("[FCM] createServiceCard:", e.message));

  return res
    .status(201)
    .json(new ApiResponse(201, serviceCard, "Service card created successfully"));
});

/* ---------------------------------------------------------------
   GET ALL CARDS FOR AN INSTITUTION (Public)
   GET /api/v1/institution/services/institution/:institutionId
   Previously queried by providerId — always returned 0 results.
   Now correctly queries by institutionId.
--------------------------------------------------------------- */
export const getInstitutionCards = asynchandler(async (req, res) => {
  const { institutionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(institutionId)) {
    throw new ApiError(400, "Invalid institution ID");
  }

  // Uses the index { institutionId: 1, isActive: 1, createdAt: -1 }
  const cards = await ServiceCard.find({
    institutionId,
    isActive: true,
  }).sort({ createdAt: -1 }).lean();

  return res
    .status(200)
    .json(new ApiResponse(200, { count: cards.length, cards }, "Service cards fetched successfully"));
});

/* ---------------------------------------------------------------
   UPDATE SERVICE CARD (Owner Only)
   PATCH /api/v1/institution/services/:id
--------------------------------------------------------------- */
export const updateServiceCard = asynchandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid card ID");
  }

  // Whitelist updatable fields — prevents overwriting providerId or institutionId
  const ALLOWED = ["title", "about", "imageUrl", "customFields", "itemsList"];
  const safeUpdates = {};
  for (const key of ALLOWED) {
    if (req.body[key] !== undefined) safeUpdates[key] = req.body[key];
  }

  if (Object.keys(safeUpdates).length === 0) {
    throw new ApiError(400, "No valid fields provided for update");
  }

  const card = await ServiceCard.findOneAndUpdate(
    { _id: id, providerId: req.user._id },
    { $set: safeUpdates },
    { new: true, runValidators: true }
  );

  if (!card) {
    throw new ApiError(404, "Card not found or you are not authorized to edit it");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, card, "Service card updated successfully"));
});

/* ---------------------------------------------------------------
   DELETE SERVICE CARD (Owner Only)
   DELETE /api/v1/institution/services/:id
   Soft-delete — sets isActive: false so existing bookings stay intact.
--------------------------------------------------------------- */
export const deleteServiceCard = asynchandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid card ID");
  }

  const card = await ServiceCard.findOneAndUpdate(
    { _id: id, providerId: req.user._id },
    { $set: { isActive: false } },
    { new: true }
  );

  if (!card) {
    throw new ApiError(404, "Card not found or unauthorized");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Service card removed successfully"));
});