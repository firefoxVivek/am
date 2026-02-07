 
import admin from "../../../config/firebase.js";
import User from "../../models/Profile/auth.models.js";
import { Institution } from "../../models/Profile/institution.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { asynchandler } from "../../utils/asynchandler.js";

export const createInstitution = asynchandler(async (req, res) => {
  const { 
    name, categoryId, locationId, address, councilName, 
    about, themes, logo, website, contactEmail, phone, instagram, linkedIn 
  } = req.body;

  // 1. Basic validation for required indexing fields
  if (!name || !categoryId || !locationId || !address) {
    throw new ApiError(400, "Name, Category, Location, and Address are required.");
  }

  // 2. Prevent duplicate institution profiles for the same founder
  const existing = await Institution.findOne({ founderId: req.user._id });
  if (existing) {
    throw new ApiError(409, "You have already created an institution profile.");
  }

  // 3. Create the Institution
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
    status: "active" // Defaulting to active for now
  });

  // 4. Update the User profile status
  await User.findByIdAndUpdate(req.user._id, { isProfileComplete: true });

  return res.status(201).json(
    new ApiResponse(201, institution, "Institution profile created successfully.")
  );
});

 export const getMyInstitution = asynchandler(async (req, res) => {
  const institution = await Institution.findOne({ founderId: req.user._id })
    // .populate("categoryId", "name") // Useful for showing category name in UI
    .populate("locationId", "officeName pincode districtName");

  if (!institution) {
    throw new ApiError(404, "Institution profile not found.");
  }

  return res.status(200).json(new ApiResponse(200, institution));
});

 export const getInstitutionsByFilter = asynchandler(async (req, res) => {
  const { categoryId, locationId } = req.query;

  const query = { status: "active" };
  if (categoryId) query.categoryId = categoryId;
  if (locationId) query.locationId = locationId;

  // This uses your Compound Index { categoryId: 1, locationId: 1 }
  const institutions = await Institution.find(query)
    .select("name logo address  ")
    .limit(20);

  return res.status(200).json(new ApiResponse(200, institutions));
});
export const updateInstitution = asynchandler(async (req, res) => {
  const updates = req.body;

  // Security: Don't allow changing the founder or internal status via this route
  delete updates.founderId;
  delete updates.status;

  const institution = await Institution.findOneAndUpdate(
    { founderId: req.user._id },
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!institution) {
    throw new ApiError(404, "Institution not found or unauthorized.");
  }

  return res.status(200).json(
    new ApiResponse(200, institution, "Profile updated successfully.")
  );
});
export const subscribeToInstitution = asynchandler(async (req, res) => {
  const userId = req.user._id;
  const { institutionId } = req.params;

  // 1️⃣ Fetch user + institution
  const [user, institution] = await Promise.all([
    User.findById(userId).select("deviceTokens"),
    Institution.findById(institutionId),
  ]);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!institution) {
    throw new ApiError(404, "Institution not found");
  }

  if (!user.deviceTokens || user.deviceTokens.length === 0) {
    throw new ApiError(400, "No device tokens found for user");
  }

  // 2️⃣ Topic name
  const topic = `ins_${institutionId}`;

  // 3️⃣ Subscribe all user devices to topic
  await admin.messaging().subscribeToTopic(
    user.deviceTokens,
    topic
  );

  // 4️⃣ Increment subscribers count (atomic)
  await Institution.findByIdAndUpdate(
    institutionId,
    { $inc: { subscribersCount: 1 } },
    { new: true }
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      { topic },
      "User subscribed to institution successfully"
    )
  );
});

export const unsubscribeFromInstitution = asynchandler(async (req, res) => {
  const userId = req.user._id;
  const { institutionId } = req.params;

  // 1️⃣ Fetch user & institution
  const [user, institution] = await Promise.all([
    User.findById(userId).select("deviceTokens"),
    Institution.findById(institutionId),
  ]);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!institution) {
    throw new ApiError(404, "Institution not found");
  }

  if (!user.deviceTokens || user.deviceTokens.length === 0) {
    throw new ApiError(400, "No device tokens found for user");
  }

  const topic = `insti_${institutionId}`;

  // 2️⃣ Unsubscribe all user devices from topic
  await admin.messaging().unsubscribeFromTopic(
    user.deviceTokens,
    topic
  );

  // 3️⃣ Safely decrement subscriber count (never below 0)
  await Institution.findByIdAndUpdate(
    institutionId,
    {
      $inc: { subscribersCount: -1 },
    },
    { new: true }
  );

  // Optional safety clamp (extra protection)
  await Institution.updateOne(
    { _id: institutionId, subscribersCount: { $lt: 0 } },
    { $set: { subscribersCount: 0 } }
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      { topic },
      "User unsubscribed from institution successfully"
    )
  );
});