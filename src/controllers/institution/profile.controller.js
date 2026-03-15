import mongoose from "mongoose";
import { Institution }  from "../../models/Profile/institution.model.js";
import { Club }         from "../../models/club/club.model.js";
import { Council }      from "../../models/club/council.model.js";
import ServiceCard      from "../../models/institution/serviceCard.model.js";
import { Subscription } from "../../models/misc/subscription.model.js";
import { ApiError }     from "../../utils/ApiError.js";
import { ApiResponse }  from "../../utils/ApiResponse.js";
import { asynchandler } from "../../utils/asynchandler.js";
import {
  subscribeToTopic,
  unsubscribeFromTopic,
} from "../../utils/notify.js";

/* ── Whitelisted update fields ───────────────────────────────────*/
const ALLOWED_UPDATE_FIELDS = new Set([
  "name", "address", "about", "themes", "councilName",
  "logo", "website", "contactEmail", "phone", "instagram", "linkedIn",
]);

/* ── Ownership guard ─────────────────────────────────────────────*/
async function ensureFounder(institutionId, userId) {
  if (!mongoose.Types.ObjectId.isValid(institutionId)) {
    throw new ApiError(400, "Invalid institution ID");
  }
  const inst = await Institution.findOne({
    _id:       institutionId,
    founderId: userId,
    status:    { $ne: "suspended" },
  }).lean();
  if (!inst) throw new ApiError(403, "Institution not found or you are not the owner");
  return inst;
}

/* ================================================================
   CREATE INSTITUTION
   POST /api/v1/institutions
================================================================ */
export const createInstitution = asynchandler(async (req, res) => {
  const {
    name, categoryId, locationId, address,
    about, themes, logo, website, contactEmail,
    phone, instagram, linkedIn,
  } = req.body;

  if (!name || !categoryId || !locationId || !address) {
    throw new ApiError(400, "name, categoryId, locationId, and address are required");
  }

  const existing = await Institution.findOne({ founderId: req.user._id }).lean();
  if (existing) throw new ApiError(409, "You have already created an institution");

  const institution = await Institution.create({
    name, categoryId, locationId, address,
    about, themes, logo, website,
    contactEmail, phone, instagram, linkedIn,
    founderId: req.user._id,
    status:    "active",
  });

  return res.status(201).json(
    new ApiResponse(201, institution, "Institution created successfully")
  );
});

/* ================================================================
   GET MY INSTITUTION
   GET /api/v1/institutions/me
================================================================ */
export const getMyInstitution = asynchandler(async (req, res) => {
  const institution = await Institution.findOne({ founderId: req.user._id })
    .populate("locationId", "officeName pincode districtName stateName")
    .populate("categoryId", "name slug icon");

  if (!institution) throw new ApiError(404, "Institution not found");

  return res.status(200).json(
    new ApiResponse(200, institution, "Institution fetched")
  );
});

/* ================================================================
   GET PUBLIC INSTITUTION
   GET /api/v1/institutions/:institutionId
   Returns isOwner + isSubscribed so Flutter shows correct buttons.
================================================================ */
export const getPublicInstitution = asynchandler(async (req, res) => {
  const { institutionId } = req.params;
  const viewerId = req.user._id;

  if (!mongoose.Types.ObjectId.isValid(institutionId)) {
    throw new ApiError(400, "Invalid institution ID");
  }

  const [institution, sub, serviceCount, councilCount] = await Promise.all([
    Institution.findOne({ _id: institutionId, status: "active" })
      .populate("locationId", "officeName pincode districtName stateName")
      .populate("categoryId", "name slug icon parentId")
      .lean(),
    Subscription.findOne({
      userId:   viewerId,
      entityId: institutionId,
      isActive: true,
    }).lean(),
    ServiceCard.countDocuments({ institutionId, isActive: true }),
    Council.countDocuments({ "institution.id": institutionId, status: "active" }),
  ]);

  if (!institution) throw new ApiError(404, "Institution not found");

  return res.status(200).json(
    new ApiResponse(200, {
      ...institution,
      isOwner:      institution.founderId.toString() === viewerId.toString(),
      isSubscribed: !!sub,
      serviceCount,
      councilCount,
    }, "Institution fetched")
  );
});

/* ================================================================
   UPDATE INSTITUTION
   PATCH /api/v1/institutions/:institutionId
================================================================ */
export const updateInstitution = asynchandler(async (req, res) => {
  const { institutionId } = req.params;
  await ensureFounder(institutionId, req.user._id);

  const updates = {};
  for (const key of Object.keys(req.body)) {
    if (ALLOWED_UPDATE_FIELDS.has(key)) updates[key] = req.body[key];
  }

  if (!Object.keys(updates).length) {
    throw new ApiError(400, "No valid fields to update");
  }

  const institution = await Institution.findByIdAndUpdate(
    institutionId,
    { $set: updates },
    { new: true, runValidators: true }
  );

  return res.status(200).json(
    new ApiResponse(200, institution, "Institution updated")
  );
});

/* ================================================================
   DISCOVER — paginated filter
   GET /api/v1/institutions/discover?categoryId=&locationId=&page=&limit=
================================================================ */
export const getInstitutionsByFilter = asynchandler(async (req, res) => {
  const { categoryId, locationId, page = 1, limit = 20 } = req.query;

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const pageLimit  = Math.min(parseInt(limit, 10), 50);
  const skip       = (pageNumber - 1) * pageLimit;

  const filter = { status: "active" };
  if (categoryId) filter.categoryId = categoryId;
  if (locationId) filter.locationId = locationId;

  const [institutions, total] = await Promise.all([
    Institution.find(filter)
      .select("name logo address about categoryId locationId subscribersCount themes")
      .populate("categoryId", "name slug icon")
      .populate("locationId", "officeName districtName stateName")
      .sort({ subscribersCount: -1 })
      .skip(skip)
      .limit(pageLimit)
      .lean(),
    Institution.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      institutions,
      pagination: {
        total, page: pageNumber, limit: pageLimit,
        totalPages: Math.ceil(total / pageLimit),
        hasNextPage: skip + institutions.length < total,
      },
    }, "Institutions fetched")
  );
});

/* ================================================================
   SHELF — Amazon Kindle / Play Books style home screen
   GET /api/v1/institutions/shelf?locationId=&limit=6

   Returns ALL genres that have institutions in the user's city.
   Each shelf contains a preview row of `limit` institutions.
   Flutter maps each shelf to a horizontal ListView with "See all".

   RESPONSE:
   {
     shelves: [
       {
         genre: { _id, name, icon, slug },
         total: 48,
         institutions: [ ...6 items with category populated ]
       },
       ...
     ]
   }

   QUERY STRATEGY — 2 DB calls total regardless of genre count:
   1. Category.find({ level: 1 })  → all Level-1 genres
   2. One aggregation on Institution:
      - $lookup category to get parentId (genre)
      - $group by genre, $push institutions, $sum total
      - $project slice first N per group
================================================================ */
export const getInstitutionShelves = asynchandler(async (req, res) => {
  const { locationId, limit = 6 } = req.query;

  if (!locationId) throw new ApiError(400, "locationId is required");
  if (!mongoose.Types.ObjectId.isValid(locationId)) {
    throw new ApiError(400, "Invalid locationId");
  }

  const perShelf = Math.min(parseInt(limit, 10), 20);

  // Step 1 — fetch all Level-1 genres (small collection, fast)
  const Category = mongoose.model("Category");
  const genres = await Category.find({ level: 1 })
    .select("name slug icon order")
    .sort({ order: 1, name: 1 })
    .lean();

  if (!genres.length) {
    return res.status(200).json(
      new ApiResponse(200, { shelves: [] }, "No genres found")
    );
  }

  const genreMap = {};
  for (const g of genres) genreMap[g._id.toString()] = g;

  // Step 2 — one aggregation: group institutions by their genre (Level-1 parent)
  const shelves = await Institution.aggregate([
    // Only active institutions in this city
    {
      $match: {
        locationId: new mongoose.Types.ObjectId(locationId),
        status:     "active",
      },
    },
    // Join to Category to get the Level-2 category and its parentId (= genre)
    {
      $lookup: {
        from:         "categories",
        localField:   "categoryId",
        foreignField: "_id",
        as:           "category",
      },
    },
    { $unwind: { path: "$category", preserveNullAndEmpty: false } },
    // Group by genre (Level-1 parentId)
    {
      $group: {
        _id:          "$category.parentId",   // Level-1 genre ObjectId
        total:        { $sum: 1 },
        institutions: {
          $push: {
            _id:              "$_id",
            name:             "$name",
            logo:             "$logo",
            address:          "$address",
            about:            "$about",
            subscribersCount: "$subscribersCount",
            category: {
              _id:  "$category._id",
              name: "$category.name",
              slug: "$category.slug",
            },
          },
        },
      },
    },
    // Keep only the first N per shelf — slice happens in DB, not in Node
    {
      $project: {
        _id:          1,
        total:        1,
        institutions: { $slice: ["$institutions", perShelf] },
      },
    },
    // Sort shelves by total descending (richest shelves first)
    { $sort: { total: -1 } },
  ]);

  // Step 3 — attach genre metadata from the map built in Step 1
  const result = shelves
    .filter((s) => s._id && genreMap[s._id.toString()])
    .map((s) => ({
      genre:        genreMap[s._id.toString()],
      total:        s.total,
      institutions: s.institutions,
    }))
    // Re-sort by the genre's defined order
    .sort((a, b) => (a.genre.order ?? 0) - (b.genre.order ?? 0));

  return res.status(200).json(
    new ApiResponse(200, { shelves: result }, "Shelves fetched")
  );
});

/* ================================================================
   SEARCH
   GET /api/v1/institutions/search?q=&categoryId=&locationId=&page=&limit=
================================================================ */
export const searchInstitutions = asynchandler(async (req, res) => {
  const { q, categoryId, locationId, page = 1, limit = 15 } = req.query;

  if (!q?.trim() || q.trim().length < 2) {
    throw new ApiError(400, "Search query must be at least 2 characters");
  }

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const pageLimit  = Math.min(parseInt(limit, 10), 30);
  const skip       = (pageNumber - 1) * pageLimit;

  const filter = { $text: { $search: q.trim() }, status: "active" };
  if (categoryId) filter.categoryId = categoryId;
  if (locationId) filter.locationId = locationId;

  const [institutions, total] = await Promise.all([
    Institution.find(filter, { score: { $meta: "textScore" } })
      .select("name logo address about categoryId locationId subscribersCount")
      .populate("categoryId", "name slug icon")
      .populate("locationId", "officeName districtName stateName")
      .sort({ score: { $meta: "textScore" }, subscribersCount: -1 })
      .skip(skip)
      .limit(pageLimit)
      .lean(),
    Institution.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      institutions,
      pagination: {
        total, page: pageNumber, limit: pageLimit,
        totalPages: Math.ceil(total / pageLimit),
        hasNextPage: skip + institutions.length < total,
      },
    }, "Search results")
  );
});

/* ================================================================
   SUBSCRIBE
   POST /api/v1/institutions/:institutionId/subscribe
================================================================ */
export const subscribeToInstitution = asynchandler(async (req, res) => {
  const { institutionId } = req.params;
  const userId = req.user._id;

  if (!mongoose.Types.ObjectId.isValid(institutionId)) {
    throw new ApiError(400, "Invalid institution ID");
  }

  const institution = await Institution.findOne({
    _id: institutionId, status: "active",
  }).lean();
  if (!institution) throw new ApiError(404, "Institution not found");

  const result = await subscribeToTopic({
    userId,
    entityId:   institution._id,
    entityType: "institution",
    expiresAt:  null,
  });

  if (result.subscribed) {
    await Institution.findByIdAndUpdate(
      institutionId, { $inc: { subscribersCount: 1 } }
    );
  }

  return res.status(200).json(
    new ApiResponse(200,
      { topic: result.topic ?? `institution_${institutionId}` },
      "Subscribed to institution"
    )
  );
});

/* ================================================================
   UNSUBSCRIBE
   DELETE /api/v1/institutions/:institutionId/subscribe
================================================================ */
export const unsubscribeFromInstitution = asynchandler(async (req, res) => {
  const { institutionId } = req.params;
  const userId = req.user._id;

  if (!mongoose.Types.ObjectId.isValid(institutionId)) {
    throw new ApiError(400, "Invalid institution ID");
  }

  const result = await unsubscribeFromTopic({ userId, entityId: institutionId });

  if (result.unsubscribed) {
    await Institution.findOneAndUpdate(
      { _id: institutionId, subscribersCount: { $gt: 0 } },
      [{ $set: { subscribersCount: { $max: [0, { $subtract: ["$subscribersCount", 1] }] } } }]
    );
  }

  return res.status(200).json(
    new ApiResponse(200, {}, "Unsubscribed from institution")
  );
});

/* ================================================================
   GET CLUBS UNDER INSTITUTION
   GET /api/v1/institutions/:institutionId/clubs
================================================================ */
export const getInstitutionClubs = asynchandler(async (req, res) => {
  const { institutionId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  if (!mongoose.Types.ObjectId.isValid(institutionId)) {
    throw new ApiError(400, "Invalid institution ID");
  }

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const pageLimit  = Math.min(parseInt(limit, 10), 50);
  const skip       = (pageNumber - 1) * pageLimit;

  const filter = { "institution.id": institutionId, status: "active" };

  const [clubs, total] = await Promise.all([
    Club.find(filter)
      .select("clubId clubName image about privacy membersCount council")
      .sort({ membersCount: -1, createdAt: -1 })
      .skip(skip).limit(pageLimit).lean(),
    Club.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(200, {
      total, clubs,
      pagination: {
        page: pageNumber, limit: pageLimit,
        totalPages: Math.ceil(total / pageLimit),
        hasNextPage: skip + clubs.length < total,
      },
    }, "Clubs fetched")
  );
});

/* ================================================================
   GET COUNCILS UNDER INSTITUTION
   GET /api/v1/institutions/:institutionId/councils
================================================================ */
export const getInstitutionCouncils = asynchandler(async (req, res) => {
  const { institutionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(institutionId)) {
    throw new ApiError(400, "Invalid institution ID");
  }

  const councils = await Council.find({
    "institution.id": institutionId,
    status:           "active",
  })
    .select("councilId councilName image about clubsCount followersCount privacy")
    .sort({ clubsCount: -1 })
    .lean();

  return res.status(200).json(
    new ApiResponse(200, { count: councils.length, councils }, "Councils fetched")
  );
});