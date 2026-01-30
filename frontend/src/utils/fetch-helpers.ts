/**
 * API fetch helpers for graceful handling of unavailable backend endpoints.
 *
 * When backend routes are not yet registered (commented out in index.ts),
 * the server returns 404. Instead of showing red error banners, we detect
 * this and show an informational "coming soon" state.
 */

/**
 * Check if a fetch Response indicates the API endpoint is not yet available.
 * Returns true for 404 (route not registered) and 502 (bad gateway / service down).
 */
export function isNotAvailableResponse(response: Response): boolean {
  return response.status === 404 || response.status === 502;
}

/**
 * Wrapper around fetch() that auto-detects unavailable endpoints.
 * Returns { response, notAvailable } so callers can handle gracefully.
 */
export async function apiFetch(
  url: string,
  options?: RequestInit,
): Promise<{ response: Response; notAvailable: boolean }> {
  const response = await fetch(url, { credentials: "include", ...options });

  if (isNotAvailableResponse(response)) {
    return { response, notAvailable: true };
  }

  return { response, notAvailable: false };
}

/**
 * Fetch multiple endpoints in parallel. Returns notAvailable: true if
 * ALL primary endpoints return 404/502.
 */
export async function apiFetchAll(
  urls: string[],
  options?: RequestInit,
): Promise<{ responses: Response[]; notAvailable: boolean }> {
  const results = await Promise.all(
    urls.map((url) => fetch(url, { credentials: "include", ...options })),
  );

  const allNotAvailable = results.every((r) => isNotAvailableResponse(r));

  return { responses: results, notAvailable: allNotAvailable };
}
