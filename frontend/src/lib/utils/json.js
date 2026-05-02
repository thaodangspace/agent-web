// Unescapes JSON string literals - converts \n, \t, \" etc to actual characters
// Also handles JSON objects by pretty-printing and unescaping string values
export function unescapeJsonString(str) {
  if (typeof str !== 'string' || !str) return str;

  // Check if content looks like escaped JSON string (contains \n, \t, etc)
  if (!str.includes('\\n') && !str.includes('\\t') && !str.includes('\\"') && !str.includes('\\\\')) {
    return str;
  }

  // Try to parse as JSON object/array first
  if (str.trim().startsWith('{') || str.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(str);
      return JSON.stringify(unescapeObjectValues(parsed), null, 2);
    } catch {
      // Not valid JSON, fall through to simple string unescape
    }
  }

  try {
    // Wrap in quotes and parse to unescape, then remove the outer quotes
    const wrapped = '"' + str + '"';
    const unescaped = JSON.parse(wrapped);
    return unescaped;
  } catch {
    // If parsing fails, return original string
    return str;
  }
}

// Recursively unescapes string values in an object/array
function unescapeObjectValues(obj) {
  if (typeof obj === 'string') {
    try {
      return JSON.parse('"' + obj + '"');
    } catch {
      return obj;
    }
  }
  if (Array.isArray(obj)) {
    return obj.map(item => unescapeObjectValues(item));
  }
  if (obj !== null && typeof obj === 'object') {
    const result = {};
    for (const key of Object.keys(obj)) {
      result[key] = unescapeObjectValues(obj[key]);
    }
    return result;
  }
  return obj;
}
