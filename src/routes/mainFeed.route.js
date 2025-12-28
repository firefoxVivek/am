import express from "express";
import {
  createHomeFeed,
  getHomeFeed,
  updateHomeFeed,
  patchHomeFeed,
} from "../controllers/mainFeed.controller.js";

const router = express.Router();

 
router.post("/", createHomeFeed);   // Create
router.get("/", getHomeFeed);        // Read
router.put("/", updateHomeFeed);     // Full Update
router.patch("/", patchHomeFeed);    // Partial Update

export default router;
