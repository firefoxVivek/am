import mongoose from "mongoose";

/*
 * COUNCIL CLUB MEMBERSHIP MODEL
 * ──────────────────────────────────────────────────────────────────
 * Tracks the relationship between a Council and its member Clubs.
 * Mirrors the pattern of ClubMembership (user↔club) but for club↔council.
 *
 * FLOWS:
 *   Council invites a club  →  status: "invited"   (council initiates)
 *   Club requests to join   →  status: "requested"  (club initiates)
 *   Either side accepts     →  status: "approved"
 *   Either side rejects/removes → status: "rejected" / "removed"
 *
 * WHO CAN DO WHAT:
 *   Council owner/admin  → invite clubs, approve club requests, remove clubs
 *   Club owner/admin     → request to join, accept council invite, leave council
 */

const CouncilClubMembershipSchema = new mongoose.Schema(
  {
    councilId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Council",
      required: true,
      index:    true,
    },

    clubId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Club",
      required: true,
      index:    true,
    },

    // Who initiated the relationship
    initiatedBy: {
      type: String,
      enum: ["council", "club"],
      required: true,
    },

    status: {
      type:  String,
      enum:  ["invited", "requested", "approved", "rejected", "removed"],
      default: "requested",
      index: true,
    },

    // The user who performed the last action (approve/reject/remove)
    actionBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
    },

    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    removedAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

/* ── Indexes ──────────────────────────────────────────────────────*/

// One membership per council-club pair
CouncilClubMembershipSchema.index(
  { councilId: 1, clubId: 1 },
  { unique: true }
);

CouncilClubMembershipSchema.index({ councilId: 1, status: 1 });
CouncilClubMembershipSchema.index({ clubId: 1, status: 1 });

/* ── Hooks — keep Council.clubsCount in sync ──────────────────────*/

CouncilClubMembershipSchema.post("save", async function (doc) {
  // Only fire when status just became "approved"
  if (doc.status !== "approved") return;

  const Council = mongoose.model("Council");
  await Council.findByIdAndUpdate(doc.councilId, { $inc: { clubsCount: 1 } })
    .catch((e) => console.error("[CouncilClubMembership hook] inc error:", e.message));
});

CouncilClubMembershipSchema.post("findOneAndUpdate", async function (doc) {
  if (!doc) return;

  const Council = mongoose.model("Council");

  if (doc.status === "removed" || doc.status === "rejected") {
    // Only decrement if it was previously approved (clubsCount only counts approved)
    await Council.findByIdAndUpdate(
      doc.councilId,
      [{ $set: { clubsCount: { $max: [0, { $subtract: ["$clubsCount", 1] }] } } }]
    ).catch((e) => console.error("[CouncilClubMembership hook] dec error:", e.message));
  }
});

export const CouncilClubMembership = mongoose.model(
  "CouncilClubMembership",
  CouncilClubMembershipSchema
);
export default CouncilClubMembership;