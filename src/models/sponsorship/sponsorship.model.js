import mongoose, { Schema } from "mongoose";

/**
 * SponsorshipRequest — created by a Club or Event seeking sponsors
 */
const sponsorshipRequestSchema = new Schema(
  {
    // Who is seeking sponsorship
    seekerType: {
      type: String,
      enum: ["Club", "Event"],
      required: true,
    },
    club: {
      type: Schema.Types.ObjectId,
      ref: "Club",
      default: null,
    },
    event: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      default: null,
    },

    // The member creating this request (must belong to the club/event)
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },

    // Financial details
    amountNeeded: {
      type: Number,
      required: true,
      min: 0,
    },
    amountRaised: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Benefits offered to sponsors
    perks: [
      {
        type: String,
        trim: true,
      },
    ],

    // Deadline to receive sponsorships
    deadline: {
      type: Date,
      default: null,
    },

    // open → accepting offers | closed → no longer accepting | fulfilled → fully funded
    status: {
      type: String,
      enum: ["open", "closed", "fulfilled"],
      default: "open",
    },

    // Visibility
    isPublic: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Ensure at least one of club/event is set
sponsorshipRequestSchema.pre("validate", function (next) {
  if (!this.club && !this.event) {
    return next(new Error("Either club or event must be specified."));
  }
  if (this.club && this.event) {
    return next(new Error("Only one of club or event can be specified."));
  }
  next();
});

sponsorshipRequestSchema.index({ club: 1 });
sponsorshipRequestSchema.index({ event: 1 });
sponsorshipRequestSchema.index({ status: 1 });

/**
 * SponsorshipOffer — created by a User or Institution willing to sponsor
 */
const sponsorshipOfferSchema = new Schema(
  {
    // Who is offering
    sponsorType: {
      type: String,
      enum: ["User", "Institution"],
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    institution: {
      type: Schema.Types.ObjectId,
      ref: "Institution",
      default: null,
    },

    // Optional: directly target a specific request; null = open offer
    request: {
      type: Schema.Types.ObjectId,
      ref: "SponsorshipRequest",
      default: null,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },

    amountOffered: {
      type: Number,
      required: true,
      min: 0,
    },

    // Conditions the sponsor attaches
    terms: {
      type: String,
      trim: true,
      default: null,
    },

    // Expiry of this standing offer
    validUntil: {
      type: Date,
      default: null,
    },

    // open → standing offer | withdrawn → sponsor pulled back
    status: {
      type: String,
      enum: ["open", "withdrawn"],
      default: "open",
    },

    isPublic: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

sponsorshipOfferSchema.pre("validate", function (next) {
  if (!this.user && !this.institution) {
    return next(new Error("Either user or institution must be specified."));
  }
  if (this.user && this.institution) {
    return next(new Error("Only one of user or institution can be specified."));
  }
  next();
});

sponsorshipOfferSchema.index({ user: 1 });
sponsorshipOfferSchema.index({ institution: 1 });
sponsorshipOfferSchema.index({ request: 1 });

/**
 * SponsorshipDeal — created when a request and an offer are matched/connected
 * Lifecycle: pending → accepted | rejected | withdrawn
 */
const sponsorshipDealSchema = new Schema(
  {
    request: {
      type: Schema.Types.ObjectId,
      ref: "SponsorshipRequest",
      required: true,
    },
    offer: {
      type: Schema.Types.ObjectId,
      ref: "SponsorshipOffer",
      required: true,
    },

    // Agreed amount for this specific deal (may differ from offer)
    agreedAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Agreed terms for this specific deal
    agreedTerms: {
      type: String,
      trim: true,
      default: null,
    },

    // pending  → awaiting acceptance by request owner
    // accepted → both sides agreed
    // rejected → request owner rejected
    // withdrawn→ either side withdrew after acceptance
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "withdrawn"],
      default: "pending",
    },

    // Who initiated this connection (offer side contacts request side)
    initiatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Message thread for negotiation
    messages: [
      {
        sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
        text: { type: String, required: true, trim: true },
        sentAt: { type: Date, default: Date.now },
      },
    ],

    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

sponsorshipDealSchema.index({ request: 1, offer: 1 }, { unique: true });
sponsorshipDealSchema.index({ status: 1 });

export const SponsorshipRequest = mongoose.model(
  "SponsorshipRequest",
  sponsorshipRequestSchema
);
export const SponsorshipOffer = mongoose.model(
  "SponsorshipOffer",
  sponsorshipOfferSchema
);
export const SponsorshipDeal = mongoose.model(
  "SponsorshipDeal",
  sponsorshipDealSchema
);