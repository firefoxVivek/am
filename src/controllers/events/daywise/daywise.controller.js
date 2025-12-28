import mongoose from "mongoose";
import EventDay from "../../../models/event/daywise/masterday.model.js";
import Event from "../../../models/event/event.model.js";

/* ======================================================
   CREATE EVENT DAY
====================================================== */
export const createEventDay = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Invalid eventId" });
    }

    const eventExists = await Event.exists({ _id: eventId });
    if (!eventExists) {
      return res.status(404).json({ message: "Event not found" });
    }

    const day = await EventDay.create({
      eventId,
      ...req.body,
    });

    return res.status(201).json({
      message: "Event day created successfully",
      data: day,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "Day already exists for this event",
      });
    }

    return res.status(500).json({
      message: "Failed to create event day",
      error: error.message,
    });
  }
};

/* ======================================================
   GET ALL DAYS BY EVENT
====================================================== */
export const getEventDaysByEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Invalid eventId" });
    }

    const days = await EventDay.find({ eventId })
      .sort({ dayNumber: 1 })
      .lean();

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

/* ======================================================
   GET SINGLE EVENT DAY
====================================================== */
export const getEventDayById = async (req, res) => {
  try {
    const { dayId, eventId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(dayId) ||
      !mongoose.Types.ObjectId.isValid(eventId)
    ) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const day = await EventDay.findOne({
      _id: dayId,
      eventId,
    }).lean();

    if (!day) {
      return res.status(404).json({ message: "Event day not found" });
    }

    return res.status(200).json({ data: day });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch event day",
      error: error.message,
    });
  }
};

/* ======================================================
   UPDATE EVENT DAY (PARTIAL)
====================================================== */
export const updateEventDay = async (req, res) => {
  try {
    const { dayId, eventId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(dayId) ||
      !mongoose.Types.ObjectId.isValid(eventId)
    ) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const updatedDay = await EventDay.findOneAndUpdate(
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
export const deleteEventDay = async (req, res) => {
  try {
    const { dayId, eventId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(dayId) ||
      !mongoose.Types.ObjectId.isValid(eventId)
    ) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const deletedDay = await EventDay.findOneAndDelete({
      _id: dayId,
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
