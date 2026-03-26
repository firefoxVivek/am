import mongoose from "mongoose";

const postSchema = new mongoose.Schema(
  {

    clubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Club",
      required: true,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    title: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    content: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: ["Announcement", "Update", "Felicitation"],
      required: true,
      index: true,
    },


    taggedUsers: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        name: {
          type: String,
          required: true,
          trim: true,
        },
      },
    ],

    publishAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    expireAt: {
      type: Date,
      default: null,
    },


    isEdited: {
      type: Boolean,
      default: false,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);


postSchema.index({ clubId: 1, publishAt: -1 });


postSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

postSchema.pre("save", function (next) {
  this._wasNew = this.isNew;
  next();
});

postSchema.post("save", async function (doc) {
  if (!doc._wasNew) return;

  const UserProfile = mongoose.model("UserProfile");

  await UserProfile.findOneAndUpdate(
    { userId: doc.createdBy },
    { $inc: { totalPosts: 1 } }
  ).catch((e) => console.error("[ClubPost hook] totalPosts inc failed:", e.message));
});

postSchema.post("findOneAndDelete", async function (doc) {
   if (!doc || doc.isDeleted) return; 

  const UserProfile = mongoose.model("UserProfile");

  await UserProfile.findOneAndUpdate(
    { userId: doc.createdBy, totalPosts: { $gt: 0 } },
    { $inc: { totalPosts: -1 } }
  ).catch((e) => console.error("[ClubPost hook] totalPosts dec failed:", e.message));
});

export const ClubPost = mongoose.model("ClubPost", postSchema);