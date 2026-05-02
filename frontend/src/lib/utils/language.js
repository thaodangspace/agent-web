/**
 * Detect language from a file path based on extension.
 * Returns highlight.js language name or null.
 */
export function detectLanguageFromPath(path) {
  if (!path || typeof path !== 'string') return null;
  const ext = path.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  const map = {
    'ts': 'typescript', 'tsx': 'typescript',
    'js': 'javascript', 'jsx': 'javascript',
    'mjs': 'javascript', 'cjs': 'javascript',
    'py': 'python',
    'go': 'go',
    'rs': 'rust',
    'rb': 'ruby',
    'java': 'java', 'kt': 'kotlin', 'scala': 'scala',
    'c': 'c', 'h': 'c', 'cpp': 'cpp', 'cc': 'cpp', 'cxx': 'cpp', 'hpp': 'cpp',
    'cs': 'csharp',
    'php': 'php',
    'swift': 'swift',
    'dart': 'dart',
    'lua': 'lua',
    'r': 'r',
    'pl': 'perl',
    'hs': 'haskell',
    'ex': 'elixir', 'exs': 'elixir',
    'erl': 'erlang',
    'clj': 'clojure',
    'sql': 'sql',
    'sh': 'bash', 'bash': 'bash', 'zsh': 'bash',
    'ps1': 'powershell',
    'html': 'html', 'htm': 'html',
    'css': 'css', 'scss': 'scss', 'sass': 'sass', 'less': 'less',
    'json': 'json', 'jsonc': 'json',
    'yaml': 'yaml', 'yml': 'yaml',
    'toml': 'toml',
    'xml': 'xml',
    'md': 'markdown', 'markdown': 'markdown',
    'txt': null,
    'log': null,
    'env': null,
    'dockerfile': 'dockerfile',
    'makefile': 'makefile',
    'cmake': 'cmake',
    'proto': 'protobuf',
    'graphql': 'graphql',
    'vue': 'xml',
    'svelte': 'xml',
    'zig': 'zig',
    'nim': 'nim',
    'v': 'verilog',
    'tf': 'hcl',
    'sol': 'solidity',
    'sbt': 'scala',
  };
  return map[ext] || null;
}
