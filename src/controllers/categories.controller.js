 
import { Category } from "../models/misc/categories.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asynchandler } from "../utils/asynchandler.js";

 
export const getLevel2ByParentId = asynchandler(async (req, res) => {
  const { parentId } = req.params;

  if (!parentId) {
    throw new ApiError(400, "ParentId is required");
  }

  const categories = await Category.find({
    parentId,
    level: 2
  }).sort({ order: 1, createdAt: 1 });

  return res.status(200).json(
    new ApiResponse(
      200,
      categories,
      "Level 2 categories fetched successfully"
    )
  );
});
export const getLevel1Categories = asynchandler(async (req, res) => {
  const categories = await Category.find({ level: 1 })
    .sort({ order: 1 });

  return res.status(200).json(
    new ApiResponse(
      200,
      categories,
      "Level 1 categories fetched successfully"
    )
  );
});
/**
 * ➕ Create Category
 */
export const createCategory = asynchandler(async (req, res) => {
  const {
    name,
    slug,
    level,
    parentId = null,
    icon,
    order,
    description
  } = req.body;

  if (!name || !slug || !level) {
    throw new ApiError(400, "name, slug and level are required");
  }

  const existing = await Category.findOne({ slug });
  if (existing) {
    throw new ApiError(409, "Category with this slug already exists");
  }

  const category = await Category.create({
    name,
    slug,
    level,
    parentId,
    icon,
    order,
    description
  });

  return res
    .status(201)
    .json(new ApiResponse(201, category, "Category created successfully"));
});

/**
 * 🔍 Search / Get Categories
 * Query params supported:
 * ?q=education
 * ?level=2
 * ?parentId=xxxxx
 */
export const getCategories = asynchandler(async (req, res) => {
  const { q, level, parentId } = req.query;

  const filter = {};

  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { slug: { $regex: q, $options: "i" } }
    ];
  }

  if (level) {
    filter.level = Number(level);
  }

  if (parentId) {
    filter.parentId = parentId;
  }

  const categories = await Category.find(filter)
    .sort({ order: 1, createdAt: 1 });

  return res
    .status(200)
    .json(new ApiResponse(200, categories, "Categories fetched successfully"));
});

/**
 * ✏️ Update Category
 */
export const updateCategory = asynchandler(async (req, res) => {
  const { categoryId } = req.params;

  const updateData = req.body;

  const category = await Category.findByIdAndUpdate(
    categoryId,
    { $set: updateData },
    { new: true }
  );

  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, category, "Category updated successfully"));
});

/**
 * 🗑️ Delete Category
 * (prevents deleting if child categories exist)
 */
export const deleteCategory = asynchandler(async (req, res) => {
  const { categoryId } = req.params;

  const childExists = await Category.exists({ parentId: categoryId });

  if (childExists) {
    throw new ApiError(
      400,
      "Cannot delete category with child categories"
    );
  }

  const category = await Category.findByIdAndDelete(categoryId);

  if (!category) {
    throw new ApiError(404, "Category not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Category deleted successfully"));
});
