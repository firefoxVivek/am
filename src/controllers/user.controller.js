import { asynchandler } from "../utils/asynchandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/Profile/user.models.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
 
import jwt from "jsonwebtoken";
import otpModel from "../models/otp.model.js";
import { signupOtpEmail } from "../email/sendEmail.js";
const generateAccessAndRefereshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating referesh and access token"
    );
  }
};

export const registerUser = async (req, res) => {
  const { email, password, role } = req.body;

  /* ---------------- Validation ---------------- */
  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  if ([email, password].some((f) => f.trim() === "")) {
    throw new ApiError(400, "Fields cannot be empty");
  }

  /* ---------------- Check existing auth user ---------------- */
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    throw new ApiError(409, "User with this email already exists");
  }

  /* ---------------- Create Auth User ---------------- */
  const authUser = await User.create({
    email,
    password,
    role: role || "student",
    status: "pending",
  });

  /* ---------------- Generate OTP ---------------- */
  const otp = generateNumericOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await otpModel.create({
    email,
    otp,
    expiresAt,
  });

  await signupOtpEmail(email, "OTP for Email Verification", otp);

  /* ---------------- Response ---------------- */
  return res.status(201).json(
    new ApiResponse(
      201,
      {
        userId: authUser._id,
        email: authUser.email,
        role: authUser.role,
        status: authUser.status,
      },
      "Registration successful. Please verify OTP."
    )
  );
};

  const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  /* ---------------- Validation ---------------- */
  if (!email || !otp) {
    throw new ApiError(400, "Email and OTP are required");
  }

  /* ---------------- Find OTP ---------------- */
  const otpRecord = await otpModel.findOne({ email });

  if (!otpRecord) {
    throw new ApiError(404, "OTP has expired or does not exist");
  }

  if (otpRecord.expiresAt < new Date()) {
    await otpModel.deleteOne({ _id: otpRecord._id });
    throw new ApiError(410, "OTP has expired");
  }

  if (otpRecord.otp !== otp) {
    throw new ApiError(403, "Invalid OTP");
  }

  /* ---------------- Find Auth User ---------------- */
  const authUser = await  User.findOne({ email });

  if (!authUser) {
    throw new ApiError(404, "User not found");
  }

  /* ---------------- Update Status ---------------- */
  if (authUser.status !== "registered") {
    authUser.status = "registered";
    await authUser.save();
  }

  /* ---------------- Cleanup OTP ---------------- */
  await otpModel.deleteOne({ _id: otpRecord._id });

  /* ---------------- Response ---------------- */
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        userId: authUser._id,
        email: authUser.email,
        status: authUser.status,
      },
      "OTP verified successfully"
    )
  );
};

const resendOtp = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    throw new ApiError(402, "Email is required");
  }
  const userResult = await User.findOne({ email: email });
  if (!userResult) {
    throw new ApiError(404, "User not found");
  }
  const otp = generateNumericOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const otpObj = { email, otp, expiresAt };
  await otpModel.create(otpObj);
  await signupOtpEmail(email, "OTP for Email Verification", otp);
  return res.status(200).json(new ApiResponse(200, "OTP resent successfully"));
};

  const loginUser = asynchandler(async (req, res) => {
  const { email, password } = req.body;

  /* ---------------- Validation ---------------- */
  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  /* ---------------- Find Auth User ---------------- */
  const authUser = await  User.findOne({ email }).select("+password");

  if (!authUser) {
    throw new ApiError(404, "User does not exist");
  }

  /* ---------------- Status Check ---------------- */
  if (authUser.status !== "registered") {
    throw new ApiError(403, "Please verify your email before logging in");
  }

  /* ---------------- Password Check ---------------- */
  const isPasswordValid = await authUser.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid credentials");
  }

  /* ---------------- Generate Tokens ---------------- */
  const accessToken = authUser.generateAccessToken();
  const refreshToken = authUser.generateRefreshToken();

  authUser.refreshToken = refreshToken;
  authUser.lastLoginAt = new Date();
  await authUser.save();

  /* ---------------- Cookies ---------------- */
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  };

  /* ---------------- Response ---------------- */
  return res
    .status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(
      new ApiResponse(
        200,
        {
          user: {
            _id: authUser._id,
            email: authUser.email,
            role: authUser.role,
            status: authUser.status,
          },
          accessToken,
          refreshToken,
        },
        "Login successful"
      )
    );
});

const getAllUsers = asynchandler(async (req, res) => {
  try {
    const users = await User.find();
    if (!users) {
      res.status(404).json({ error: "No Users Found" });
    }
    res.json(users);
  } catch (err) {
    res.status(404).json({ error: err });
  }
});
const logoutUser = asynchandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1, // this removes the field from document
      },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"));
});

const refreshAccessToken = asynchandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefereshTokens(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Access token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const changeCurrentPassword = asynchandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user?._id);
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid old password");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asynchandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "User fetched successfully"));
});

const updateAccountDetails = asynchandler(async (req, res) => {
  const { fullName, email } = req.body;

  if (!fullName || !email) {
    throw new ApiError(400, "All fields are required");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName,
        email: email,
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"));
});

const updateUserAvatar = asynchandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  //TODO: delete old image - assignment

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.url) {
    throw new ApiError(400, "Error while uploading on avatar");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url,
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar image updated successfully"));
});

const updateUserCoverImage = asynchandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover image file is missing");
  }

  //TODO: delete old image - assignment

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage.url) {
    throw new ApiError(400, "Error while uploading on avatar");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage.url,
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover image updated successfully"));
});

const getUserChannelProfile = asynchandler(async (req, res) => {
  const { username } = req.params;

  if (!username?.trim()) {
    throw new ApiError(400, "username is missing");
  }

  const channel = await User.aggregate([
    {
      $match: {
        username: username?.toLowerCase(),
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
      $addFields: {
        subscribersCount: {
          $size: "$subscribers",
        },
        channelsSubscribedToCount: {
          $size: "$subscribedTo",
        },
        isSubscribed: {
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        fullName: 1,
        username: 1,
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        isSubscribed: 1,
        avatar: 1,
        coverImage: 1,
        email: 1,
      },
    },
  ]);

  if (!channel?.length) {
    throw new ApiError(404, "channel does not exists");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "User channel fetched successfully")
    );
});

export {
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getAllUsers,
  verifyOtp,
  resendOtp,
};

function generateNumericOTP(length = 6) {
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += Math.floor(Math.random() * 10);
  }
  return otp;
}
