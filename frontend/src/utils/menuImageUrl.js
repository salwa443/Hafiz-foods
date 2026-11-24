const apiOrigin = import.meta.env.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/api\/?$/, '')
  : 'http://localhost:5000';

export const menuImageFallbackUrl = '/assets/menu/fallback-food.svg';

export function resolveMenuImageUrl(imageUrl) {
  if (!imageUrl) return menuImageFallbackUrl;
  if (imageUrl.startsWith('/assets/')) return imageUrl;
  return `${apiOrigin}${imageUrl}`;
}
