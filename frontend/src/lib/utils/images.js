/**
 * Match absolute paths to image files anywhere on disk.
 * Examples: /Users/foo/.pi/images/abc.png, /var/folders/.../T/pi-clipboard-xxx.png
 */
const IMAGE_PATH_RE = /\/[\w/.-]+\/[\w_.-]+\.(?:png|jpe?g|gif|webp|bmp|svg|tiff)\b/gi;

/**
 * Extract image file paths from text content.
 * Returns an array of absolute paths found.
 */
export function extractImagePaths(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(IMAGE_PATH_RE);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Strip the image attachment boilerplate from user prompts.
 *
 * Removes lines matching:
 *   [Image(s) attached:
 *     - /path/to/image.png]
 *   [Use the read tool to view the image(s) before responding]
 * The (s?) back-reference ensures singular/plural consistency.
 */
const BOILERPLATE_RE = /^\[Image(s?)\s+attached:\n(?:  - \S+\]\n)+\[Use the read tool to view the image\1\s+before responding\]\n\n?/m;

export function stripImageBoilerplate(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(BOILERPLATE_RE, '');
}

/**
 * Detect if an image path might be a read-tool result (doesn't contain the boilerplate).
 */
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|tiff)$/i;

export function isImagePath(path) {
  return IMAGE_EXT_RE.test(path);
}
