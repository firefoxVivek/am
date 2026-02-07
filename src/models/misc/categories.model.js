import mongoose from "mongoose";

const { Schema } = mongoose;

const categorySchema = new Schema(
  {
    // Display name
    name: {
      type: String,
      required: true,
      trim: true
    },

    // URL / API safe identifier
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    // Hierarchy
    level: {
      type: Number,
      required: true,
      min: 1
    },

    parentId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null
    },

    // UI related
    icon: {
      type: String,
      default: null
    },

    order: {
      type: Number,
      default: 0
    },
 
 

    // Optional metadata
    description: {
      type: String,
      default: ""
    },
 
  },
  {
    timestamps: true
  }
);

// Indexes for performance
categorySchema.index({ parentId: 1 });
categorySchema.index({ level: 1 });
 
 

export const Category =  mongoose.model("Category", categorySchema);
