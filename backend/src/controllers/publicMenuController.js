import {
  getPublicCategories,
  getPublicMenuItems,
} from '../models/publicMenuModel.js';

export async function getCategories(req, res, next) {
  try {
    const categories = await getPublicCategories();

    return res.status(200).json({
      success: true,
      data: {
        categories,
      },
    });
  } catch (error) {
    return next(error);
  }
}

export async function getMenuItems(req, res, next) {
  try {
    const menuItems = await getPublicMenuItems(req.validatedMenuFilters || {});

    return res.status(200).json({
      success: true,
      data: {
        menuItems,
      },
    });
  } catch (error) {
    return next(error);
  }
}
