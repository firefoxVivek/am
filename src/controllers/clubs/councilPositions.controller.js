import mongoose from "mongoose";
import { Council }         from "../../models/club/council.model.js";
import { CouncilPosition } from "../../models/club/councilPosition.js";
import UserProfile         from "../../models/Profile/profile.model.js";
import { ApiError }        from "../../utils/ApiError.js";
import { ApiResponse }     from "../../utils/ApiResponse.js";
import { asynchandler }    from "../../utils/asynchandler.js";
import { notify }          from "../../utils/notify.js";

/* ── Guards ──────────────────────────────────────────────────────*/

async function ensureCouncilOwner(councilId, userId) {
  const council = await Council.findOne({
    _id:    councilId,
    status: { $ne: "deleted" },
  }).lean();
  if (!council) throw new ApiError(404, "Council not found");
  if (council.owner.id.toString() !== userId.toString()) {
    throw new ApiError(403, "Only the council owner can manage positions");
  }
  return council;
}

/* ================================================================
   CREATE / DEFINE A POSITION + INVITE A USER
   POST /api/v1/councils/:councilId/positions
   Body: { title, description, userId, inviteMessage }

   Creates the position definition AND immediately sends an invite
   to the specified user in a single call. This keeps the API lean —
   positions don't exist without an invited holder.
================================================================ */
export const createPositionAndInvite = asynchandler(async (req, res) => {
  const { councilId }    = req.params;
  const callerUserId     = req.user._id;
  const { title, description = "", userId: inviteeId, inviteMessage = "" } = req.body;

  if (!title?.trim())  throw new ApiError(400, "Position title is required");
  if (!inviteeId)      throw new ApiError(400, "userId (invitee) is required");

  if (!mongoose.Types.ObjectId.isValid(inviteeId)) {
    throw new ApiError(400, "Invalid userId");
  }

  const council = await ensureCouncilOwner(councilId, callerUserId);

  // Can't invite yourself
  if (inviteeId.toString() === callerUserId.toString()) {
    throw new ApiError(400, "You cannot invite yourself to a position");
  }

  // Check that this position title doesn't already have an active holder
  const existingActive = await CouncilPosition.findOne({
    councilId,
    title: title.trim(),
    status: "active",
  }).lean();

  if (existingActive) {
    throw new ApiError(
      409,
      `The position "${title}" already has an active holder. Revoke the current holder first.`
    );
  }

  // Check if this user already has a pending invite for this position
  const pendingInvite = await CouncilPosition.findOne({
    councilId,
    title:  title.trim(),
    userId: inviteeId,
    status: "invited",
  }).lean();

  if (pendingInvite) {
    throw new ApiError(409, "This user already has a pending invite for this position");
  }

  // Get invitee's profile for the snapshot
  const inviteeProfile = await UserProfile.findOne({ userId: inviteeId })
    .select("name imageUrl")
    .lean();

  const position = await CouncilPosition.create({
    councilId,
    title:         title.trim(),
    description:   description.trim(),
    userId:        inviteeId,
    userName:      inviteeProfile?.name ?? "",
    userImage:     inviteeProfile?.imageUrl ?? null,
    invitedBy:     callerUserId,
    inviteMessage: inviteMessage.trim(),
    status:        "invited",
  });

  // Notify the invited user
  await notify({
    recipientId: inviteeId,
    senderId:    callerUserId,
    type:        "COUNCIL_POSITION_INVITE",
    title:       "You've been invited to a council position",
    body:        `${council.councilName} invites you to be their ${title}`,
    payload: {
      screen:     "CouncilPositions",
      entityId:   councilId.toString(),
      actorId:    callerUserId.toString(),
      actorName:  req.user.displayName,
      actorImage: req.user.imageUrl ?? "",
      extra:      { positionId: position._id.toString() },
    },
  });

  return res.status(201).json(
    new ApiResponse(201, position, "Position created and invite sent")
  );
});

/* ================================================================
   GET ALL POSITIONS FOR A COUNCIL  (public)
   GET /api/v1/councils/:councilId/positions?status=active
================================================================ */
export const getCouncilPositions = asynchandler(async (req, res) => {
  const { councilId } = req.params;
  const { status }    = req.query;

  if (!mongoose.Types.ObjectId.isValid(councilId)) {
    throw new ApiError(400, "Invalid council ID");
  }

  const filter = { councilId };
  if (status) filter.status = status;
  else        filter.status = { $in: ["active", "invited"] }; // default: show active + pending

  const positions = await CouncilPosition.find(filter)
    .select("title description userId userName userImage status inviteMessage acceptedAt")
    .sort({ createdAt: 1 })
    .lean();

  return res.status(200).json(
    new ApiResponse(200, { count: positions.length, positions }, "Positions fetched")
  );
});

/* ================================================================
   GET MY PENDING POSITION INVITES  (for the invited user)
   GET /api/v1/councils/positions/my-invites
   Used by the Request Center to show pending council invites.
================================================================ */
export const getMyPositionInvites = asynchandler(async (req, res) => {
  const userId = req.user._id;

  const invites = await CouncilPosition.find({
    userId,
    status: "invited",
  })
    .populate({
      path:   "councilId",
      select: "councilName image institution",
    })
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json(
    new ApiResponse(200, { count: invites.length, invites }, "Pending position invites fetched")
  );
});

/* ================================================================
   ACCEPT A POSITION INVITE
   PATCH /api/v1/councils/positions/:positionId/accept

   The invited user accepts. No council owner action needed.
================================================================ */
export const acceptPositionInvite = asynchandler(async (req, res) => {
  const userId        = req.user._id;
  const { positionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(positionId)) {
    throw new ApiError(400, "Invalid position ID");
  }

  const position = await CouncilPosition.findOne({
    _id:    positionId,
    userId,
    status: "invited",
  }).lean();

  if (!position) throw new ApiError(404, "Invite not found or already acted on");

  // Re-check that no one else activated this position since the invite was sent
  const alreadyActive = await CouncilPosition.findOne({
    councilId: position.councilId,
    title:     position.title,
    status:    "active",
    _id:       { $ne: positionId },
  }).lean();

  if (alreadyActive) {
    throw new ApiError(
      409,
      "This position has already been filled by someone else. Contact the council owner."
    );
  }

  const updated = await CouncilPosition.findByIdAndUpdate(
    positionId,
    { $set: { status: "active", acceptedAt: new Date() } },
    { new: true }
  );

  // Notify council owner
  const council = await Council.findById(position.councilId).lean();
  if (council) {
    await notify({
      recipientId: council.owner.id,
      senderId:    userId,
      type:        "COUNCIL_POSITION_ACCEPTED",
      title:       "Position invite accepted",
      body:        `${req.user.displayName} accepted the ${position.title} role in ${council.councilName}`,
      payload: {
        screen:     "CouncilPositions",
        entityId:   position.councilId.toString(),
        actorId:    userId.toString(),
        actorName:  req.user.displayName,
        actorImage: req.user.imageUrl ?? "",
        extra:      { positionId: positionId.toString() },
      },
    });
  }

  return res.status(200).json(
    new ApiResponse(200, updated, "Position accepted. Welcome to the council!")
  );
});

/* ================================================================
   REJECT A POSITION INVITE
   PATCH /api/v1/councils/positions/:positionId/reject
================================================================ */
export const rejectPositionInvite = asynchandler(async (req, res) => {
  const userId        = req.user._id;
  const { positionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(positionId)) {
    throw new ApiError(400, "Invalid position ID");
  }

  const position = await CouncilPosition.findOne({
    _id:    positionId,
    userId,
    status: "invited",
  }).lean();

  if (!position) throw new ApiError(404, "Invite not found or already acted on");

  await CouncilPosition.findByIdAndUpdate(
    positionId,
    { $set: { status: "rejected", rejectedAt: new Date() } }
  );

  // Notify council owner
  const council = await Council.findById(position.councilId).lean();
  if (council) {
    await notify({
      recipientId: council.owner.id,
      senderId:    userId,
      type:        "COUNCIL_POSITION_REJECTED",
      title:       "Position invite rejected",
      body:        `${req.user.displayName} declined the ${position.title} role`,
      payload: {
        screen:     "CouncilPositions",
        entityId:   position.councilId.toString(),
        actorId:    userId.toString(),
        actorName:  req.user.displayName,
        actorImage: req.user.imageUrl ?? "",
        extra:      { positionId: positionId.toString() },
      },
    });
  }

  return res.status(200).json(
    new ApiResponse(200, {}, "Invite declined")
  );
});

/* ================================================================
   REVOKE A POSITION  (council owner removes someone from a role)
   PATCH /api/v1/councils/:councilId/positions/:positionId/revoke
   Body: { reason }
================================================================ */
export const revokePosition = asynchandler(async (req, res) => {
  const callerUserId   = req.user._id;
  const { councilId, positionId } = req.params;
  const { reason = "" }           = req.body;

  await ensureCouncilOwner(councilId, callerUserId);

  if (!mongoose.Types.ObjectId.isValid(positionId)) {
    throw new ApiError(400, "Invalid position ID");
  }

  const position = await CouncilPosition.findOne({
    _id:       positionId,
    councilId,
    status:    { $in: ["active", "invited"] },
  }).lean();

  if (!position) throw new ApiError(404, "Position not found or already inactive");

  await CouncilPosition.findByIdAndUpdate(
    positionId,
    {
      $set: {
        status:       "revoked",
        revokeReason: reason.trim(),
        revokedAt:    new Date(),
      },
    }
  );

  // Notify the user being revoked
  await notify({
    recipientId: position.userId,
    senderId:    callerUserId,
    type:        "COUNCIL_POSITION_REJECTED",   // closest type — reuse
    title:       "Council position revoked",
    body:        `Your ${position.title} role has been revoked`,
    payload: {
      screen:     "CouncilPositions",
      entityId:   councilId.toString(),
      actorId:    callerUserId.toString(),
      actorName:  req.user.displayName,
      actorImage: req.user.imageUrl ?? "",
      extra:      { positionId: positionId.toString() },
    },
  });

  return res.status(200).json(
    new ApiResponse(200, {}, "Position revoked")
  );
});

/* ================================================================
   RESIGN FROM A POSITION  (position holder voluntarily leaves)
   PATCH /api/v1/councils/positions/:positionId/resign
================================================================ */
export const resignFromPosition = asynchandler(async (req, res) => {
  const userId        = req.user._id;
  const { positionId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(positionId)) {
    throw new ApiError(400, "Invalid position ID");
  }

  const position = await CouncilPosition.findOne({
    _id:    positionId,
    userId,
    status: "active",
  }).lean();

  if (!position) throw new ApiError(404, "Active position not found");

  await CouncilPosition.findByIdAndUpdate(
    positionId,
    { $set: { status: "resigned", resignedAt: new Date() } }
  );

  // Notify council owner
  const council = await Council.findById(position.councilId).lean();
  if (council) {
    await notify({
      recipientId: council.owner.id,
      senderId:    userId,
      type:        "COUNCIL_POSITION_REJECTED",
      title:       "Position resigned",
      body:        `${req.user.displayName} has resigned from the ${position.title} role`,
      payload: {
        screen:     "CouncilPositions",
        entityId:   position.councilId.toString(),
        actorId:    userId.toString(),
        actorName:  req.user.displayName,
        actorImage: req.user.imageUrl ?? "",
        extra:      { positionId: positionId.toString() },
      },
    });
  }

  return res.status(200).json(
    new ApiResponse(200, {}, "You have resigned from the position")
  );
});