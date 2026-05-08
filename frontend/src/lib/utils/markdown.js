import { marked } from 'marked';

export function escapeHTML(str) {
  if (typeof str !== 'string') {
    str = str == null ? '' : String(str);
  }
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function highlightCode(code, _lang) {
  return escapeHTML(code);
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
  renderer.code = function({ text, lang }) {
    const language = lang || '';
    const highlighted = escapeHTML(text);
    return '<pre><code class="language-' + language + '">' + highlighted + '</code></pre>';
  };
  marked.setOptions({ gfm: true, breaks: true, silent: true, renderer });
  const html = marked.parse(text);
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
}
