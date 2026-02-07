import { Router } from "express";
import {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,getLevel2ByParentId,getLevel1Categories
} from "../../controllers/categories.controller.js";

const router = Router();

/**
 * ➕ Create category
 * POST /api/v1/categories
 */
router.post("/", createCategory);
router.get("/level2/:parentId", getLevel2ByParentId);
/**
 * 🔍 Get / search categories
 * GET /api/v1/categories
 */
router.get("/", getCategories);
router.get("/root", getLevel1Categories);

/**
 * ✏️ Update category
 * PATCH /api/v1/categories/:categoryId
 */
router.patch("/:categoryId", updateCategory);

/**
 * 🗑️ Delete category
 * DELETE /api/v1/categories/:categoryId
 */
router.delete("/:categoryId", deleteCategory);

export default router;
