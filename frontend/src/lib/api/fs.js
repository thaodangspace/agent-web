/**
 * Filesystem API client - provides autocomplete suggestions for file/directory paths.
 */

/**
 * Browse directory contents.
 * @param {string} dirPath - Directory to browse (use "." for allowed roots)
 * @returns {Promise<{success: boolean, entries: Array<{name: string, path: string, is_dir: boolean, size: number}>}>}
 */
export async function browseFS(dirPath) {
  const url = `/api/fs/browse?path=${encodeURIComponent(dirPath)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/**
 * Search for files/dirs matching a query across allowed roots.
 * @param {string} query - Search query
 * @param {string} [root] - Optional root to limit search
 * @returns {Promise<{success: boolean, entries: Array}>}
 */
export async function searchFS(query, root) {
  let url = `/api/fs/search?query=${encodeURIComponent(query)}`;
  if (root) url += `&root=${encodeURIComponent(root)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/**
 * Read a file's content (for @ mention preview).
 * @param {string} filePath - Path to read
 * @returns {Promise<{success: boolean, content: string, truncated: boolean}>}
 */
export async function readFS(filePath) {
  const url = `/api/fs/read?path=${encodeURIComponent(filePath)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/**
 * Debounce a function call.
 */
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Create debounced versions for autocomplete
export const debouncedSearch = debounce(async (query, callback) => {
  try {
    const result = await searchFS(query);
    callback(result);
  } catch (e) {
    console.error('FS search error:', e);
    callback({ success: false, entries: [] });
  }
}, 200);

export const debouncedBrowse = debounce(async (dirPath, callback) => {
  try {
    const result = await browseFS(dirPath);
    callback(result);
  } catch (e) {
    console.error('FS browse error:', e);
    callback({ success: false, entries: [] });
  }
}, 150);
