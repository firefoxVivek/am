import mongoose from "mongoose";

const CategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,        // no duplicate categories
      index: true
    },

    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true
    },

    description: {
      type: String,
      trim: true,
      default: null
    },

    icon: {
      type: String, // image url or emoji
      default: null
    },

    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

export const Category = mongoose.model("Category", CategorySchema);
export default Category;
