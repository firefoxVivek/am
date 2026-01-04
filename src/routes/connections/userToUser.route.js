import express from "express";
import { verifyJWT } from "../../middleware/auth.middleware.js";
import {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  removeFriend,
  getMyFriends,
  getIncomingRequests,
  getOutgoingRequests,
  getFriendshipStatus,
  getFriendCount,
} from "../../controllers/connections/userTouser.controller.js";

const router = express.Router();

router.use(verifyJWT);
 
router.post("/request/:userId", sendFriendRequest);
router.post("/accept/:requestId", acceptFriendRequest);
router.post("/reject/:requestId", rejectFriendRequest);
router.delete("/cancel/:requestId", cancelFriendRequest);
router.delete("/remove/:userId", removeFriend);

 
router.get("/my", getMyFriends);
router.get("/requests/incoming", getIncomingRequests);
router.get("/requests/outgoing", getOutgoingRequests);

 
router.get("/status/:userId", getFriendshipStatus);
router.get("/count/:userId", getFriendCount);

export default router;
