// src/sanitize.js — Strip placeholders and Markdown markup before linting.
//
// Why: lintString receives raw text including {placeholders}, **bold**,
// `code`, [links](https://...). Without sanitization, a forbidden word in
// bold or a {name} placeholder produces false positives or noise.
//
// What we strip:
//   {placeholder}, {{handlebars}}, ${interpolation}, %s/%d (printf)
//   **bold**, *italic*, __bold__, _italic_, ~~strike~~
//   `inline code`, ```fenced code```
//   # headers (just the # symbols)
//   [link text](url) → keep "link text", drop URL
//   ![alt](src)      → keep "alt", drop image src
//   > blockquote markers
//   - / 1. list markers at line start

/**
 * Strip Markdown markup and placeholders, preserving the human-readable text.
 *
 * @param {string} text
 * @returns {string} sanitized text safe for word-level rules
 */
export function sanitize(text) {
  if (!text) return text;
  let s = text;

  // Code fences (multi-line)
  s = s.replace(/```[\s\S]*?```/g, ' ');
  // Inline code
  s = s.replace(/`[^`]*`/g, ' ');

  // Placeholders — order matters: ${...} before {...}
  s = s.replace(/\$\{[^}]*\}/g, ' ');   // JS interpolation (consume $)
  s = s.replace(/\{\{[^}]*\}\}/g, ' '); // handlebars / mustache
  s = s.replace(/\{[^}]*\}/g, ' ');     // single-brace template
  s = s.replace(/%[sdif]/g, ' ');       // printf-style

  // Images: ![alt](src) — keep alt, drop src
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');

  // Links: [text](url) — keep text, drop url
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  // Reference-style link definitions: [id]: url
  s = s.replace(/^\s*\[[^\]]+\]:\s+\S+.*$/gm, '');

  // Emphasis markers — keep the inner text
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/\*([^*\s][^*]*[^*\s]|[^*\s])\*/g, '$1');
  s = s.replace(/___([^_]+)___/g, '$1');
  s = s.replace(/__([^_]+)__/g, '$1');
  s = s.replace(/_([^_\s][^_]*[^_\s]|[^_\s])_/g, '$1');
  s = s.replace(/~~([^~]+)~~/g, '$1');

  // Headers: leading # signs (1-6)
  s = s.replace(/^#{1,6}\s+/gm, '');

  // Blockquote markers
  s = s.replace(/^>\s+/gm, '');

  // List markers
  s = s.replace(/^\s*[-*+]\s+/gm, '');
  s = s.replace(/^\s*\d+\.\s+/gm, '');

  // Horizontal rules
  s = s.replace(/^[-*_]{3,}$/gm, '');

  // Collapse repeated whitespace from substitutions
  s = s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  return s;
}
