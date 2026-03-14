import mongoose from "mongoose";
import { Council }               from "../../models/club/council.model.js";
import { CouncilClubMembership } from "../../models/connections/councilClubMembership.js";
import { Club }                  from "../../models/club/club.model.js";
import { ClubMembership }        from "../../models/connections/userToClub.model.js";
import { ApiError }              from "../../utils/ApiError.js";
import { ApiResponse }           from "../../utils/ApiResponse.js";
import { asynchandler }          from "../../utils/asynchandler.js";
import { notify }                from "../../utils/notify.js";

/* ── Guards ──────────────────────────────────────────────────────*/

// Verify the caller is owner of the council
async function ensureCouncilOwner(councilId, userId) {
  const council = await Council.findOne({
    _id:    councilId,
    status: { $ne: "deleted" },
  }).lean();
  if (!council) throw new ApiError(404, "Council not found");
  if (council.owner.id.toString() !== userId.toString()) {
    throw new ApiError(403, "Only the council owner can perform this action");
  }
  return council;
}

// Verify the caller is owner or admin of the club
async function ensureClubAdmin(clubId, userId) {
  const membership = await ClubMembership.findOne({
    clubId,
    userId,
    status: "approved",
    role:   { $in: ["owner", "admin"] },
  }).lean();
  if (!membership) {
    throw new ApiError(403, "You must be an owner or admin of this club");
  }
  return membership;
}

/* ================================================================
   COUNCIL INVITES A CLUB
   POST /api/v1/councils/:councilId/clubs/invite
   Body: { clubId }

   Council owner reaches out to a club. Club admin must accept.
================================================================ */
export const inviteClubToCouncil = asynchandler(async (req, res) => {
  const userId     = req.user._id;
  const { councilId } = req.params;
  const { clubId }    = req.body;

  if (!clubId) throw new ApiError(400, "clubId is required");

  const [council, club] = await Promise.all([
    ensureCouncilOwner(councilId, userId),
    Club.findOne({ _id: clubId, status: "active" }).lean(),
  ]);

  if (!club) throw new ApiError(404, "Club not found");

  // Check if a relationship already exists
  const existing = await CouncilClubMembership.findOne({ councilId, clubId }).lean();

  if (existing) {
    if (existing.status === "approved") {
      throw new ApiError(409, "Club is already a member of this council");
    }
    if (existing.status === "invited") {
      throw new ApiError(409, "An invite is already pending for this club");
    }
    if (existing.status === "requested") {
      // Club already requested to join — council accepting = approve
      const approved = await CouncilClubMembership.findOneAndUpdate(
        { _id: existing._id },
        {
          $set: {
            status:     "approved",
            actionBy:   userId,
            approvedAt: new Date(),
          },
        },
        { new: true }
      );

      // Update Club's council snapshot
      await Club.findByIdAndUpdate(clubId, {
        $set: {
          "council.id":   council._id,
          "council.name": council.councilName,
        },
      });

      return res.status(200).json(
        new ApiResponse(200, approved, "Club request approved — club is now a council member")
      );
    }
  }

  // Create new invite
  const membership = await CouncilClubMembership.create({
    councilId,
    clubId,
    initiatedBy: "council",
    status:      "invited",
    actionBy:    userId,
  });

  // Notify club owner
  const clubOwnerMembership = await ClubMembership.findOne({
    clubId,
    role:   "owner",
    status: "approved",
  }).lean();

  if (clubOwnerMembership) {
    await notify({
      recipientId: clubOwnerMembership.userId,
      senderId:    userId,
      type:        "COUNCIL_CLUB_REQUEST",
      title:       "Council membership invite",
      body:        `${council.councilName} has invited your club to join their council`,
      payload: {
        screen:     "CouncilDetail",
        entityId:   council._id.toString(),
        actorId:    userId.toString(),
        actorName:  req.user.displayName,
        actorImage: req.user.imageUrl ?? "",
        extra:      { clubId: clubId.toString() },
      },
    });
  }

  return res.status(201).json(
    new ApiResponse(201, membership, "Club invited to council")
  );
});

/* ================================================================
   CLUB REQUESTS TO JOIN A COUNCIL
   POST /api/v1/councils/:councilId/clubs/request
   Body: { clubId }

   Club admin reaches out to a council. Council owner must accept.
================================================================ */
export const requestToJoinCouncil = asynchandler(async (req, res) => {
  const userId     = req.user._id;
  const { councilId } = req.params;
  const { clubId }    = req.body;

  if (!clubId) throw new ApiError(400, "clubId is required");

  const [council, club] = await Promise.all([
    Council.findOne({ _id: councilId, status: "active" }).lean(),
    Club.findOne({ _id: clubId, status: "active" }).lean(),
  ]);

  if (!council) throw new ApiError(404, "Council not found");
  if (!club)    throw new ApiError(404, "Club not found");

  // Verify caller is club admin/owner
  await ensureClubAdmin(clubId, userId);

  const existing = await CouncilClubMembership.findOne({ councilId, clubId }).lean();

  if (existing) {
    if (existing.status === "approved") {
      throw new ApiError(409, "Club is already a member of this council");
    }
    if (existing.status === "requested") {
      throw new ApiError(409, "A request is already pending");
    }
    if (existing.status === "invited") {
      // Council already invited this club — club requesting = accept
      const approved = await CouncilClubMembership.findOneAndUpdate(
        { _id: existing._id },
        {
          $set: {
            status:     "approved",
            actionBy:   userId,
            approvedAt: new Date(),
          },
        },
        { new: true }
      );

      await Club.findByIdAndUpdate(clubId, {
        $set: {
          "council.id":   council._id,
          "council.name": council.councilName,
        },
      });

      return res.status(200).json(
        new ApiResponse(200, approved, "Council invite accepted — club is now a council member")
      );
    }
  }

  const membership = await CouncilClubMembership.create({
    councilId,
    clubId,
    initiatedBy: "club",
    status:      "requested",
    actionBy:    userId,
  });

  // Notify council owner
  await notify({
    recipientId: council.owner.id,
    senderId:    userId,
    type:        "COUNCIL_CLUB_REQUEST",
    title:       "Club wants to join your council",
    body:        `${club.clubName ?? "A club"} has requested to join ${council.councilName}`,
    payload: {
      screen:     "CouncilDetail",
      entityId:   council._id.toString(),
      actorId:    userId.toString(),
      actorName:  req.user.displayName,
      actorImage: req.user.imageUrl ?? "",
      extra:      { clubId: clubId.toString() },
    },
  });

  return res.status(201).json(
    new ApiResponse(201, membership, "Join request sent to council")
  );
});

/* ================================================================
   APPROVE A CLUB REQUEST  (council owner accepts a club's request)
   PATCH /api/v1/councils/:councilId/clubs/:membershipId/approve
================================================================ */
export const approveClubRequest = asynchandler(async (req, res) => {
  const userId       = req.user._id;
  const { councilId, membershipId } = req.params;

  const council = await ensureCouncilOwner(councilId, userId);

  const membership = await CouncilClubMembership.findOne({
    _id:       membershipId,
    councilId,
    status:    "requested",
  }).lean();

  if (!membership) throw new ApiError(404, "Pending request not found");

  const approved = await CouncilClubMembership.findByIdAndUpdate(
    membershipId,
    {
      $set: {
        status:     "approved",
        actionBy:   userId,
        approvedAt: new Date(),
      },
    },
    { new: true }
  );

  // Update Club's council snapshot
  await Club.findByIdAndUpdate(membership.clubId, {
    $set: {
      "council.id":   council._id,
      "council.name": council.councilName,
    },
  });

  // Notify club owner
  const clubOwnerMembership = await ClubMembership.findOne({
    clubId: membership.clubId,
    role:   "owner",
    status: "approved",
  }).lean();

  if (clubOwnerMembership) {
    await notify({
      recipientId: clubOwnerMembership.userId,
      senderId:    userId,
      type:        "COUNCIL_CLUB_ACCEPTED",
      title:       "Council request approved",
      body:        `Your club has been accepted into ${council.councilName}`,
      payload: {
        screen:     "CouncilDetail",
        entityId:   council._id.toString(),
        actorId:    userId.toString(),
        actorName:  req.user.displayName,
        actorImage: req.user.imageUrl ?? "",
        extra:      { clubId: membership.clubId.toString() },
      },
    });
  }

  return res.status(200).json(
    new ApiResponse(200, approved, "Club request approved")
  );
});

/* ================================================================
   REJECT A CLUB REQUEST
   PATCH /api/v1/councils/:councilId/clubs/:membershipId/reject
================================================================ */
export const rejectClubRequest = asynchandler(async (req, res) => {
  const userId       = req.user._id;
  const { councilId, membershipId } = req.params;

  const council = await ensureCouncilOwner(councilId, userId);

  const membership = await CouncilClubMembership.findOne({
    _id:      membershipId,
    councilId,
    status:   { $in: ["requested", "invited"] },
  }).lean();

  if (!membership) throw new ApiError(404, "Pending membership not found");

  const rejected = await CouncilClubMembership.findByIdAndUpdate(
    membershipId,
    {
      $set: {
        status:     "rejected",
        actionBy:   userId,
        rejectedAt: new Date(),
      },
    },
    { new: true }
  );

  // Notify club owner if we rejected their request
  if (membership.initiatedBy === "club") {
    const clubOwnerMembership = await ClubMembership.findOne({
      clubId: membership.clubId,
      role:   "owner",
      status: "approved",
    }).lean();

    if (clubOwnerMembership) {
      await notify({
        recipientId: clubOwnerMembership.userId,
        senderId:    userId,
        type:        "COUNCIL_CLUB_REJECTED",
        title:       "Council request rejected",
        body:        `Your request to join ${council.councilName} was not approved`,
        payload: {
          screen:     "CouncilDetail",
          entityId:   council._id.toString(),
          actorId:    userId.toString(),
          actorName:  req.user.displayName,
          actorImage: req.user.imageUrl ?? "",
          extra:      { clubId: membership.clubId.toString() },
        },
      });
    }
  }

  return res.status(200).json(
    new ApiResponse(200, rejected, "Membership rejected")
  );
});

/* ================================================================
   REMOVE A CLUB FROM COUNCIL
   DELETE /api/v1/councils/:councilId/clubs/:clubId
================================================================ */
export const removeClubFromCouncil = asynchandler(async (req, res) => {
  const userId     = req.user._id;
  const { councilId, clubId } = req.params;

  const council = await ensureCouncilOwner(councilId, userId);

  const membership = await CouncilClubMembership.findOneAndUpdate(
    { councilId, clubId, status: "approved" },
    {
      $set: {
        status:    "removed",
        actionBy:  userId,
        removedAt: new Date(),
      },
    },
    { new: true }
  );

  if (!membership) throw new ApiError(404, "Club is not a member of this council");

  // Clear council snapshot from Club
  await Club.findByIdAndUpdate(clubId, {
    $set: { "council.id": null, "council.name": null },
  });

  return res.status(200).json(
    new ApiResponse(200, {}, "Club removed from council")
  );
});

/* ================================================================
   CLUB LEAVES COUNCIL  (club admin voluntarily leaves)
   DELETE /api/v1/councils/:councilId/clubs/:clubId/leave
================================================================ */
export const leaveCouncil = asynchandler(async (req, res) => {
  const userId     = req.user._id;
  const { councilId, clubId } = req.params;

  await ensureClubAdmin(clubId, userId);

  const membership = await CouncilClubMembership.findOneAndUpdate(
    { councilId, clubId, status: "approved" },
    {
      $set: {
        status:    "removed",
        actionBy:  userId,
        removedAt: new Date(),
      },
    },
    { new: true }
  );

  if (!membership) throw new ApiError(404, "Your club is not a member of this council");

  await Club.findByIdAndUpdate(clubId, {
    $set: { "council.id": null, "council.name": null },
  });

  return res.status(200).json(
    new ApiResponse(200, {}, "Club left the council")
  );
});

/* ================================================================
   GET CLUBS IN COUNCIL  (public)
   GET /api/v1/councils/:councilId/clubs?status=approved
================================================================ */
export const getCouncilClubs = asynchandler(async (req, res) => {
  const { councilId }    = req.params;
  const { status = "approved", page = 1, limit = 20 } = req.query;

  const pageNumber = Math.max(parseInt(page, 10), 1);
  const pageLimit  = Math.min(parseInt(limit, 10), 50);
  const skip       = (pageNumber - 1) * pageLimit;

  if (!mongoose.Types.ObjectId.isValid(councilId)) {
    throw new ApiError(400, "Invalid council ID");
  }

  const filter = {
    councilId,
    status: ["approved", "invited", "requested"].includes(status) ? status : "approved",
  };

  const [memberships, total] = await Promise.all([
    CouncilClubMembership.find(filter)
      .populate({
        path:   "clubId",
        select: "clubId clubName image about membersCount privacy status",
        match:  { status: "active" },
      })
      .skip(skip)
      .limit(pageLimit)
      .lean(),
    CouncilClubMembership.countDocuments(filter),
  ]);

  // Filter out any populated clubs that didn't match (deleted etc.)
  const clubs = memberships.filter((m) => m.clubId !== null);

  return res.status(200).json(
    new ApiResponse(200, {
      total,
      clubs,
      pagination: {
        page:        pageNumber,
        limit:       pageLimit,
        totalPages:  Math.ceil(total / pageLimit),
        hasNextPage: skip + clubs.length < total,
      },
    }, "Council clubs fetched")
  );
});

/* ================================================================
   GET PENDING REQUESTS  (council owner only)
   GET /api/v1/councils/:councilId/clubs/pending
================================================================ */
export const getPendingClubRequests = asynchandler(async (req, res) => {
  const { councilId } = req.params;

  await ensureCouncilOwner(councilId, req.user._id);

  const pending = await CouncilClubMembership.find({
    councilId,
    status: { $in: ["requested", "invited"] },
  })
    .populate({
      path:   "clubId",
      select: "clubId clubName image membersCount",
    })
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json(
    new ApiResponse(200, { count: pending.length, requests: pending }, "Pending requests fetched")
  );
});