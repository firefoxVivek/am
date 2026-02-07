import mongoose from "mongoose";

const clubMembershipSchema = new mongoose.Schema(
  {
    clubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Club",
      required: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    role: {
      type: String,
      enum: ["owner", "admin", "member"],
      default: "member",
      index: true,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "removed"],
      default: "pending",
      index: true,
    },

    requestedAt: {
      type: Date,
    },

    joinedAt: {
      type: Date,
    },

    rejectedAt: {
      type: Date,
    },

    removedAt: {
      type: Date,
    },

    actionBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    removalReason: {
      type: String,
      trim: true,
      maxlength: 300,
    },

    isOwnerLocked: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

clubMembershipSchema.index({ clubId: 1, userId: 1 }, { unique: true });

clubMembershipSchema.index({ userId: 1, status: 1, role: 1 });
clubMembershipSchema.index({ clubId: 1, role: 1 });
clubMembershipSchema.index({ userId: 1, status: 1 });

clubMembershipSchema.pre("save", function (next) {
  if (this.role === "owner") {
    this.isOwnerLocked = true;
    this.status = "approved";
  }
  next();
});

export const ClubMembership = mongoose.model(
  "ClubMembership",
  clubMembershipSchema
);
