import mongoose from "mongoose";
import Club from "../../models/club/club.model.js";
 

/**
 * Validate Mongo ObjectId
 */
export const validateObjectId = (param = "id") => {
  return (req, res, next) => {
    if (!mongoose.Types.ObjectId.isValid(req.params[param])) {
      return res.status(400).json({ message: "Invalid ObjectId" });
    }
    next();
  };
};

/**
 * Load club by clubId (insta-like id)
 * Attaches club to req.club
 */
export const loadClubByClubId = async (req, res, next) => {
  try {
    const { clubId } = req.params;

    const club = await Club.findOne({ clubId });
    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    req.club = club;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Load club by Mongo _id
 */
export const loadClubById = async (req, res, next) => {
  try {
    const { clubId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(clubId)) {
      return res.status(400).json({ message: "Invalid club id" });
    }

    const club = await Club.findById(clubId);
    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    req.club = club;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Check if user is club owner
 */
export const isClubOwner = (req, res, next) => {
  if (req.club.ownerId.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: "Only club owner allowed" });
  }
  next();
};

/**
 * Check if user is admin or owner
 */
export const isClubAdmin = (req, res, next) => {
  const userId = req.user._id.toString();

  const isOwner = req.club.ownerId.toString() === userId;
  const isAdmin = req.club.admins.some(
    (id) => id.toString() === userId
  );

  if (!isOwner && !isAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }

  next();
};

/**
 * Check if user is a club member
 */
export const isClubMember = (req, res, next) => {
  const userId = req.user._id.toString();

  const isMember = req.club.members.some(
    (id) => id.toString() === userId
  );

  if (!isMember) {
    return res.status(403).json({ message: "Join the club first" });
  }

  next();
};

/**
 * Prevent duplicate join
 */
export const isNotAlreadyMember = (req, res, next) => {
  const userId = req.user._id.toString();

  if (req.club.members.some(id => id.toString() === userId)) {
    return res.status(409).json({ message: "Already a member" });
  }

  next();
};
