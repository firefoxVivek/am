import mongoose from "mongoose";
import Event from "../../models/event/event.model.js";
import EventDay from "../../models/event/daywise/masterday.model.js";

/* ======================================================
   CREATE EVENT
====================================================== */
export const createEvent = async (req, res) => {
  try {
    const payload = req.body;

    if (
      new Date(payload.startDate) > new Date(payload.endDate)
    ) {
      return res.status(400).json({
        message: "Start date cannot be after end date",
      });
    }

    if (
      new Date(payload.lastRegistrationDate) >
      new Date(payload.startDate)
    ) {
      return res.status(400).json({
        message:
          "Last registration date must be before event start date",
      });
    }

    const event = await Event.create(payload);

    return res.status(201).json({
      message: "Event created successfully",
      data: event,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create event",
      error: error.message,
    });
  }
};

/* ======================================================
   GET EVENTS (LIST + FILTERS)
====================================================== */
export const getEvents = async (req, res) => {
  try {
    const {
      clubId,
      institutionId,
      councilId,
      status,
      eventType,
      upcoming,
    } = req.query;

    const filter = {};

    if (clubId && mongoose.Types.ObjectId.isValid(clubId)) {
      filter.clubId = clubId;
    }

    if (
      institutionId &&
      mongoose.Types.ObjectId.isValid(institutionId)
    ) {
      filter.institutionId = institutionId;
    }

    if (councilId && mongoose.Types.ObjectId.isValid(councilId)) {
      filter.councilId = councilId;
    }

    if (status) filter.status = status;
    if (eventType) filter.eventType = eventType;

    if (upcoming === "true") {
      filter.startDate = { $gte: new Date() };
    }

    const events = await Event.find(filter)
      .sort({ startDate: 1 })
      .lean();

    return res.status(200).json({
      count: events.length,
      data: events,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch events",
      error: error.message,
    });
  }
};

/* ======================================================
   GET SINGLE EVENT (WITH DAYS)
====================================================== */
export const getEventById = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Invalid eventId" });
    }

    const event = await Event.findById(eventId).lean();

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Fetch days separately (scalable)
    const days = await EventDay.find({ eventId })
      .sort({ dayNumber: 1 })
      .lean();

    return res.status(200).json({
      data: {
        ...event,
        days,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch event",
      error: error.message,
    });
  }
};

/* ======================================================
   UPDATE EVENT (PARTIAL)
====================================================== */
export const updateEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Invalid eventId" });
    }

    const updates = req.body;

    if (updates.startDate && updates.endDate) {
      if (
        new Date(updates.startDate) >
        new Date(updates.endDate)
      ) {
        return res.status(400).json({
          message: "Start date cannot be after end date",
        });
      }
    }

    const updatedEvent = await Event.findByIdAndUpdate(
      eventId,
      { $set: updates },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedEvent) {
      return res.status(404).json({ message: "Event not found" });
    }

    return res.status(200).json({
      message: "Event updated successfully",
      data: updatedEvent,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update event",
      error: error.message,
    });
  }
};

/* ======================================================
   DELETE EVENT (CASCADE DAYS)
====================================================== */
export const deleteEvent = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { eventId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Invalid eventId" });
    }

    session.startTransaction();

    const event = await Event.findByIdAndDelete(eventId, {
      session,
    });

    if (!event) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Event not found" });
    }

    await EventDay.deleteMany({ eventId }, { session });

    await session.commitTransaction();

    return res.status(200).json({
      message: "Event and related days deleted successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    return res.status(500).json({
      message: "Failed to delete event",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

/* ======================================================
   PUBLISH EVENT
====================================================== */
export const publishEvent = async (req, res) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Invalid eventId" });
    }

    const updated = await Event.findByIdAndUpdate(
      eventId,
      { status: "published" },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Event not found" });
    }

    return res.status(200).json({
      message: "Event published successfully",
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to publish event",
      error: error.message,
    });
  }
};
