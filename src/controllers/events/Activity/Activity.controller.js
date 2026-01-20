import mongoose from "mongoose";

import Activity from "../../../models/event/Activity/masterday.model.js";


export const createActivity = async (req, res) => {
  try {
    const { eventId } = req.params;


    const newActivityDoc = await Activity.create({
      eventId,
      ...req.body,
    });

    return res.status(201).json({
      message: "New activity document created",
      data: newActivityDoc,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create document",
      error: error.message,
    });
  }
};

export const getActivity = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Invalid eventId" });
    }

    const days = await Activity.find({ eventId }).sort({ dayNumber: 1 }).lean();

    return res.status(200).json({
      count: days.length,
      data: days,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch event days",
      error: error.message,
    });
  }
};
export const getEventSchedule = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Invalid Event ID" });
    }

    const schedule = await Activity.aggregate([
      {
        // 1. Filter activities for this specific event
        $match: { eventId: new mongoose.Types.ObjectId(eventId) }
      },
      {
        // 2. Group by dayNumber and date
        $group: {
          _id: "$dayNumber",
          date: { $first: "$date" }, // Capture the date for the day
          metadata: {
            $push: {
              activityId: "$_id",
              activityName: "$activityName"
            }
          }
        }
      },
      {
        // 3. Rename _id back to dayNumber and format output
        $project: {
          _id: 0,
          dayNumber: "$_id",
          date: 1,
          metadata: 1
        }
      },
      {
        // 4. Sort by Day Number (Day 1, Day 2...)
        $sort: { dayNumber: 1 }
      }
    ]);

    return res.status(200).json({
      success: true,
      count: schedule.length,
      data: schedule
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch schedule",
      error: error.message
    });
  }
};

export const getActivityById = async (req, res) => {
  try {
    const { activityId } = req.params;  

  
    if (!mongoose.Types.ObjectId.isValid(activityId)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid Activity ID format" 
      });
    }


    const activity = await Activity.findById(activityId).lean();


    if (!activity) {
      return res.status(404).json({ 
        success: false, 
        message: "Activity not found" 
      });
    }


    return res.status(200).json({
      success: true,
      data: activity
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error while fetching activity",
      error: error.message,
    });
  }
};
/* ======================================================
   UPDATE EVENT DAY (PARTIAL)
====================================================== */
export const updateActivity = async (req, res) => {
  try {
    const { dayId, eventId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(dayId) ||
      !mongoose.Types.ObjectId.isValid(eventId)
    ) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const updatedDay = await Activity.findOneAndUpdate(
      { _id: dayId, eventId },
      { $set: req.body },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedDay) {
      return res.status(404).json({ message: "Event day not found" });
    }

    return res.status(200).json({
      message: "Event day updated successfully",
      data: updatedDay,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update event day",
      error: error.message,
    });
  }
};

/* ======================================================
   DELETE EVENT DAY
====================================================== */
export const deleteActivity = async (req, res) => {
  try {
    const { activityId, eventId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(activityId) ||
      !mongoose.Types.ObjectId.isValid(eventId)
    ) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const deletedDay = await Activity.findOneAndDelete({
      _id: activityId,
      eventId,
    });

    if (!deletedDay) {
      return res.status(404).json({ message: "Event day not found" });
    }

    return res.status(200).json({
      message: "Event day deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete event day",
      error: error.message,
    });
  }
};
