// ===== Utility Functions =====

export function timeNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function escapeHTML(str) {
  if (typeof str !== 'string') {
    str = str == null ? '' : String(str);
  }
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function isAtBottom(el) {
  const threshold = 80;
  return (el.scrollHeight - el.scrollTop - el.clientHeight) < threshold;
}

export function scrollToBottom(chatMessages, userScrolledUp, force = false) {
  if (force || !userScrolledUp) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

export function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

export function highlightCode(code, lang) {
  if (!lang || typeof hljs === 'undefined') return escapeHTML(code);
  try {
    return hljs.highlight(code, { language: lang }).value;
  } catch {
    return escapeHTML(code);
  }
}

export function formatText(text) {
  if (typeof text !== 'string') {
    if (text === null || text === undefined) {
      text = '';
    } else if (typeof text === 'object') {
      // Handle objects by JSON stringifying them (prevents "[object Object]")
      text = JSON.stringify(text, null, 2);
    } else {
      text = String(text);
    }
  }
  if (typeof marked !== 'undefined') {
    const renderer = new marked.Renderer();
    renderer.code = function(code, language) {
      const lang = language || '';
      const highlighted = lang ? highlightCode(code, lang) : escapeHTML(code);
      return '<pre><code class="language-' + lang + '">' + highlighted + '</code></pre>';
    };
    marked.setOptions({ gfm: true, breaks: true, silent: true, renderer });
    const html = marked.parse(text);
    if (typeof hljs !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      doc.querySelectorAll('pre code').forEach(block => {
        try { hljs.highlightElement(block); } catch(e) {}
      });
      return doc.body.innerHTML
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    }
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  }
  const escaped = escapeHTML(text);
  return escaped
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded text-[11px] bg-ctp-crust text-ctp-peach">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

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
      // Pretty-print the JSON with unescaped string values
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
    // Unescape the string by parsing it as a JSON string literal
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
