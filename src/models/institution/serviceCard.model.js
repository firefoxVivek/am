 import mongoose from "mongoose";
const serviceItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  price: { type: String, required: true }, 
  unit: { type: String, required: true }  
}, { _id: false });

const serviceCardSchema = new mongoose.Schema({

  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true 
  },

  cardId: {
    type: String,
    required: true,
    default: () => new mongoose.Types.ObjectId().toHexString()
  },

  title: { type: String, required: true, trim: true },
  about: { type: String, trim: true },
  imageUrl: { type: String, trim: true },

  customFields: {
    isVenue: { type: Boolean, default: false },
    capacity: { type: Number, default: null },
    amenities: { type: [String], default: [] },
  },

  itemsList: [serviceItemSchema]
}, { timestamps: true });


serviceCardSchema.index({ providerId: 1, createdAt: -1 });

const ServiceCard = mongoose.model("ServiceCard", serviceCardSchema);
export default ServiceCard;