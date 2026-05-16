// src/ux-writing.js — UX writing rules engine.
//
// Implements rules sourced from Nielsen Norman Group, Shopify Polaris,
// and Mailchimp Content Style Guide. All rules are language-tagged via
// `applies_to: [bcp-47, ...]` so VOICE.md authors can extend per locale.
//
// Each function returns Finding[] for a given (surface, text, tokens) triple.
// Findings have shape: { severity, path, rule, message }.

/**
 * Check if a rule's `applies_to` includes the VOICE.md primary language.
 */
function appliesTo(rule, language) {
  if (!rule.applies_to || !Array.isArray(rule.applies_to)) return true;
  if (!language) return true;
  return rule.applies_to.includes(language);
}

/**
 * Check if a surfaceId matches a pattern in `applies_to_surfaces`.
 * Pattern can be exact id or "prefix-*" wildcard.
 */
function surfaceMatches(surfaceId, patterns) {
  if (!Array.isArray(patterns)) return false;
  for (const p of patterns) {
    if (p === surfaceId) return true;
    if (p.endsWith('*') && surfaceId.startsWith(p.slice(0, -1))) return true;
  }
  return false;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Run UX writing checks against a target string.
 *
 * @param {object} tokens   - parsed VOICE.md
 * @param {string} surfaceId
 * @param {string} cleaned  - already sanitized by sanitize.js
 * @param {string} original - raw text (for some regex anchors)
 * @returns {Finding[]}
 */
export function runUxRules(tokens, surfaceId, cleaned, original) {
  const findings = [];
  const ux = tokens.ux_writing;
  if (!ux) return findings;

  const language = tokens.language?.primary;
  const cfg = ux.applies_to_surfaces || {};

  // --- 1. Filler words ---
  if (surfaceMatches(surfaceId, cfg.no_filler_words || [])) {
    for (const entry of ux.filler_words || []) {
      if (!appliesTo(entry, language)) continue;
      const re = new RegExp(`\\b${escapeRegex(entry.word)}\\b`, 'iu');
      if (re.test(cleaned)) {
        findings.push({
          severity: 'warning',
          path: `surfaces.${surfaceId}`,
          rule: 'filler-word',
          message: `Filler word "${entry.word}" detected. Every word must earn its place.`,
        });
      }
    }
  }

  // --- 2. System-as-actor anti-pattern ---
  if (surfaceMatches(surfaceId, cfg.no_system_actor || [])) {
    for (const entry of ux.system_actor_patterns || []) {
      if (!appliesTo(entry, language)) continue;
      const re = new RegExp(`\\b${escapeRegex(entry.pattern)}\\b`, 'iu');
      if (re.test(cleaned)) {
        findings.push({
          severity: 'warning',
          path: `surfaces.${surfaceId}`,
          rule: 'system-as-actor',
          message: `"${entry.pattern}" personifies the product. Speak to the user instead ("no pudimos", "we couldn't").`,
        });
      }
    }
  }

  // --- 3. Performative apologies ---
  if (surfaceMatches(surfaceId, cfg.no_performative_apology || [])) {
    for (const entry of ux.performative_apologies || []) {
      if (!appliesTo(entry, language)) continue;
      const re = new RegExp(`\\b${escapeRegex(entry.phrase)}\\b`, 'iu');
      if (re.test(cleaned)) {
        findings.push({
          severity: 'warning',
          path: `surfaces.${surfaceId}`,
          rule: 'performative-apology',
          message: `"${entry.phrase}" is performative. Resolve the issue, don't apologize for it.`,
        });
      }
    }
  }

  // --- 4. Generic CTA labels ---
  if (surfaceMatches(surfaceId, cfg.no_generic_cta || [])) {
    for (const entry of ux.generic_cta_phrases || []) {
      if (!appliesTo(entry, language)) continue;
      // Whole-string match — CTAs are short; "Enviar" alone is generic,
      // but "Enviar invitación" is fine.
      if (cleaned.trim().toLowerCase() === entry.phrase.toLowerCase()) {
        findings.push({
          severity: 'warning',
          path: `surfaces.${surfaceId}`,
          rule: 'generic-cta',
          message: `CTA "${entry.phrase}" is generic. Use verb + specific object ("Enviar invitación", "Send invoice").`,
        });
      }
    }
  }

  // --- 5. Generic confirmations ---
  if (surfaceMatches(surfaceId, cfg.no_generic_confirmation || [])) {
    for (const entry of ux.generic_confirmations || []) {
      if (!appliesTo(entry, language)) continue;
      const re = new RegExp(escapeRegex(entry.phrase), 'iu');
      if (re.test(cleaned)) {
        findings.push({
          severity: 'warning',
          path: `surfaces.${surfaceId}`,
          rule: 'generic-confirmation',
          message: `"${entry.phrase}" without naming the consequence. Use "¿Eliminar 12 archivos?" not "¿Estás seguro?".`,
        });
      }
    }
  }

  // --- 6. Error prefix anti-pattern ---
  if (surfaceMatches(surfaceId, cfg.no_error_prefix || [])) {
    for (const entry of ux.error_prefix_patterns || []) {
      if (!appliesTo(entry, language)) continue;
      try {
        const re = new RegExp(entry.regex, 'i');
        if (re.test(original)) {
          findings.push({
            severity: 'warning',
            path: `surfaces.${surfaceId}`,
            rule: 'error-prefix-redundant',
            message: 'Avoid prefixes like "Error:" or "Aviso:". The visual treatment communicates severity; the words should explain what happened.',
          });
          break;
        }
      } catch {
        // invalid regex in VOICE.md — silently skip; checkSchema would catch
      }
    }
  }

  // --- 7. Passive voice ---
  if (surfaceMatches(surfaceId, cfg.prefer_active_voice || [])) {
    for (const entry of ux.passive_voice_patterns || []) {
      if (!appliesTo(entry, language)) continue;
      try {
        const re = new RegExp(entry.regex, 'i');
        if (re.test(cleaned)) {
          findings.push({
            severity: 'info',
            path: `surfaces.${surfaceId}`,
            rule: 'passive-voice',
            message: 'Possible passive voice detected. Prefer active: "no pudimos completar" > "no se pudo completar".',
          });
          break;
        }
      } catch {
        // skip invalid regex
      }
    }
  }

  // --- 8. Microcopy density (microcopy_max_sentences) ---
  if (
    typeof ux.microcopy_max_sentences === 'number' &&
    Array.isArray(ux.microcopy_surfaces) &&
    ux.microcopy_surfaces.includes(surfaceId)
  ) {
    const sentences = cleaned.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length > ux.microcopy_max_sentences) {
      findings.push({
        severity: 'warning',
        path: `surfaces.${surfaceId}`,
        rule: 'microcopy-too-dense',
        message: `Microcopy should be ≤ ${ux.microcopy_max_sentences} sentences. Found ${sentences.length}. Split into multiple surfaces or trim.`,
      });
    }
  }

  return findings;
}
