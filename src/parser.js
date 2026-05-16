// src/parser.js — Parse VOICE.md into structured state
// Splits YAML front matter from markdown body, validates structure.

import { parse as parseYaml } from 'yaml';

const FRONT_MATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

const SECTION_ORDER = [
  'overview',
  'personality',
  'beliefs',
  'register',
  'lexicon',
  'audiences',
  'surfaces',
  'tones',
  'units',
  'formatting',
  'components',
  "do's and don'ts",
  'dos and donts',
];

const SECTION_ALIASES = {
  'brand voice': 'overview',
  'dos and donts': "do's and don'ts",
};

/**
 * Parse a VOICE.md string into { tokens, body, sections, errors }.
 *
 * @param {string} source - Raw VOICE.md content
 * @returns {ParseResult}
 */
export function parse(source) {
  const errors = [];
  const match = source.match(FRONT_MATTER_RE);

  if (!match) {
    return {
      tokens: null,
      body: source,
      sections: [],
      errors: [
        {
          severity: 'error',
          path: 'document',
          message:
            'No YAML front matter found. VOICE.md must start with `---` and have YAML between fences.',
        },
      ],
    };
  }

  const [, yamlText, body] = match;

  let tokens;
  try {
    tokens = parseYaml(yamlText);
  } catch (err) {
    return {
      tokens: null,
      body,
      sections: [],
      errors: [
        {
          severity: 'error',
          path: 'yaml',
          message: `YAML parse error: ${err.message}`,
        },
      ],
    };
  }

  if (!tokens || typeof tokens !== 'object') {
    errors.push({
      severity: 'error',
      path: 'yaml',
      message: 'Front matter must be a YAML object.',
    });
  }

  const sections = extractSections(body);

  return { tokens, body, sections, errors };
}

/**
 * Extract `## Section` headings from the markdown body in order.
 */
function extractSections(body) {
  const lines = body.split('\n');
  const sections = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(.+?)\s*$/);
    if (m) {
      const raw = m[1].trim();
      const normalized = SECTION_ALIASES[raw.toLowerCase()] || raw.toLowerCase();
      sections.push({
        title: raw,
        normalized,
        line: i + 1,
        canonical: SECTION_ORDER.includes(normalized) ? normalized : null,
      });
    }
  }

  return sections;
}

export { SECTION_ORDER };
