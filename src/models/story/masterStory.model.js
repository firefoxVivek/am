import mongoose from "mongoose";
import { BlockBaseSchema } from "./block.model.js";

const StorySchema = new mongoose.Schema(
  {
    title: {
      type:     String,
      required: [true, "Title is required"],
      trim:     true,
    },
    image: {
      type:    String,
      trim:    true,
      default: null,
    },
    // NOTE: author field is `userId` (not `createdBy` like ClubPost).
    // The post-hooks below use doc.userId — do not change this.
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
      index:    true,
    },
    clubId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Club",
      required: true,
    },
    blocks: {
      type:    [BlockBaseSchema],
      default: [],
    },
  },
  { timestamps: true }
);

StorySchema.index({ userId: 1, createdAt: -1 });
StorySchema.index({ clubId: 1, createdAt: -1 });

/* ---------------------------------------------------------------
   POST-HOOKS — keep UserProfile.totalPosts in sync

   WHY THIS WAS BROKEN:
   The ClubPost model has identical hooks using doc.createdBy.
   This model had NO hooks at all, so story.save() never touched
   UserProfile. Also, this model's author field is `userId`, not
   `createdBy` — using the wrong field would silently match nothing.
--------------------------------------------------------------- */

// Flag whether this save() call is a brand-new document
StorySchema.pre("save", function (next) {
  this._wasNew = this.isNew;
  next();
});

// On new story: increment totalPosts on the author's UserProfile
StorySchema.post("save", async function (doc) {
  if (!doc._wasNew) return; // edits don't count

  const UserProfile = mongoose.model("UserProfile");

  await UserProfile.findOneAndUpdate(
    { userId: doc.userId },           // <-- userId, NOT createdBy
    { $inc: { totalPosts: 1 } }
  ).catch((e) =>
    console.error("[Story hook] totalPosts increment failed:", e.message)
  );
});

// On hard-delete: decrement (floor at 0)
StorySchema.post("findOneAndDelete", async function (doc) {
  if (!doc) return;

  const UserProfile = mongoose.model("UserProfile");

  await UserProfile.findOneAndUpdate(
    { userId: doc.userId, totalPosts: { $gt: 0 } },
    { $inc: { totalPosts: -1 } }
  ).catch((e) =>
    console.error("[Story hook] totalPosts decrement failed:", e.message)
  );
});

export const Story = mongoose.model("Story", StorySchema);
export default Story;