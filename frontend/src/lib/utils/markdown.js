import { marked } from 'marked';
import hljs from 'highlight.js';

export function escapeHTML(str) {
  if (typeof str !== 'string') {
    str = str == null ? '' : String(str);
  }
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
      text = JSON.stringify(text, null, 2);
    } else {
      text = String(text);
    }
  }
  const renderer = new marked.Renderer();
  renderer.code = function(code, language) {
    const lang = language || '';
    const highlighted = lang ? highlightCode(code, lang) : escapeHTML(code);
    return '<pre><code class="language-' + lang + '">' + highlighted + '</code></pre>';
  };
  marked.setOptions({ gfm: true, breaks: true, silent: true, renderer });
  const html = marked.parse(text);
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
}
