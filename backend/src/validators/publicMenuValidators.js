const MAX_SEARCH_LENGTH = 100;

function sendValidationError(res, message) {
  return res.status(400).json({
    success: false,
    message,
  });
}

export function validatePublicMenuItemFilters(req, res, next) {
  const { search, categoryId } = req.query;
  const filters = {};

  if (Array.isArray(search)) {
    return sendValidationError(res, 'Search filter must be a single value.');
  }

  if (Array.isArray(categoryId)) {
    return sendValidationError(res, 'Category filter must be a single value.');
  }

  if (search !== undefined) {
    if (typeof search !== 'string') {
      return sendValidationError(res, 'Search filter must be text.');
    }

    const trimmedSearch = search.trim();

    if (trimmedSearch.length > MAX_SEARCH_LENGTH) {
      return sendValidationError(res, `Search filter must be ${MAX_SEARCH_LENGTH} characters or fewer.`);
    }

    if (trimmedSearch.length > 0) {
      filters.search = trimmedSearch;
    }
  }

  if (categoryId !== undefined) {
    if (typeof categoryId !== 'string' || categoryId.trim() === '') {
      return sendValidationError(res, 'Category ID is required when category filter is provided.');
    }

    const normalizedCategoryId = Number(categoryId);

    if (
      !Number.isInteger(normalizedCategoryId) ||
      normalizedCategoryId <= 0 ||
      !Number.isSafeInteger(normalizedCategoryId)
    ) {
      return sendValidationError(res, 'Category ID must be a positive integer.');
    }

    filters.categoryId = normalizedCategoryId;
  }

  req.validatedMenuFilters = filters;
  return next();
}
