import mongoose, { Schema } from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    username: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      sparse: true,
      index: true,
    },

    displayName: {
      type: String,
      trim: true,
      index: true,
    },

    // ✅ ONLY ADDITION
    imageUrl: {
      type: String,
      default: "",
    },

    password: {
      type: String,
      required: true,
    },

    refreshToken: {
      type: String,
    },

    status: {
      type: String,
      enum: ["pending", "registered", "blocked"],
      default: "pending",
      index: true,
    },

    isProfileComplete: {
      type: Boolean,
      default: false,
      index: true,
    },

    role: {
      type: String,
      enum: ["user", "club", "institution", "admin"],
      default: "user",
      index: true,
    },

    lastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

 
// 🔐 Hash password before save
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

/* -------------------------------------------------------------------------- */
/*                                METHODS                                     */
/* -------------------------------------------------------------------------- */

// 🔍 Compare password
userSchema.methods.isPasswordCorrect = async function (password) {
  return bcrypt.compare(password, this.password);
};

/**
 * 🚀 Generate Access Token
 * Stateless: includes all needed user info for authorization
 */
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      username: this.username,
      displayName: this.displayName,
      role: this.role,
      status: this.status,
      isProfileComplete: this.isProfileComplete,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "15m",
    }
  );
};

/**
 * 🔁 Generate Refresh Token
 */
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d",
    }
  );
};

/* -------------------------------------------------------------------------- */

export const User = mongoose.model("User", userSchema);
export default User;
