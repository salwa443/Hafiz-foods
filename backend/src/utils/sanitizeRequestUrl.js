export function sanitizeRequestUrl(requestUrl) {
  try {
    const url = new URL(requestUrl, 'http://localhost');

    if (url.searchParams.has('token')) {
      url.searchParams.set('token', '[REDACTED]');
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return '[INVALID_URL]';
  }
}
