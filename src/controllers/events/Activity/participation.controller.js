import admin from "../../../../config/firebase.js";
import { EventParticipation } from "../../../models/event/participation.model.js";
import User from "../../../models/Profile/auth.models.js";
import { ApiError } from "../../../utils/ApiError.js";
import { ApiResponse } from "../../../utils/ApiResponse.js";
import { asynchandler } from "../../../utils/asynchandler.js";

 
export const registerForEvent = asynchandler(async (req, res) => {
  const { eventId, activityId, role } = req.body;

  if (!eventId || !role) {
    throw new ApiError(400, "eventId and role are required");
  }

  const participation = await EventParticipation.create({
    eventId,
    activityId,
    role,
    userId: req.user._id,
    userName: req.body.userName, // snapshot
  });

  /* =========================
     FCM: SUBSCRIBE TO ACTIVITY
  ========================== */
  if (activityId) {
    const user = await User.findById(req.user._id).select(
      "deviceTokens"
    );

    const tokens = (user?.deviceTokens || []).filter(Boolean);

    if (tokens.length > 0) {
      const topic = `activity_${activityId}`;

      admin
        .messaging()
        .subscribeToTopic(tokens, topic)
        .catch((err) => {
          console.error(
            "FCM activity subscription failed:",
            err.message
          );
        });
    }
  }

  return res.status(201).json(
    new ApiResponse(
      201,
      participation,
      "Registered successfully"
    )
  );
});


export const markAttendance = asynchandler(async (req, res) => {
  const { participationId } = req.params;
  const { attendance } = req.body;

  if (!["present", "absent"].includes(attendance)) {
    throw new ApiError(400, "Invalid attendance value");
  }

  const participation = await EventParticipation.findById(
    participationId
  );

  if (!participation) {
    throw new ApiError(404, "Participation not found");
  }

  participation.attendance = attendance;
  await participation.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      participation,
      "Attendance updated"
    )
  );
});
export const getParticipantsByActivity = asynchandler(
  async (req, res) => {
    const { activityId } = req.params;
    const { role } = req.query; // participant | audience

    if (!role) {
      throw new ApiError(400, "role query param required");
    }

    const list = await EventParticipation.find({
      activityId,
      role,
    }).sort({ createdAt: 1 });

    return res.status(200).json(
      new ApiResponse(
        200,
        list,
        `${role} list fetched`
      )
    );
  }
);
export const getMyParticipation = asynchandler(
  async (req, res) => {
    const { eventId } = req.params;

    const participation =
      await EventParticipation.findOne({
        eventId,
        userId: req.user._id,
      });

    if (!participation) {
      throw new ApiError(
        404,
        "Not registered for this event"
      );
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        participation,
        "Participation fetched"
      )
    );
  }
);
export const getMyEventParticipationsDateWise = asynchandler(async (req, res) => {
  const userId = req.user._id;

  const data = await EventParticipation.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
      },
    },
    {
      $sort: { createdAt: -1 },
    },
    {
      $addFields: {
        date: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$createdAt",
          },
        },
      },
    },
    {
      $group: {
        _id: "$date",
        participations: { $push: "$$ROOT" },
      },
    },
    {
      $sort: { _id: -1 },
    },
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      data,
      "User event participations fetched date-wise"
    )
  );
});
export const getMyEventParticipations = asynchandler(async (req, res) => {
  const userId = req.user._id;

  const participations = await EventParticipation.find({
    userId,
  })
    .sort({ createdAt: -1 }) // 🔥 latest first
    .populate("eventId", "title startDate endDate coverImage")
    .populate("activityId", "title startTime endTime")
    .lean();

  return res.status(200).json(
    new ApiResponse(
      200,
      participations,
      "User event participations fetched"
    )
  );
});
export const notifyActivity = asynchandler(async (req, res) => {
  const { activityId, title, message, data = {} } = req.body;

  if (!activityId || !message) {
    throw new ApiError(400, "activityId and message are required");
  }

  const payload = {
    topic: `activity_${activityId}`,
    notification: {
      title: title || "Activity Update 📣",
      body:
        message.length > 120
          ? message.slice(0, 117) + "..."
          : message,
    },
    data: {
      activityId: activityId.toString(),
      screen: "activity",
      ...Object.entries(data).reduce((acc, [k, v]) => {
        acc[k] = String(v);
        return acc;
      }, {}),
    },
  };

  await admin.messaging().send(payload);

  return res.status(200).json(
    new ApiResponse(
      200,
      null,
      "Activity notification sent successfully"
    )
  );
});
