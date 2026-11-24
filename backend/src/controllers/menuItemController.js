import { findCategoryById } from '../models/categoryModel.js';
import { deleteUploadedMenuImage } from '../middleware/uploadMiddleware.js';
import {
  createMenuItem,
  deactivateMenuItem,
  findMenuItemById,
  getAllMenuItems,
  setMenuItemAvailability,
  updateMenuItem,
} from '../models/menuItemModel.js';

function toBoolean(value, defaultValue = false) {
  if (value === undefined) {
    return defaultValue;
  }

  return value === 'true' || value === true;
}

async function ensureActiveCategory(categoryId) {
  const category = await findCategoryById(categoryId);

  if (!category) {
    const error = new Error('Selected category does not exist.');
    error.statusCode = 400;
    throw error;
  }

  if (!category.is_active) {
    const error = new Error('Cannot assign menu items to an inactive category.');
    error.statusCode = 400;
    throw error;
  }
}

function buildMenuItemPayload(req) {
  return {
    categoryId: req.body.categoryId,
    name: req.body.name,
    description: req.body.description,
    price: req.body.price,
    imageUrl: req.uploadedMenuImage?.relativePath || req.body.imageUrl || req.body.image_url || null,
    isAvailable: req.body.isAvailable,
  };
}

async function cleanupUploadedImage(req) {
  if (req.uploadedMenuImage?.relativePath) {
    await deleteUploadedMenuImage(req.uploadedMenuImage.relativePath);
  }
}

export async function listMenuItems(req, res, next) {
  try {
    const menuItems = await getAllMenuItems({
      includeInactive: toBoolean(req.query.includeInactive),
    });

    res.json({ success: true, data: { menuItems } });
  } catch (error) {
    next(error);
  }
}

export async function getMenuItem(req, res, next) {
  try {
    const menuItem = await findMenuItemById(req.params.id);

    if (!menuItem) {
      const error = new Error('Menu item not found.');
      error.statusCode = 404;
      throw error;
    }

    res.json({ success: true, data: { menuItem } });
  } catch (error) {
    next(error);
  }
}

export async function createMenuItemHandler(req, res, next) {
  try {
    await ensureActiveCategory(req.body.categoryId);
    const menuItem = await createMenuItem(buildMenuItemPayload(req));

    res.status(201).json({
      success: true,
      message: 'Menu item created successfully.',
      data: { menuItem },
    });
  } catch (error) {
    if (error.code === '23505') {
      error.message = 'A menu item with this name already exists in the selected category.';
      error.statusCode = 409;
    }

    await cleanupUploadedImage(req);
    next(error);
  }
}

export async function updateMenuItemHandler(req, res, next) {
  try {
    const existingMenuItem = await findMenuItemById(req.params.id);

    if (!existingMenuItem) {
      const error = new Error('Menu item not found.');
      error.statusCode = 404;
      throw error;
    }

    await ensureActiveCategory(req.body.categoryId);
    const menuItem = await updateMenuItem(req.params.id, buildMenuItemPayload(req));

    if (req.uploadedMenuImage?.relativePath && existingMenuItem.image_url) {
      await deleteUploadedMenuImage(existingMenuItem.image_url);
    }

    res.json({
      success: true,
      message: 'Menu item updated successfully.',
      data: { menuItem },
    });
  } catch (error) {
    if (error.code === '23505') {
      error.message = 'A menu item with this name already exists in the selected category.';
      error.statusCode = 409;
    }

    await cleanupUploadedImage(req);
    next(error);
  }
}

export async function updateMenuItemAvailabilityHandler(req, res, next) {
  try {
    const menuItem = await setMenuItemAvailability(req.params.id, req.body.isAvailable);

    if (!menuItem) {
      const error = new Error('Menu item not found.');
      error.statusCode = 404;
      throw error;
    }

    res.json({
      success: true,
      message: 'Menu item availability updated successfully.',
      data: { menuItem },
    });
  } catch (error) {
    next(error);
  }
}

export async function deactivateMenuItemHandler(req, res, next) {
  try {
    const menuItem = await deactivateMenuItem(req.params.id);

    if (!menuItem) {
      const error = new Error('Menu item not found.');
      error.statusCode = 404;
      throw error;
    }

    res.json({
      success: true,
      message: 'Menu item deactivated successfully.',
      data: { menuItem },
    });
  } catch (error) {
    next(error);
  }
}
