import mongoose from "mongoose";
import admin        from "../../../config/firebase.js";
import User         from "../../models/Profile/auth.models.js";
import { Institution } from "../../models/Profile/institution.model.js";
import { ApiError }    from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asynchandler } from "../../utils/asynchandler.js";

/* ---------------------------------------------------------------
   CONSTANTS
--------------------------------------------------------------- */

// Single source of truth for the FCM topic name.
// Was the root cause of the subscribe/unsubscribe mismatch bug.
const institutionTopic = (id) => `institution_${id}`;

// Fields an institution founder is allowed to update.
// founderId, status, subscribersCount, categoryId, locationId are system-managed.
const ALLOWED_UPDATE_FIELDS = new Set([
  "name",
  "address",
  "about",
  "themes",
  "councilName",
  "logo",
  "website",
  "contactEmail",
  "phone",
  "instagram",
  "linkedIn",
]);

/* ---------------------------------------------------------------
   CREATE INSTITUTION
   POST /api/v1/institution/profile/create
--------------------------------------------------------------- */
export const createInstitution = asynchandler(async (req, res) => {
  const {
    name, categoryId, locationId, address, councilName,
    about, themes, logo, website, contactEmail, phone, instagram, linkedIn,
  } = req.body;

  if (!name || !categoryId || !locationId || !address) {
    throw new ApiError(400, "name, categoryId, locationId, and address are required");
  }

  // One institution per founder
  const existing = await Institution.findOne({ founderId: req.user._id }).lean();
  if (existing) {
    throw new ApiError(409, "You have already created an institution profile");
  }

  const institution = await Institution.create({
    name,
    categoryId,
    locationId,
    address,
    councilName,
    about,
    themes,
    founderId: req.user._id,
    logo,
    website,
    contactEmail,
    phone,
    instagram,
    linkedIn,
    status: "active",
  });

  // Mark the auth user's profile as complete
  await User.findByIdAndUpdate(req.user._id, { $set: { isProfileComplete: true } });

  return res
    .status(201)
    .json(new ApiResponse(201, institution, "Institution profile created successfully"));
});

/* ---------------------------------------------------------------
   GET MY INSTITUTION
   GET /api/v1/institution/profile/me
--------------------------------------------------------------- */
export const getMyInstitution = asynchandler(async (req, res) => {
  const institution = await Institution.findOne({ founderId: req.user._id })
    .populate("locationId",  "officeName pincode districtName stateName")
    .populate("categoryId",  "name slug icon");

  if (!institution) {
    throw new ApiError(404, "Institution profile not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, institution, "Institution fetched successfully"));
});

/* ---------------------------------------------------------------
   GET PUBLIC INSTITUTION (by ID)
   GET /api/v1/institution/profile/:institutionId
   Available to all logged-in users.
   Includes isSubscribed flag so the frontend knows which button to show.
--------------------------------------------------------------- */
export const getPublicInstitution = asynchandler(async (req, res) => {
  const { institutionId } = req.params;
  const viewerId = req.user._id;

  if (!mongoose.Types.ObjectId.isValid(institutionId)) {
    throw new ApiError(400, "Invalid institution ID");
  }

  const institution = await Institution.findById(institutionId)
    .populate("locationId", "officeName pincode districtName stateName")
    .populate("categoryId", "name slug icon")
    .lean();

  if (!institution || institution.status !== "active") {
    throw new ApiError(404, "Institution not found");
  }

  // Check if the viewer is already subscribed via FCM.
  // We check this via User.deviceTokens + a lightweight flag approach.
  // Since Firebase doesn't expose a "is subscribed" API cheaply, we keep
  // a subscriber list embedded in a separate model in production.
  // For now we store a Set of subscriberIds on the institution.
  // TEMPORARY: return isSubscribed as null — see subscribersList model (future).
  // The subscribe/unsubscribe endpoints are already atomic and correct.
  const isSubscribed = null; // placeholder — wire to UserInstitutionSubscription model when added

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ...institution,
        isSubscribed,
        isOwner: institution.founderId.toString() === viewerId.toString(),
      },
      "Institution fetched successfully"
    )
  );
});

/* ---------------------------------------------------------------
   UPDATE INSTITUTION
   PATCH /api/v1/institution/profile/update
   Only whitelisted fields are applied.
--------------------------------------------------------------- */
export const updateInstitution = asynchandler(async (req, res) => {
  const rawBody = req.body;

  // Build a sanitized update object
  const safeUpdates = {};
  for (const key of Object.keys(rawBody)) {
    if (ALLOWED_UPDATE_FIELDS.has(key)) {
      safeUpdates[key] = rawBody[key];
    }
  }

  if (Object.keys(safeUpdates).length === 0) {
    throw new ApiError(400, "No valid fields provided for update");
  }

  const institution = await Institution.findOneAndUpdate(
    { founderId: req.user._id },
    { $set: safeUpdates },
    { new: true, runValidators: true }
  );

  if (!institution) {
    throw new ApiError(404, "Institution not found or unauthorized");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, institution, "Institution updated successfully"));
});

/* ---------------------------------------------------------------
   DISCOVER INSTITUTIONS (with pagination)
   GET /api/v1/institution/profile/discover?categoryId=&locationId=&page=1&limit=20
--------------------------------------------------------------- */
export const getInstitutionsByFilter = asynchandler(async (req, res) => {
  const { categoryId, locationId, page = 1, limit = 20 } = req.query;

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const pageLimit  = Math.min(parseInt(limit, 10), 50);
  const skip       = (pageNumber - 1) * pageLimit;

  const query = { status: "active" };
  if (categoryId) query.categoryId = categoryId;
  if (locationId) query.locationId = locationId;

  const [institutions, total] = await Promise.all([
    Institution.find(query)
      .select("name logo address about categoryId locationId subscribersCount themes")
      .populate("categoryId", "name slug icon")
      .populate("locationId", "officeName districtName stateName")
      .sort({ subscribersCount: -1 })
      .skip(skip)
      .limit(pageLimit)
      .lean(),
    Institution.countDocuments(query),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        results: institutions,
        pagination: {
          total,
          page:        pageNumber,
          limit:       pageLimit,
          totalPages:  Math.ceil(total / pageLimit),
          hasNextPage: skip + institutions.length < total,
        },
      },
      "Institutions fetched successfully"
    )
  );
});

/* ---------------------------------------------------------------
   SUBSCRIBE TO INSTITUTION
   POST /api/v1/institution/profile/subscribe/:institutionId
--------------------------------------------------------------- */
export const subscribeToInstitution = asynchandler(async (req, res) => {
  const userId          = req.user._id;
  const { institutionId } = req.params;

  const [user, institution] = await Promise.all([
    User.findById(userId).select("deviceTokens"),
    Institution.findById(institutionId),
  ]);

  if (!user)        throw new ApiError(404, "User not found");
  if (!institution) throw new ApiError(404, "Institution not found");

  if (!user.deviceTokens?.length) {
    throw new ApiError(400, "No device tokens registered for this user");
  }

  const topic = institutionTopic(institutionId);

  await admin.messaging().subscribeToTopic(user.deviceTokens, topic);

  // Atomic increment — no race condition
  await Institution.findByIdAndUpdate(
    institutionId,
    { $inc: { subscribersCount: 1 } }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, { topic }, "Subscribed to institution successfully"));
});

/* ---------------------------------------------------------------
   UNSUBSCRIBE FROM INSTITUTION
   POST /api/v1/institution/profile/unsubscribe/:institutionId
--------------------------------------------------------------- */
export const unsubscribeFromInstitution = asynchandler(async (req, res) => {
  const userId          = req.user._id;
  const { institutionId } = req.params;

  const [user, institution] = await Promise.all([
    User.findById(userId).select("deviceTokens"),
    Institution.findById(institutionId),
  ]);

  if (!user)        throw new ApiError(404, "User not found");
  if (!institution) throw new ApiError(404, "Institution not found");

  if (!user.deviceTokens?.length) {
    throw new ApiError(400, "No device tokens registered for this user");
  }

  const topic = institutionTopic(institutionId); // same function — guaranteed match

  await admin.messaging().unsubscribeFromTopic(user.deviceTokens, topic);

  // Atomic decrement with floor at 0 using a single conditional update
  // $max with a pipeline update ensures the counter never goes negative —
  // no separate query, no race window.
  await Institution.findByIdAndUpdate(
    institutionId,
    [{ $set: { subscribersCount: { $max: [0, { $subtract: ["$subscribersCount", 1] }] } } }]
  );

  return res
    .status(200)
    .json(new ApiResponse(200, { topic }, "Unsubscribed from institution successfully"));
});