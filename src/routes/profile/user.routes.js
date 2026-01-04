import { Router } from "express";
import {
    loginUser,
    logoutUser,
    registerUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateUserAvatar,
    updateUserCoverImage,
completeProfileAfterOtp,
 
    
    verifyOtp,
    resendOtp
} from "../../controllers/user.controller.js";
import { upload } from "../../middleware/multer.middleware.js"
import { verifyJWT } from "../../middleware/auth.middleware.js";


const router = Router()

router.route("/register").post(registerUser);
router.route("/verifyOtp").post(verifyOtp)
router.route("/resendOtp").post(resendOtp)
router.route("/login").post(loginUser)
 
router.post(
  "/completeprofile",
 
  completeProfileAfterOtp
);

//secured routes
router.route("/logout").post(verifyJWT, logoutUser)
router.route("/refresh-token").post(refreshAccessToken)
router.route("/change-password").post(verifyJWT, changeCurrentPassword)
router.route("/current-user").get(verifyJWT, getCurrentUser)
 

router.route("/avatar").patch(verifyJWT, upload.single("avatar"), updateUserAvatar)
router.route("/cover-image").patch(verifyJWT, upload.single("coverImage"), updateUserCoverImage)

// router.route("/c/:username").get(verifyJWT, getUserChannelProfile)


export default router