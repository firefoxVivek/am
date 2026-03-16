import mongoose, { Schema } from "mongoose";

const sponsorshipRequestSchema = new Schema(
  {
    seekerType: { type: String, enum: ["Club", "Event"], required: true },
    club:        { type: Schema.Types.ObjectId, ref: "Club", default: null },
    event:       { type: Schema.Types.ObjectId, ref: "Event", default: null },
    createdBy:   { type: Schema.Types.ObjectId, ref: "User", required: true },
    title:       { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    amountNeeded:{ type: Number, required: true, min: 0 },
    amountRaised:{ type: Number, default: 0, min: 0 },
    perks:       [{ type: String, trim: true }],
    deadline:    { type: Date, default: null },
    status:      { type: String, enum: ["open", "closed", "fulfilled"], default: "open" },
    isPublic:    { type: Boolean, default: true },
  },
  { timestamps: true }
);

sponsorshipRequestSchema.pre("validate", function (next) {
  if (!this.club && !this.event) return next(new Error("Either club or event must be specified."));
  if (this.club && this.event)   return next(new Error("Only one of club or event can be specified."));
  next();
});
sponsorshipRequestSchema.index({ club: 1 });
sponsorshipRequestSchema.index({ event: 1 });
sponsorshipRequestSchema.index({ status: 1 });

const sponsorshipOfferSchema = new Schema(
  {
    sponsorType:   { type: String, enum: ["User", "Institution"], required: true },
    user:          { type: Schema.Types.ObjectId, ref: "User", default: null },
    institution:   { type: Schema.Types.ObjectId, ref: "Institution", default: null },
    request:       { type: Schema.Types.ObjectId, ref: "SponsorshipRequest", default: null },
    title:         { type: String, required: true, trim: true },
    description:   { type: String, trim: true },
    amountOffered: { type: Number, required: true, min: 0 },
    terms:         { type: String, trim: true, default: null },
    validUntil:    { type: Date, default: null },
    status:        { type: String, enum: ["open", "withdrawn"], default: "open" },
    isPublic:      { type: Boolean, default: true },
  },
  { timestamps: true }
);

sponsorshipOfferSchema.pre("validate", function (next) {
  if (!this.user && !this.institution) return next(new Error("Either user or institution must be specified."));
  if (this.user && this.institution)   return next(new Error("Only one of user or institution can be specified."));
  next();
});
sponsorshipOfferSchema.index({ user: 1 });
sponsorshipOfferSchema.index({ institution: 1 });
sponsorshipOfferSchema.index({ request: 1 });

const sponsorshipDealSchema = new Schema(
  {
    request:      { type: Schema.Types.ObjectId, ref: "SponsorshipRequest", required: true },
    offer:        { type: Schema.Types.ObjectId, ref: "SponsorshipOffer", required: true },
    agreedAmount: { type: Number, required: true, min: 0 },
    agreedTerms:  { type: String, trim: true, default: null },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "withdrawn"],
      default: "pending",
    },
    initiatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    messages: [
      {
        sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
        text:   { type: String, required: true, trim: true },
        sentAt: { type: Date, default: Date.now },
      },
    ],
    resolvedAt: { type: Date, default: null },

    // Written by payment controller when Razorpay confirms sponsorship payment
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid"],
      default: "unpaid",
    },
  },
  { timestamps: true }
);

sponsorshipDealSchema.index({ request: 1, offer: 1 }, { unique: true });
sponsorshipDealSchema.index({ status: 1 });

export const SponsorshipRequest = mongoose.model("SponsorshipRequest", sponsorshipRequestSchema);
export const SponsorshipOffer   = mongoose.model("SponsorshipOffer",   sponsorshipOfferSchema);
export const SponsorshipDeal    = mongoose.model("SponsorshipDeal",    sponsorshipDealSchema);