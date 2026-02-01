import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

providerId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  required: true,
  index: true,
},

    cardId: {
      type: String,
      required: true,
    },

    itemName: {
      type: String,
      required: true,
    },

    bookingType: {
      type: String,
      enum: ["venue", "service", "product"],
      required: true,
    },

    schedule: {
      date: { type: Date, required: true },

      startTime: { type: String }, // "10:00"
      endTime: { type: String },   // "18:00"

      duration: {
        type: Number, // hours / days
      },
    },

    quantity: {
      type: Number,
      default: 1,
    },

totalAmount: {
  type: Number, // 500
  required: true 
},

    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "rejected",
        "cancelled",
        "completed",
      ],
      default: "pending",
    },

    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "refunded"],
      default: "unpaid",
    },
  },
  { timestamps: true }
);

 const Booking = mongoose.model("Booking", bookingSchema);

export default Booking;