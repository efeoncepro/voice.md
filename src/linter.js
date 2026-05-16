// src/linter.js — Validation rules for VOICE.md
//
// Layer 1: validate the VOICE.md document itself (schema, refs, order)
// Layer 2: validate a target string against a declared surface
//
// 0.1.0-alpha.3 additions:
// - Spanish stemming for forbidden phrases (catches inflected verbs)
// - Markdown + placeholder sanitization before lexical checks
// - Enforcement of previously declarative rules:
//     requires_action_verb, blame_user, structure, cta_count,
//     hashtags, exception, case (sentence-case detection)

import { parse, SECTION_ORDER } from './parser.js';
import { stemEs } from './stemmer-es.js';
import { sanitize } from './sanitize.js';
import { runUxRules } from './ux-writing.js';

const ACTION_VERBS_ES = new Set([
  'agenda', 'agendar', 'agendá', 'agendate',
  'comienza', 'comenzar', 'comencemos', 'comenzá',
  'descarga', 'descargar', 'descargate',
  'descubre', 'descubrir', 'descubrí',
  'empieza', 'empezar', 'empezá',
  'envía', 'enviar', 'envianos',
  'explora', 'explorar', 'explorá',
  'habla', 'hablar', 'hablemos', 'hablá',
  'inicia', 'iniciar', 'iniciá',
  'lee', 'leer', 'leé',
  'mira', 'mirar', 'mirá',
  'obtén', 'obtener',
  'prueba', 'probar', 'probalo', 'probá',
  'recibe', 'recibir',
  'regístrate', 'registrar', 'registrate',
  'reserva', 'reservar', 'reservá',
  'solicita', 'solicitar', 'solicitá',
  'suscríbete', 'suscribirse', 'suscribite',
  'únete', 'unirse', 'unite',
  've', 'ver',
  'book', 'demo', 'get', 'request', 'sign', 'start', 'try', 'see',
  'learn', 'download', 'explore', 'discover', 'join', 'apply',
]);

const USER_BLAME_PATTERNS = [
  /\b(?:tu|su)\s+error\b/i,
  /\b(?:has|hubo|hubieron)\s+(?:un|una)\s+error/i,
  /\bingres(?:aste|ó|ó)\s+(?:mal|incorrectamente|de\s+forma\s+incorrecta)/i,
  /\b(?:olvidaste|olvidó)\b/i,
  /\b(?:no\s+puedes|no\s+puede|usted\s+no\s+puede)\b/i,
  /\b(?:debes|debe|tienes\s+que|tiene\s+que)\s+\w+/i,
];

const TECHNICAL_ACRONYMS = new Set([
  'SOLVE', 'AEO', 'ICO', 'CSC', 'GTM', 'GA4', 'CRM', 'CTO', 'CMO', 'CEO',
  'ROAS', 'ROI', 'CAC', 'API', 'CDN', 'SSR', 'ISR', 'CWV', 'SLA', 'SLO',
  'FAQ', 'UX', 'UI', 'KPI', 'RpA', 'OTD', 'FTR', 'FTE', 'HR', 'SSO',
  'SCIM', 'HRIS', 'MFA', '2FA', 'SaaS', 'PaaS', 'IaaS', 'SEO', 'PPC',
  'CTA', 'NPS', 'B2B', 'B2C', 'LTV', 'MRR', 'ARR', 'OKR', 'PR',
]);

/**
 * Lint a VOICE.md source string.
 */
export function lint(source) {
  const parsed = parse(source);
  const findings = [...parsed.errors];
  if (!parsed.tokens) return finalize(findings, parsed);

  findings.push(...checkSchema(parsed.tokens));
  findings.push(...checkDefaultAudience(parsed.tokens));
  findings.push(...checkDuplicateIds(parsed.tokens));
  findings.push(...checkBrokenRefs(parsed.tokens));
  findings.push(...checkSectionOrder(parsed.sections));
  findings.push(...checkOrphanedTerms(parsed.tokens, parsed.body));

  return finalize(findings, parsed);
}

/**
 * Lint a target string against a declared surface.
 *
 * @param {object} tokens
 * @param {string} surfaceId
 * @param {string} text
 * @param {{audienceId?: string}} [opts]
 */
export function lintString(tokens, surfaceId, text, opts = {}) {
  const findings = [];
  const surface = (tokens.surfaces || []).find((s) => s.id === surfaceId);

  if (!surface) {
    findings.push({
      severity: 'error',
      path: `lint-string:${surfaceId}`,
      message: `Unknown surface id "${surfaceId}".`,
    });
    return findings;
  }

  // Sanitize for lexical checks; length checks use ORIGINAL (user-visible) text
  const cleaned = sanitize(text);

  // Length
  const len = measure(text, surface.unit || 'characters');
  if (typeof surface.max_length === 'number' && len > surface.max_length) {
    findings.push({
      severity: 'error',
      path: `surfaces.${surfaceId}`,
      rule: 'length-limit-exceeded',
      message: `Text is ${len} ${surface.unit || 'chars'}, exceeds max ${surface.max_length}.`,
    });
  }
  if (typeof surface.min_length === 'number' && len < surface.min_length) {
    findings.push({
      severity: 'warning',
      path: `surfaces.${surfaceId}`,
      rule: 'length-below-minimum',
      message: `Text is ${len} ${surface.unit || 'chars'}, below min ${surface.min_length}.`,
    });
  }

  // Forbidden phrases — stem-aware, exception-aware
  for (const entry of tokens.lexicon?.forbidden || []) {
    if (entry.exception && opts.audienceId) {
      const audience = (tokens.audiences || []).find((a) => a.id === opts.audienceId);
      if (audience && matchesException(entry.exception, audience)) continue;
    }
    if (containsPhrase(cleaned, entry.phrase, entry.variants)) {
      findings.push({
        severity: 'error',
        path: `lexicon.forbidden:${entry.phrase}`,
        rule: 'forbidden-term-used',
        message: `Forbidden phrase "${entry.phrase}" used. Reason: ${entry.reason}.`,
      });
    }
  }

  // Protected terms — variations are case-sensitive
  for (const entry of tokens.lexicon?.protected_terms || []) {
    for (const never of entry.never || []) {
      const re = new RegExp(`(?<![a-zA-Z])${escapeRegex(never)}(?![a-zA-Z])`);
      if (re.test(text)) {
        findings.push({
          severity: 'error',
          path: `lexicon.protected_terms:${entry.term}`,
          rule: 'protected-term-violation',
          message: `Found "${never}" — must be written as "${entry.term}".`,
        });
      }
    }
  }

  // Reserved motifs
  for (const motif of tokens.lexicon?.reserved_motifs || []) {
    if (text.includes(motif.motif)) {
      findings.push({
        severity: 'warning',
        path: `lexicon.reserved_motifs:${motif.motif}`,
        rule: 'reserved-motif-used',
        message: `Reserved motif "${motif.motif}" belongs to ${motif.owner}; check surface scope.`,
      });
    }
  }

  // Emoji
  if (surface.forbid_emoji && containsEmoji(text)) {
    findings.push({
      severity: 'error',
      path: `surfaces.${surfaceId}`,
      rule: 'emoji-forbidden-here',
      message: `Surface "${surfaceId}" forbids emoji.`,
    });
  }

  // Artificial caps
  if (surface.forbid_artificial_caps) {
    const acronymPattern = new RegExp(`\\b(${[...TECHNICAL_ACRONYMS].join('|')})\\b`, 'g');
    const stripped = text.replace(acronymPattern, '');
    if (/\b[A-ZÁÉÍÓÚÑ]{4,}\b/.test(stripped)) {
      findings.push({
        severity: 'warning',
        path: `surfaces.${surfaceId}`,
        rule: 'artificial-caps-detected',
        message: 'Possible artificial all-caps emphasis detected. Use sentence case.',
      });
    }
  }

  // Exclamations
  const exclamations = (text.match(/!/g) || []).length;
  if (exclamations > 1) {
    findings.push({
      severity: 'warning',
      path: `surfaces.${surfaceId}`,
      rule: 'too-many-exclamations',
      message: `Found ${exclamations} exclamation marks. Max one per piece — Efeonce no grita.`,
    });
  }

  // --- A2 enforcement rules ---

  if (surface.requires_action_verb) {
    const firstWord = cleaned.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^\wáéíóúüñ¡]/g, '');
    if (firstWord && !ACTION_VERBS_ES.has(firstWord)) {
      findings.push({
        severity: 'warning',
        path: `surfaces.${surfaceId}`,
        rule: 'cta-missing-action-verb',
        message: `CTA should start with an imperative verb. Got "${firstWord}".`,
      });
    }
  }

  if (surface.blame_user === 'forbidden') {
    for (const pattern of USER_BLAME_PATTERNS) {
      if (pattern.test(cleaned)) {
        findings.push({
          severity: 'error',
          path: `surfaces.${surfaceId}`,
          rule: 'error-blames-user',
          message: 'Error message appears to blame the user. Rephrase to describe what happened, not what the user did wrong.',
        });
        break;
      }
    }
  }

  if (Array.isArray(surface.structure) && surface.structure.length >= 2) {
    const sentences = cleaned.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
    if (sentences.length < surface.structure.length) {
      findings.push({
        severity: 'warning',
        path: `surfaces.${surfaceId}`,
        rule: 'structure-incomplete',
        message: `Surface "${surfaceId}" requires structure [${surface.structure.join(', ')}], but found only ${sentences.length} sentence(s).`,
      });
    }
  }

  if (typeof surface.cta_count === 'number') {
    const ctas = countCtas(cleaned);
    if (ctas > surface.cta_count) {
      findings.push({
        severity: 'warning',
        path: `surfaces.${surfaceId}`,
        rule: 'too-many-ctas',
        message: `Surface "${surfaceId}" allows ${surface.cta_count} CTA but found ~${ctas}. Pick the strongest one.`,
      });
    }
  }

  if (surface.hashtags) {
    const tags = text.match(/#\w+/g) || [];
    if (typeof surface.hashtags.min === 'number' && tags.length < surface.hashtags.min) {
      findings.push({
        severity: 'warning',
        path: `surfaces.${surfaceId}`,
        rule: 'too-few-hashtags',
        message: `Surface "${surfaceId}" requires at least ${surface.hashtags.min} hashtags, found ${tags.length}.`,
      });
    }
    if (typeof surface.hashtags.max === 'number' && tags.length > surface.hashtags.max) {
      findings.push({
        severity: 'warning',
        path: `surfaces.${surfaceId}`,
        rule: 'too-many-hashtags',
        message: `Surface "${surfaceId}" allows at most ${surface.hashtags.max} hashtags, found ${tags.length}.`,
      });
    }
    for (const mandatory of surface.hashtags.mandatory || []) {
      if (!tags.some((t) => t.toLowerCase() === mandatory.toLowerCase())) {
        findings.push({
          severity: 'warning',
          path: `surfaces.${surfaceId}`,
          rule: 'missing-mandatory-hashtag',
          message: `Mandatory hashtag "${mandatory}" missing.`,
        });
      }
    }
  }

  if (surface.case === 'sentence-case') {
    const words = cleaned.trim().split(/\s+/).slice(0, 6);
    let consecutive = 0;
    let max = 0;
    for (const w of words) {
      if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúüñ]/.test(w)) {
        consecutive++;
        max = Math.max(max, consecutive);
      } else {
        consecutive = 0;
      }
    }
    if (max >= 3) {
      findings.push({
        severity: 'warning',
        path: `surfaces.${surfaceId}`,
        rule: 'title-case-detected',
        message: `Surface "${surfaceId}" expects sentence-case. Detected possible Title Case in opening.`,
      });
    }
  }

  // --- UX writing rules (Fase B — NN/g + Polaris + Mailchimp) ---
  findings.push(...runUxRules(tokens, surfaceId, cleaned, text));

  return findings;
}

// --- helpers ---------------------------------------------------------

function containsPhrase(cleaned, phrase, explicitVariants = []) {
  const phraseLower = phrase.toLowerCase();
  const textLower = cleaned.toLowerCase();

  if (phraseLower.includes(' ')) {
    if (new RegExp(`\\b${escapeRegex(phraseLower)}\\b`, 'iu').test(cleaned)) return true;
    for (const v of explicitVariants) {
      if (new RegExp(`\\b${escapeRegex(v.toLowerCase())}\\b`, 'iu').test(cleaned)) return true;
    }
    return false;
  }

  if (new RegExp(`\\b${escapeRegex(phraseLower)}\\b`, 'iu').test(cleaned)) return true;

  for (const v of explicitVariants) {
    if (new RegExp(`\\b${escapeRegex(v.toLowerCase())}\\b`, 'iu').test(cleaned)) return true;
  }

  // Stem-based fallback
  const phraseStem = stemEs(phraseLower);
  if (phraseStem.length < 3) return false;  // avoid false positives on tiny stems
  const tokens = textLower.match(/[a-záéíóúüñ]+/gi) || [];
  for (const tok of tokens) {
    if (stemEs(tok) === phraseStem) return true;
  }

  return false;
}

function matchesException(exceptionString, audience) {
  const haystack = [
    audience.id, audience.name, ...(audience.vocabulary || []),
  ].join(' ').toLowerCase();
  return exceptionString.toLowerCase().split(/\s+/).some((token) => haystack.includes(token));
}

function countCtas(text) {
  let count = 0;
  const sentences = text.split(/[.!?]+/);
  for (const s of sentences) {
    const first = s.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^\wáéíóúüñ]/g, '');
    if (first && ACTION_VERBS_ES.has(first)) count++;
  }
  count += (text.match(/→|👉|click aquí|haz clic/gi) || []).length;
  return count;
}

// --- schema rules ---

function checkSchema(tokens) {
  const findings = [];
  const required = ['name', 'language', 'personality', 'beliefs', 'audiences', 'surfaces'];
  for (const key of required) {
    if (tokens[key] === undefined) {
      findings.push({
        severity: 'error', path: key, rule: 'missing-required-field',
        message: `Required field "${key}" is missing.`,
      });
    }
  }
  if (tokens.language?.primary && !/^[a-z]{2}(-[A-Z0-9]+)?$/.test(tokens.language.primary)) {
    findings.push({
      severity: 'warning', path: 'language.primary', rule: 'invalid-locale',
      message: `"${tokens.language.primary}" is not a valid BCP-47 locale.`,
    });
  }
  return findings;
}

function checkDefaultAudience(tokens) {
  const findings = [];
  const defaults = (tokens.audiences || []).filter((a) => a.is_default === true);
  if (defaults.length === 0) {
    findings.push({
      severity: 'error', path: 'audiences', rule: 'missing-default-audience',
      message: 'No audience marked is_default: true.',
    });
  } else if (defaults.length > 1) {
    findings.push({
      severity: 'error', path: 'audiences', rule: 'multiple-default-audiences',
      message: `${defaults.length} audiences marked is_default. Only one allowed.`,
    });
  }
  return findings;
}

function checkDuplicateIds(tokens) {
  const findings = [];
  for (const group of ['audiences', 'surfaces', 'tones', 'units']) {
    const ids = (tokens[group] || []).map((e) => e.id).filter(Boolean);
    const seen = new Set();
    const dupes = new Set();
    for (const id of ids) {
      if (seen.has(id)) dupes.add(id);
      seen.add(id);
    }
    for (const id of dupes) {
      findings.push({
        severity: 'error', path: `${group}:${id}`, rule: 'duplicate-id',
        message: `Duplicate id "${id}" in ${group}.`,
      });
    }
  }
  return findings;
}

function checkBrokenRefs(tokens) {
  const findings = [];
  const audienceIds = new Set((tokens.audiences || []).map((a) => a.id));
  const surfaceIds = new Set((tokens.surfaces || []).map((s) => s.id));
  const traitIds = new Set(tokens.personality?.traits || []);

  for (const [name, comp] of Object.entries(tokens.components || {})) {
    if (comp.audience && !audienceIds.has(comp.audience)) {
      findings.push({
        severity: 'error', path: `components.${name}.audience`, rule: 'broken-ref',
        message: `Component "${name}" references unknown audience "${comp.audience}".`,
      });
    }
    if (comp.surface && !surfaceIds.has(comp.surface)) {
      findings.push({
        severity: 'error', path: `components.${name}.surface`, rule: 'broken-ref',
        message: `Component "${name}" references unknown surface "${comp.surface}".`,
      });
    }
  }

  for (const unit of tokens.units || []) {
    for (const trait of unit.personality_emphasis || []) {
      if (!traitIds.has(trait)) {
        findings.push({
          severity: 'warning', path: `units.${unit.id}.personality_emphasis`, rule: 'broken-ref',
          message: `Unit "${unit.id}" emphasizes unknown trait "${trait}".`,
        });
      }
    }
  }

  const unitIds = new Set((tokens.units || []).map((u) => u.id).concat(['institutional']));
  for (const motif of tokens.lexicon?.reserved_motifs || []) {
    for (const unit of motif.forbidden_in || []) {
      if (!unitIds.has(unit)) {
        findings.push({
          severity: 'warning', path: `lexicon.reserved_motifs:${motif.motif}`, rule: 'broken-ref',
          message: `Reserved motif references unknown unit "${unit}".`,
        });
      }
    }
  }

  return findings;
}

function checkSectionOrder(sections) {
  const findings = [];
  const canonical = sections.filter((s) => s.canonical);
  let lastIdx = -1;
  for (const sec of canonical) {
    const idx = SECTION_ORDER.indexOf(sec.canonical);
    if (idx < lastIdx) {
      findings.push({
        severity: 'warning', path: `body:line-${sec.line}`, rule: 'section-order',
        message: `Section "${sec.title}" appears out of canonical order.`,
      });
    }
    lastIdx = Math.max(lastIdx, idx);
  }
  return findings;
}

function checkOrphanedTerms(tokens, body) {
  const findings = [];
  const corpus = (body + ' ' + JSON.stringify(tokens.components || {})).toLowerCase();
  for (const entry of tokens.lexicon?.protected_terms || []) {
    if (!corpus.includes(entry.term.toLowerCase())) {
      findings.push({
        severity: 'info', path: `lexicon.protected_terms:${entry.term}`, rule: 'orphaned-term',
        message: `Protected term "${entry.term}" defined but never referenced.`,
      });
    }
  }
  return findings;
}

// --- utilities ---

function measure(text, unit) {
  switch (unit) {
    case 'words': return text.trim().split(/\s+/).filter(Boolean).length;
    case 'lines': return text.split('\n').length;
    case 'sentences': return text.split(/[.!?]+/).filter((s) => s.trim()).length;
    case 'characters':
    default: return text.length;
  }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsEmoji(text) {
  return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u.test(text);
}

function finalize(findings, parsed) {
  const summary = {
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };
  return { findings, summary, voiceSystem: parsed.tokens };
}
