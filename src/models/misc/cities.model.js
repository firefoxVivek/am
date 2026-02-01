import mongoose from "mongoose";
const LocationSchema = new mongoose.Schema(
  {
    officeName: { type: String, required: true },
    pincode: { type: Number, required: true }, // No index here as per your request
    taluk: { type: String },
    districtName: { 
      type: String, 
      required: true, 
      trim: true 
    },
    stateName: { type: String, required: true },
  },
  { timestamps: true }
);

// Define the Text Index on districtName
LocationSchema.index({ districtName: "text" });

export const Location = mongoose.model("Location", LocationSchema);