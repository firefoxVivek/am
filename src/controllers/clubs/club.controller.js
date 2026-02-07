import mongoose from "mongoose";
import { Club } from "../../models/club/club.model.js";
import { ClubMembership } from "../../models/connections/userToClub.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";

import User from "../../models/Profile/auth.models.js";
import admin from "../../../config/firebase.js";

export const createClub = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const ownerId = req.user._id;
    const ownerName = req.user.displayName;

    if (!ownerName) {
      throw new ApiError(
        400,
        "Add Name to your profile before creating a club"
      );
    }

    const { clubId, clubName, image, about, council, institution, privacy } =
      req.body;

    /* ---------------- Validation ---------------- */
    if (!clubId || !clubName) {
      throw new ApiError(400, "clubId and clubName are required");
    }

    /* ---------------- Uniqueness Check ---------------- */
    const existingClub = await Club.findOne(
      {
        $or: [{ clubId: clubId.toLowerCase() }, { "owner.id": ownerId }],
      },
      null,
      { session }
    );

    if (existingClub) {
      throw new ApiError(
        409,
        "Club already exists with this clubId or user already owns a club"
      );
    }

    /* ---------------- Create Club ---------------- */
    const [club] = await Club.create(
      [
        {
          owner: {
            id: ownerId,
            displayName: ownerName,
          },
          clubId: clubId.toLowerCase(),
          clubName,
          image: image || null,
          about: about || "",
          council: council?.id
            ? { id: council.id, name: council.name || null }
            : null,
          institution: institution?.id
            ? { id: institution.id, name: institution.name || null }
            : null,
          privacy: privacy || "public",
          membersCount: 1,
          postsCount: 0,
        },
      ],
      { session }
    );

    /* ---------------- Create Membership (OWNER) ---------------- */
    await ClubMembership.create(
      [
        {
          clubId: club._id,
          userId: ownerId,
          role: "owner",
          status: "approved",
          joinedAt: new Date(),
        },
      ],
      { session }
    );

    /* ---------------- FCM Topic Subscription ---------------- */
    const owner = await User.findById(ownerId)
      .select("deviceTokens")
      .session(session);

    const tokens = owner?.deviceTokens || [];

    if (tokens.length > 0) {
      const adminTopic = `admin_${club.clubId}`;
      const clubTopic = `club_${club.clubId}`;

      await admin.messaging().subscribeToTopic(tokens, adminTopic);
      await admin.messaging().subscribeToTopic(tokens, clubTopic);
    }

    /* ---------------- Commit ---------------- */
    await session.commitTransaction();
    session.endSession();

    return res
      .status(201)
      .json(new ApiResponse(201, club, "Club created successfully"));
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

export const updateClub = async (req, res) => {
  try {
    const { clubId } = req.params;

    const updated = await Club.findOneAndUpdate(
      { clubId, status: "active" },
      req.body,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Club not found" });
    }

    res.status(200).json({ data: updated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteClub = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { clubId } = req.params;

    session.startTransaction();

    // 1️⃣ Soft delete club
    const club = await Club.findOneAndUpdate(
      { clubId, status: { $ne: "deleted" } },
      {
        status: "deleted",
        clubId: `${clubId}_deleted_${Date.now()}`,
      },
      { new: true, session }
    );

    if (!club) {
      await session.abortTransaction();
      return res
        .status(404)
        .json({ message: "Club not found or already deleted" });
    }

    // 2️⃣ Remove club reference from owner
    await User.findByIdAndUpdate(
      club.ownerId,
      {
        $unset: { ownedClub: "" }, // or clubId / clubOwned
      },
      { session }
    );

    await session.commitTransaction();

    res.status(200).json({
      message: "Club deleted successfully. User can create a new club.",
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Delete club error:", error);
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

export const checkClubIdAvailability = async (req, res) => {
  const { clubId } = req.params;
  const exists = await Club.findOne({ clubId });
  res.status(200).json({ available: !exists });
};

/* =====================================================
   FETCH & DISCOVERY
===================================================== */

export const getClubByClubId = async (req, res) => {
  const club = await Club.findOne({
    clubId: req.params.clubId,
    status: "active",
  }).populate("ownerId", "username");

  if (!club) {
    return res.status(404).json({ message: "Club not found" });
  }

  const clubObj = club.toObject();

  res.status(200).json({
    data: {
      ...clubObj,

      // 👇 flatten populated user
      owner: {
        id: clubObj.ownerId._id.toString(),
        name: clubObj.ownerId.username,
      },

      // ❌ remove populated object
      ownerId: undefined,
    },
  });
};

export const getClubById = async (req, res) => {
  const { Id } = req.params;
  const userId = req.user?._id;

  if (!mongoose.Types.ObjectId.isValid(Id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid club id",
    });
  }

  const clubId = new mongoose.Types.ObjectId(Id);

  const club = await Club.aggregate([
    {
      $match: {
        _id: clubId,
        status: "active",
      },
    },

    /** 👤 OWNER CHECK */
    {
      $addFields: {
        isOwner: {
          $eq: ["$owner.id", userId],
        },
      },
    },

    /** 👥 MEMBERSHIP (member OR admin) */
    {
      $lookup: {
        from: "clubMemberships",
        let: { clubId: "$_id", userId },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$clubId", "$$clubId"] },
                  { $eq: ["$userId", "$$userId"] },
                  { $in: ["$role", ["member", "admin"]] },
                  { $eq: ["$status", "active"] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: "membership",
      },
    },

    /** 📨 JOIN REQUEST */
    {
      $lookup: {
        from: "clubjoinrequests",
        let: { clubId: "$_id", userId },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$clubId", "$$clubId"] },
                  { $eq: ["$userId", "$$userId"] },
                  { $eq: ["$status", "pending"] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: "joinRequest",
      },
    },

    /** 🧠 FINAL FLAGS */
    {
      $addFields: {
        isMember: {
          $or: ["$isOwner", { $gt: [{ $size: "$membership" }, 0] }],
        },
        hasRequested: {
          $and: [
            { $not: "$isOwner" },
            { $eq: [{ $size: "$membership" }, 0] },
            { $gt: [{ $size: "$joinRequest" }, 0] },
          ],
        },
      },
    },

    /** 🧹 CLEANUP */
    {
      $project: {
        membership: 0,
        joinRequest: 0,
        isOwner: 0,
        __v: 0,
      },
    },
  ]);

  if (!club.length) {
    return res.status(404).json({
      success: false,
      message: "Club not found",
    });
  }

  return res.status(200).json({
    success: true,
    data: club[0],
  });
};

 
export const getClubByUserId = async (req, res) => {
  try {
    const userId = req.user._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: No user ID found in token",
      });
    }

    const club = await Club.findOne({
      "owner.id": userId,
      status: { $ne: "deleted" },
    })
      .select("clubName image owner") // only required fields
      .lean();

    if (!club) {
      return res.status(404).json({
        success: false,
        message: "No active club found for this user.",
      });
    }

    // 🔥 Format like getMyClubs (but single object)
    const formattedClub = {
      _id: club._id,
      clubName: club.clubName,
      clubImage: club.image || DEFAULT_CLUB_IMAGE,
      myRole: "owner", // since this API is based on owner.id
    };

    return res
      .status(200)
      .json(new ApiResponse(200, formattedClub, "Club fetched successfully"));

  } catch (error) {
    console.error("Error in getClubByUserId:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};


// This API finds the club regardless of its status
export const getDeletedClubByUserId = async (req, res) => {
  try {
    const club = await Club.findOne({
      ownerId: req.params.userId,
      status: "deleted",
    });

    if (!club)
      return res
        .status(404)
        .json({ message: "No deleted club found for this user" });

    res.status(200).json({ data: club });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllClubs = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const skip = (page - 1) * limit;

  const [clubs, total] = await Promise.all([
    Club.find({ status: "active", privacy: "public" })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    Club.countDocuments({ status: "active", privacy: "public" }),
  ]);

  res.status(200).json({
    data: clubs,
    meta: { page, limit, total },
  });
};

export const getClubsByCategory = async (req, res) => {
  const clubs = await Club.find({ categories: req.params.categoryId });
  res.status(200).json({ data: clubs });
};

export const getClubsByCouncil = async (req, res) => {
  const clubs = await Club.find({ councilId: req.params.councilId });
  res.status(200).json({ data: clubs });
};

export const getClubsByInstitution = async (req, res) => {
  const clubs = await Club.find({ institutionId: req.params.institutionId });
  res.status(200).json({ data: clubs });
};

export const searchClubs = async (req, res) => {
  try {
    const { q, page = 1, limit = 10 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        message: "Search query must be at least 2 characters",
      });
    }

    const skip = (Number(page) - 1) * Number(limit);

    const regex = new RegExp(q, "i"); // case-insensitive

    const [clubs, total] = await Promise.all([
      Club.find({
        clubId: regex,
        status: "active",
      })
        .select("clubId clubName image about membersCount createdAt")
        .sort({ membersCount: -1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),

      Club.countDocuments({
        clubName: regex,
        status: "active",
      }),
    ]);

    res.status(200).json({
      data: clubs,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Pattern search error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const discoverClubs = async (req, res) => {
  const filter = { status: "active", privacy: "public" };

  if (req.query.councilId) filter.councilId = req.query.councilId;
  if (req.query.institutionId) filter.institutionId = req.query.institutionId;
  if (req.query.categoryId) filter.categories = req.query.categoryId;

  const clubs = await Club.find(filter);
  res.status(200).json({ data: clubs });
};

/* =====================================================
   MEMBERSHIP
===================================================== */

export const joinClub = async (req, res) => {
  const userId = req.user._id;
  const club = await Club.findOne({ clubId: req.params.clubId });

  if (!club) return res.status(404).json({ message: "Club not found" });

  if (club.members.includes(userId)) {
    return res.status(409).json({ message: "Already a member" });
  }

  club.members.push(userId);
  club.membersCount += 1;
  await club.save();

  res.status(200).json({ message: "Joined club successfully" });
};

export const leaveClub = async (req, res) => {
  const userId = req.user._id;
  const club = await Club.findOne({ clubId: req.params.clubId });

  club.members.pull(userId);
  club.admins.pull(userId);
  club.membersCount -= 1;

  await club.save();
  res.status(200).json({ message: "Left club successfully" });
};

/* =====================================================
   ADMIN & ROLES
===================================================== */

export const promoteToAdmin = async (req, res) => {
  const club = await Club.findOne({ clubId: req.params.clubId });
  club.admins.addToSet(req.params.userId);
  await club.save();
  res.status(200).json({ message: "User promoted to admin" });
};

export const removeAdmin = async (req, res) => {
  const club = await Club.findOne({ clubId: req.params.clubId });
  club.admins.pull(req.params.userId);
  await club.save();
  res.status(200).json({ message: "Admin removed" });
};

export const removeMember = async (req, res) => {
  const club = await Club.findOne({ clubId: req.params.clubId });
  club.members.pull(req.params.userId);
  club.membersCount -= 1;
  await club.save();
  res.status(200).json({ message: "Member removed" });
};

/* =====================================================
   PRIVACY & MODERATION
===================================================== */

export const changeClubPrivacy = async (req, res) => {
  const club = await Club.findOneAndUpdate(
    { clubId: req.params.clubId },
    { privacy: req.body.privacy },
    { new: true }
  );
  res.status(200).json({ data: club });
};

export const changeClubStatus = async (req, res) => {
  const club = await Club.findOneAndUpdate(
    { clubId: req.params.clubId },
    { status: req.body.status },
    { new: true }
  );
  res.status(200).json({ data: club });
};

/* =====================================================
   STATS
===================================================== */
export const getClubStats = async (req, res) => {
  const { clubId } = req.params;

  if (!clubId) {
    throw new ApiError(400, "clubId is required");
  }

  const club = await Club.findOne({
    clubId: clubId.toLowerCase(),
    status: "active",
  })
    .select("membersCount postsCount createdAt")
    .lean();

  if (!club) {
    throw new ApiError(404, "Club not found");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        membersCount: club.membersCount,
        postsCount: club.postsCount,
        createdAt: club.createdAt,
      },
      "Club stats fetched successfully"
    )
  );
};

export const getInstitutionClubStats = async (req, res) => {
  const count = await Club.countDocuments({
    institutionId: req.params.institutionId,
  });
  res.status(200).json({ totalClubs: count });
};

/* =====================================================
   USER-CENTRIC
===================================================== */

export const getMyClub = async (req, res) => {
  const club = await Club.findOne({ ownerId: req.user._id });
  res.status(200).json({ data: club });
};

export const getMyClubs =  (async (req, res) => {
  const userId = req.user._id;

  const memberships = await ClubMembership.find({
    userId,
    status: "approved",
    role: { $in: ["admin", "member"] },
  })
    .populate({
      path: "clubId",
      select: "clubName image", // only what we need
    })
    .lean();

  const clubs = memberships
    .filter((m) => m.clubId)
    .map((m) => ({
      _id: m.clubId._id,
      clubName: m.clubId.clubName,
      clubImage: m.clubId.image || DEFAULT_CLUB_IMAGE,
      myRole: m.role,
    }));

  return res
    .status(200)
    .json(new ApiResponse(200, clubs, "Clubs fetched successfully"));
});

export const getMyAdminClubs = async (req, res) => {
  const clubs = await Club.find({ admins: req.user._id });
  res.status(200).json({ data: clubs });
};

/* =====================================================
   MEDIA
===================================================== */

export const uploadClubImage = async (req, res) => {
  const club = await Club.findOneAndUpdate(
    { clubId: req.params.clubId },
    { image: req.body.image },
    { new: true }
  );
  res.status(200).json({ data: club });
};
