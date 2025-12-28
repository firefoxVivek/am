// models/userProfile.model.js
import mongoose from "mongoose";

const UserProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    about: {
      type: String,
      maxlength: 1000,
      default: "",
    },

    hobbies: {
      type: [String],
      default: [],
    },

    imageUrl: {
      type: String,
      default: null,
    },

    experiences: [
      {
        title: String,
        organization: String,
        startDate: Date,
        endDate: Date,
        description: String,
      },
    ],

    userTypeMeta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

export const UserProfile = mongoose.model(
  "UserProfile",
  UserProfileSchema
);
export default UserProfile;