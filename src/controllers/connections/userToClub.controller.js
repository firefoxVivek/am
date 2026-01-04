import mongoose from "mongoose";
import { Club } from "../../models/club/club.model.js";
import { ClubMembership } from "../../models/connections/userToClub.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { ApiResponse } from "../../utils/ApiResponse.js";

const ObjectId = mongoose.Types.ObjectId;

/* ======================================================
   HELPER: Check admin or owner
====================================================== */
const ensureAdminOrOwner = async (clubId, userId) => {
  const membership = await ClubMembership.findOne({
    clubId,
    userId,
    status: "approved",
    role: { $in: ["admin", "owner"] },
  });

  if (!membership) {
    throw new ApiError(403, "Admin or Owner access required");
  }

  return membership;
};

/* ======================================================
   JOIN PUBLIC CLUB
====================================================== */
export const joinClub = async (req, res) => {
  const { clubId } = req.params;
  const userId = req.user._id;

  /* ---------------- Find Club ---------------- */
  const club = await Club.findById(clubId).select("privacy");
  if (!club) {
    throw new ApiError(404, "Club not found");
  }

  /* ---------------- Private Club Guard ---------------- */
  if (club.privacy === "private") {
    throw new ApiError(
      403,
      "This is a private club. Please send a join request."
    );
  }

  /* ---------------- Check Existing Membership ---------------- */
  const existingMembership = await ClubMembership.findOne({
    clubId,
    userId,
  });

  if (existingMembership) {
    if (existingMembership.status === "approved") {
      throw new ApiError(409, "Already a member of this club");
    }
  }

  /* ---------------- Create Membership ---------------- */
  const membership = await ClubMembership.create({
    clubId,
    userId,
    role: "member",
    status: "approved",
    joinedAt: new Date(),
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      membership,
      "Joined club successfully"
    )
  );
};

/* ======================================================
   REQUEST TO JOIN PRIVATE CLUB
====================================================== */
export const requestToJoinClub = async (req, res) => {
  const { clubId } = req.params;
  const userId = req.user._id;

  const club = await Club.findById(clubId).select("privacy");
  if (!club) {
    throw new ApiError(404, "Club not found");
  }

  if (club.privacy === "public") {
    throw new ApiError(400, "This is a public club. Use join instead.");
  }

  const membership = await ClubMembership.findOne({ clubId, userId });

  /* ---------------- Existing Membership ---------------- */
  if (membership) {
    if (membership.status === "pending") {
      throw new ApiError(409, "Join request already pending");
    }

    if (membership.status === "approved") {
      throw new ApiError(409, "Already a member of this club");
    }

    if (membership.status === "rejected") {
      // 🔒 Optional cooldown (recommended)
      const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

      if (
        membership.updatedAt &&
        Date.now() - membership.updatedAt.getTime() < COOLDOWN_MS
      ) {
        throw new ApiError(
          429,
          "Join request was rejected recently. Please try again later."
        );
      }

      // ♻️ Re-activate request
      membership.status = "pending";
      membership.requestedAt = new Date();
      membership.actionBy = null;
      await membership.save();

      return res.status(200).json(
        new ApiResponse(200, membership, "Join request re-submitted")
      );
    }
  }

  /* ---------------- New Join Request ---------------- */
  const newMembership = await ClubMembership.create({
    clubId,
    userId,
    role: "member",
    status: "pending",
    requestedAt: new Date(),
  });

  return res.status(200).json(
    new ApiResponse(200, newMembership, "Join request sent successfully")
  );
};


/* ======================================================
   ACCEPT JOIN REQUEST (ADMIN)
====================================================== */
export const acceptJoinRequest = async (req, res) => {
  const { membershipId } = req.params;
  const adminId = req.user._id;

  const membership = await ClubMembership.findById(membershipId);
  if (!membership || membership.status !== "pending") {
    throw new ApiError(404, "Invalid join request");
  }

  await ensureAdminOrOwner(membership.clubId, adminId);

  membership.status = "approved";
  membership.joinedAt = new Date();
  membership.actionBy = adminId;
  await membership.save();

  return res
    .status(200)
    .json(new ApiResponse(200, membership, "Member approved"));
};

/* ======================================================
   REJECT JOIN REQUEST (ADMIN)
====================================================== */
export const rejectJoinRequest = async (req, res) => {
  const { membershipId } = req.params;
  const adminId = req.user._id;

  const membership = await ClubMembership.findById(membershipId);
  if (!membership || membership.status !== "pending") {
    throw new ApiError(404, "Invalid join request");
  }

  await ensureAdminOrOwner(membership.clubId, adminId);

  membership.status = "rejected";
  membership.actionBy = adminId;
  await membership.save();

  return res
    .status(200)
    .json(new ApiResponse(200, membership, "Request rejected"));
};

/* ======================================================
   LEAVE CLUB
====================================================== */
export const leaveClub = async (req, res) => {
  const { clubId } = req.params;
  const userId = req.user._id;

  const membership = await ClubMembership.findOne({
    clubId,
    userId,
    status: "approved",
  });

  if (!membership) {
    throw new ApiError(404, "Not a member of this club");
  }

  if (membership.role === "owner") {
    throw new ApiError(403, "Owner cannot leave the club");
  }

  membership.status = "removed";
  await membership.save();

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Left club successfully"));
};

/* ======================================================
   PROMOTE MEMBER TO ADMIN
====================================================== */
export const promoteToAdmin = async (req, res) => {
  const { membershipId } = req.params;
  const adminId = req.user._id;

  const membership = await ClubMembership.findById(membershipId);
  if (!membership || membership.status !== "approved") {
    throw new ApiError(404, "Invalid member");
  }

  const admin = await ensureAdminOrOwner(membership.clubId, adminId);

  if (admin.role !== "owner") {
    throw new ApiError(403, "Only owner can promote admins");
  }

  membership.role = "admin";
  membership.actionBy = adminId;
  await membership.save();

  return res
    .status(200)
    .json(new ApiResponse(200, membership, "Promoted to admin"));
};

/* ======================================================
   REMOVE ADMIN (OWNER ONLY)
====================================================== */
export const removeAdmin = async (req, res) => {
  const { membershipId } = req.params;
  const ownerId = req.user._id;

  const membership = await ClubMembership.findById(membershipId);
  if (!membership || membership.role !== "admin") {
    throw new ApiError(404, "Admin not found");
  }

  const owner = await ClubMembership.findOne({
    clubId: membership.clubId,
    userId: ownerId,
    role: "owner",
  });

  if (!owner) {
    throw new ApiError(403, "Only owner can remove admin");
  }

  membership.role = "member";
  membership.actionBy = ownerId;
  await membership.save();

  return res
    .status(200)
    .json(new ApiResponse(200, membership, "Admin removed"));
};

/* ======================================================
   REMOVE MEMBER (ADMIN / OWNER)
====================================================== */
export const removeMember = async (req, res) => {
  const { membershipId } = req.params;
  const adminId = req.user._id;

  const membership = await ClubMembership.findById(membershipId);
  if (!membership || membership.status !== "approved") {
    throw new ApiError(404, "Member not found");
  }

  await ensureAdminOrOwner(membership.clubId, adminId);

  if (membership.role === "owner") {
    throw new ApiError(403, "Owner cannot be removed");
  }

  membership.status = "removed";
  membership.actionBy = adminId;
  await membership.save();

  return res.status(200).json(new ApiResponse(200, null, "Member removed"));
};

/* ======================================================
   GET CLUB MEMBERS (AGGREGATION)
====================================================== */
export const getClubMembers = async ({ clubId, page = 1, limit = 20 }) => {
  const skip = (page - 1) * limit;

  return ClubMembership.aggregate([
    {
      $match: {
        clubId: new mongoose.Schema.Types.ObjectId(clubId),
        status: "approved",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $project: {
        role: 1,
        joinedAt: 1,
        "user.password": 0,
        "user.refreshToken": 0,
      },
    },
    { $sort: { joinedAt: -1 } },
    { $skip: skip },
    { $limit: limit },
  ]);
};

/* ======================================================
   GET PENDING JOIN REQUESTS
====================================================== */
export const getPendingJoinRequests = async (clubId) => {
  return ClubMembership.find({
    clubId,
    status: "pending",
  })
    .populate("userId", "username avatar")
    .sort({ createdAt: -1 });
};

/* ======================================================
   COUNT MEMBERS (FAST)
====================================================== */
export const getClubMemberCount = async (clubId) => {
  return ClubMembership.countDocuments({
    clubId,
    status: "approved",
  });
};

/* ======================================================
   CHECK USER ROLE IN CLUB (VERY IMPORTANT)
====================================================== */
export const getUserClubRole = async ({ clubId, userId }) => {
  const membership = await ClubMembership.findOne({
    clubId,
    userId,
  }).select("role status");

  return membership || null;
};

export const getMyClubs = async (req, res) => {
  const userId = req.user._id;

  const memberships = await ClubMembership.find({
    user: userId,
    status: "active",
  })
    .populate("club", "name logo category about")
    .lean();

  const clubs = memberships.map((m) => ({
    clubId: m.club._id,
    name: m.club.name,
    logo: m.club.logo,
    category: m.club.category,
    about: m.club.about,
    role: m.role,
    joinedAt: m.createdAt,
  }));

  return res
    .status(200)
    .json(new ApiResponse(200, clubs, "My clubs fetched successfully"));
};

export const getMyRoleInClub = async (req, res) => {
  const userId = req.user._id;
  const { clubId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(clubId)) {
    throw new ApiError(400, "Invalid club ID");
  }

  const membership = await ClubMembership.findOne({
    user: userId,
    club: clubId,
  }).lean();

  // Not a member
  if (!membership) {
    return res.status(200).json(
      new ApiResponse(200, {
        role: null,
        status: "not_joined",
        canJoin: true,
        canLeave: false,
        isAdmin: false,
      })
    );
  }

  const isAdmin = ["admin", "owner"].includes(membership.role);

  return res.status(200).json(
    new ApiResponse(200, {
      role: membership.role,
      status: membership.status,
      canJoin: false,
      canLeave: membership.status === "active",
      isAdmin,
    })
  );
};
