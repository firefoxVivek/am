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
 

export const getClubMembersOnly = async (req, res) => {
  try {
    const { clubId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Use aggregate to get both data and total count in one go
    const result = await ClubMembership.aggregate([
      {
        $match: {
          clubId: new mongoose.Types.ObjectId(clubId),
          status: "approved",
          role: "member", // Specifically fetching members only
        },
      },
      {
        $facet: {
          // Branch 1: Get the actual data
          metadata: [{ $count: "total" }],
          data: [
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
                "user._id": 1,
                "user.username": 1,
                "user.profileImage": 1, // Only send necessary fields
                "user.fullName": 1,
              },
            },
            { $sort: { joinedAt: -1 } },
            { $skip: skip },
            { $limit: limit },
          ],
        },
      },
    ]);

    const members = result[0].data;
    const totalCount = result[0].metadata[0]?.total || 0;

    return res.status(200).json({
      success: true,
      data: members,
      pagination: {
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        hasNextPage: page * limit < totalCount,
      },
    });
  } catch (error) {
    console.error("Error fetching club members:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

 
export const getClubAdminsOnly = async (req, res) => {
  try {
    const { clubId } = req.params;

    // We typically don't paginate admins as there are rarely more than 20,
    // but we filter strictly by administrative roles.
    const admins = await ClubMembership.aggregate([
      {
        $match: {
          clubId: new mongoose.Types.ObjectId(clubId),
          status: "approved",
          // Matches anyone who is an admin OR the owner
          role: { $in: ["admin", "owner"] }, 
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
          "user._id": 1,
          "user.username": 1,
          "user.profileImage": 1,
          "user.fullName": 1,
          "user.bio": 1, // Admins often display a bio
        },
      },
      // Sort so Owner appears first, then by join date
      { $sort: { role: 1, joinedAt: 1 } }, 
    ]);

    return res.status(200).json({
      success: true,
      count: admins.length,
      data: admins,
    });
  } catch (error) {
    console.error("Error fetching club admins:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};
/* ======================================================
   GET PENDING JOIN REQUESTS
====================================================== */
 
 
export const getPendingClubJoinRequests = async (req, res) => {
  try {
    const { clubId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(clubId)) {
      return res.status(400).json({
        message: "Invalid clubId",
      });
    }

    /**
     * 1️⃣ Check if requester is owner or admin of the club
     */
    const requesterMembership = await ClubMembership.findOne({
      clubId,
      userId,
      status: "approved",
      role: { $in: ["owner", "admin"] },
    }).select("_id role");

    if (!requesterMembership) {
      return res.status(403).json({
        message: "You are not authorized to view join requests",
      });
    }

    /**
     * 2️⃣ Fetch pending join requests
     */
    const pendingRequests = await ClubMembership.find({
      clubId,
      status: "pending",
    })
      .populate("userId", "username avatar")
      .select(
        "userId requestedAt createdAt"
      )
      .sort({ createdAt: -1 })
      .lean();

    /**
     * 3️⃣ Response
     */
    return res.status(200).json({
      count: pendingRequests.length,
      data: pendingRequests,
    });
  } catch (error) {
    console.error("Error fetching pending join requests:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
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
