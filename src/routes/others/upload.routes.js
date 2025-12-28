import express from "express";
import { upload } from "../../middleware/multer.middleware.js";
import { uploadImage } from "../../controllers/upload.controller.js";
import { verifyJWT } from "../../middleware/auth.middleware.js";

const router = express.Router();

// Single image upload
router.post("/image", upload.single("image") , uploadImage);

export default router;
