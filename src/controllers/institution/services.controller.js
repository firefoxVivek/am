
import ServiceCard from "../../models/institution/serviceCard.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asynchandler } from "../../utils/asynchandler.js";

/* --- Create a New Service Card --- */
export const createServiceCard = asynchandler(async (req, res) => {
  const { title, about, imageUrl, customFields, itemsList } = req.body;

  if (!title) throw new ApiError(400, "Title is required");

  const serviceCard = await ServiceCard.create({
    providerId: req.user._id, // Set from Auth Middleware
    title,
    about,
    imageUrl,
    customFields,
    itemsList
  });

  return res.status(201).json(
    new ApiResponse(201, serviceCard, "Service Card created successfully")
  );
});

/* --- Fetch All Cards for a Specific Institution (Public) --- */
export const getInstitutionCards = asynchandler(async (req, res) => {
  const { institutionId } = req.params;

  // Uses the index { providerId: 1, createdAt: -1 }
  const cards = await ServiceCard.find({ providerId: institutionId })
    .sort({ createdAt: -1 });

  return res.status(200).json(
    new ApiResponse(200, cards, "Cards fetched successfully")
  );
});

/* --- Update a Service Card (Owner Only) --- */
export const updateServiceCard = asynchandler(async (req, res) => {
  const { id } = req.params; // The MongoDB _id of the card
  const updates = req.body;

  // Find and update ONLY if the card belongs to the logged-in user
  const card = await ServiceCard.findOneAndUpdate(
    { _id: id, providerId: req.user._id },
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!card) {
    throw new ApiError(404, "Card not found or you are not authorized to edit it");
  }

  return res.status(200).json(
    new ApiResponse(200, card, "Card updated successfully")
  );
});

/* --- Delete a Service Card (Owner Only) --- */
export const deleteServiceCard = asynchandler(async (req, res) => {
  const { id } = req.params;

  const card = await ServiceCard.findOneAndDelete({
    _id: id,
    providerId: req.user._id
  });

  if (!card) {
    throw new ApiError(404, "Card not found or unauthorized");
  }

  return res.status(200).json(
    new ApiResponse(200, {}, "Card deleted successfully")
  );
});