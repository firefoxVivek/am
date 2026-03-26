import mongoose, { Schema } from "mongoose";
import jwt   from "jsonwebtoken";
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
      enum: ["user", "institution", "admin"],
      default: "user",
      index: true,
    },

    lastLoginAt: {
      type: Date,
    },

    /* ---------------------------------------------------------------
       SINGLE DEVICE TOKEN
       One FCM token per user — the most recent device only.
       When user logs in on a new device the old token is overwritten
       and the Subscription registry is updated with the new token.
    --------------------------------------------------------------- */
    deviceToken: {
      type: String,
      default: null,
    },

    /* ---------------------------------------------------------------
       FOLLOWED INSTITUTIONS
       Array of institution ObjectIds the user follows.
       Used by feed controller for institution post discovery.
       Also used by subscribeToInstitution / unsubscribeFromInstitution.
    --------------------------------------------------------------- */
    followedInstitutions: {
      type: [{ type: Schema.Types.ObjectId, ref: "Institution" }],
      default: [],
    },

    /* ---------------------------------------------------------------
       PREMIUM
       isPremium: true once a premium payment is confirmed.
       premiumExpiry: null = lifetime plan, Date = monthly/yearly expiry.
       Always check: isPremium && (premiumExpiry === null || premiumExpiry > Date.now())
    --------------------------------------------------------------- */
    isPremium: {
      type: Boolean,
      default: false,
      index: true,
    },

    premiumExpiry: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

/* ---------------------------------------------------------------
   HOOKS
--------------------------------------------------------------- */

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

/* ---------------------------------------------------------------
   METHODS
--------------------------------------------------------------- */

userSchema.methods.isPasswordCorrect = async function (password) {
  return bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id:               this._id,
      email:             this.email,
      username:          this.username,
      displayName:       this.displayName,
      role:              this.role,
      status:            this.status,
      isProfileComplete: this.isProfileComplete,
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "15m" }
  );
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { _id: this._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d" }
  );
};

export const User = mongoose.model("User", userSchema);
export default User;