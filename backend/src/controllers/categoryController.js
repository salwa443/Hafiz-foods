import {
  createCategory,
  deactivateCategory,
  findCategoryById,
  getAllCategories,
  getCategorySummary,
  updateCategory,
} from '../models/categoryModel.js';
import { getMenuItemSummary } from '../models/menuItemModel.js';

function toBoolean(value, defaultValue = true) {
  if (value === undefined) {
    return defaultValue;
  }

  return value === 'true' || value === true;
}

export async function getAdminDashboardSummary(req, res, next) {
  try {
    const [categorySummary, menuItemSummary] = await Promise.all([
      getCategorySummary(),
      getMenuItemSummary(),
    ]);

    res.json({
      success: true,
      data: {
        ...categorySummary,
        ...menuItemSummary,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listCategories(req, res, next) {
  try {
    const categories = await getAllCategories({
      includeInactive: toBoolean(req.query.includeInactive),
    });

    res.json({ success: true, data: { categories } });
  } catch (error) {
    next(error);
  }
}

export async function getCategory(req, res, next) {
  try {
    const category = await findCategoryById(req.params.id);

    if (!category) {
      const error = new Error('Category not found.');
      error.statusCode = 404;
      throw error;
    }

    res.json({ success: true, data: { category } });
  } catch (error) {
    next(error);
  }
}

export async function createCategoryHandler(req, res, next) {
  try {
    const category = await createCategory(req.body);

    res.status(201).json({
      success: true,
      message: 'Category created successfully.',
      data: { category },
    });
  } catch (error) {
    if (error.code === '23505') {
      error.message = 'A category with this name already exists.';
      error.statusCode = 409;
    }

    next(error);
  }
}

export async function updateCategoryHandler(req, res, next) {
  try {
    const category = await updateCategory(req.params.id, req.body);

    if (!category) {
      const error = new Error('Category not found.');
      error.statusCode = 404;
      throw error;
    }

    res.json({
      success: true,
      message: 'Category updated successfully.',
      data: { category },
    });
  } catch (error) {
    if (error.code === '23505') {
      error.message = 'A category with this name already exists.';
      error.statusCode = 409;
    }

    next(error);
  }
}

export async function deactivateCategoryHandler(req, res, next) {
  try {
    const category = await deactivateCategory(req.params.id);

    if (!category) {
      const error = new Error('Category not found.');
      error.statusCode = 404;
      throw error;
    }

    res.json({
      success: true,
      message: 'Category deactivated successfully.',
      data: { category },
    });
  } catch (error) {
    next(error);
  }
}
