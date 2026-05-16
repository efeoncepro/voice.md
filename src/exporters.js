// src/exporters.js — Convert VOICE.md tokens to consumer formats.
//
// Available formats:
//   - prompt        → System-prompt block for LLM agents
//   - json          → Flat dictionary consumable by linters and i18n systems
//   - eslint-config → ESLint shared config that fails build on forbidden phrases

import { lint } from './linter.js';

export function exportFormat(source, format) {
  const result = lint(source);
  if (!result.voiceSystem) {
    throw new Error('Cannot export: source has parse errors.');
  }

  switch (format) {
    case 'prompt':
      return exportPrompt(result.voiceSystem);
    case 'json':
      return JSON.stringify(exportJson(result.voiceSystem), null, 2);
    case 'eslint-config':
      return exportEslintConfig(result.voiceSystem);
    default:
      throw new Error(`Unknown export format: "${format}".`);
  }
}

// --- prompt --------------------------------------------------------------

function exportPrompt(v) {
  const lines = [];

  lines.push(`# Voice System Prompt — ${v.name}`);
  if (v.description) {
    lines.push('');
    lines.push(v.description.trim());
  }
  lines.push('');
  lines.push(`Language: ${v.language?.primary || 'unspecified'}, treatment: ${v.language?.treatment || 'unspecified'}.`);
  lines.push(`Default register: ${v.register?.default || 'unspecified'}.`);

  if (v.personality?.traits?.length) {
    lines.push('');
    lines.push('## Personality');
    for (const trait of v.personality.traits) {
      lines.push(`- ${trait}`);
    }
  }

  if (v.beliefs?.length) {
    lines.push('');
    lines.push('## Core beliefs (every piece must trace to at least one)');
    for (const b of v.beliefs) {
      lines.push(`- **${b.id}:** ${b.statement}`);
    }
  }

  if (v.lexicon?.protected_terms?.length) {
    lines.push('');
    lines.push('## Protected terminology (write exactly as shown)');
    for (const t of v.lexicon.protected_terms) {
      const never = t.never?.length ? ` — never: ${t.never.join(', ')}` : '';
      lines.push(`- **${t.term}**${never}`);
    }
  }

  if (v.lexicon?.forbidden?.length) {
    lines.push('');
    lines.push('## Forbidden phrases');
    for (const f of v.lexicon.forbidden) {
      lines.push(`- "${f.phrase}" (${f.reason})`);
    }
  }

  if (v.lexicon?.reserved_motifs?.length) {
    lines.push('');
    lines.push('## Reserved motifs (belong to derived voices, do not use here)');
    for (const m of v.lexicon.reserved_motifs) {
      lines.push(`- "${m.motif}" — owner: ${m.owner}`);
    }
  }

  lines.push('');
  lines.push('## Hard rules');
  lines.push('- Every impact claim must trace to a number or case.');
  lines.push('- Transparency is not optional. If something is broken, say so.');
  lines.push('- Measurement always connects to business, never to vanity metrics.');
  lines.push('- Never sacrifice clarity for sophistication or depth for simplicity.');

  return lines.join('\n');
}

// --- json ----------------------------------------------------------------

function exportJson(v) {
  return {
    version: v.version || 'alpha',
    name: v.name,
    language: v.language || {},
    forbidden: (v.lexicon?.forbidden || []).map((f) => ({
      phrase: f.phrase,
      reason: f.reason,
    })),
    protected_terms: (v.lexicon?.protected_terms || []).map((t) => ({
      canonical: t.term,
      forbidden_variants: t.never || [],
    })),
    reserved_motifs: v.lexicon?.reserved_motifs || [],
    surface_limits: Object.fromEntries(
      (v.surfaces || []).map((s) => [
        s.id,
        {
          max_length: s.max_length,
          min_length: s.min_length,
          unit: s.unit,
          case: s.case,
          forbid_emoji: !!s.forbid_emoji,
        },
      ]),
    ),
    audiences: (v.audiences || []).map((a) => ({
      id: a.id,
      name: a.name,
      is_default: !!a.is_default,
    })),
  };
}

// --- eslint-config -------------------------------------------------------

function exportEslintConfig(v) {
  const forbidden = (v.lexicon?.forbidden || []).map((f) => f.phrase);
  const protectedNever = (v.lexicon?.protected_terms || []).flatMap(
    (t) => (t.never || []).map((n) => ({ never: n, canonical: t.term })),
  );

  // Generates a flat ESLint config object that uses no-restricted-syntax to
  // catch literal strings containing forbidden phrases inside JSX.
  return `// .eslintrc.voice.cjs — auto-generated from VOICE.md
// Re-run \`voice export --format eslint-config\` whenever VOICE.md changes.

const forbiddenPhrases = ${JSON.stringify(forbidden, null, 2)};

const protectedTermViolations = ${JSON.stringify(protectedNever, null, 2)};

function buildSelector(needle) {
  // matches Literal nodes whose .value contains the phrase (case-insensitive)
  const escaped = needle.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
  return \`Literal[value=/\\\\b\${escaped}\\\\b/i]\`;
}

module.exports = {
  rules: {
    'no-restricted-syntax': [
      'error',
      ...forbiddenPhrases.map((phrase) => ({
        selector: buildSelector(phrase),
        message: \`VOICE.md violation: forbidden phrase "\${phrase}".\`,
      })),
      ...protectedTermViolations.map(({ never, canonical }) => ({
        selector: buildSelector(never),
        message: \`VOICE.md violation: write "\${canonical}" — never "\${never}".\`,
      })),
    ],
  },
};
`;
}
