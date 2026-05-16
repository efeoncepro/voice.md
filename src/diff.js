// src/diff.js — Token-level diff between two VOICE.md versions.
// Returns regression: true if the "after" file has more errors/warnings than
// "before" (used to gate CI on regressions).

import { lint } from './linter.js';

/**
 * @param {string} beforeSource - Raw VOICE.md content (older version)
 * @param {string} afterSource  - Raw VOICE.md content (newer version)
 */
export function diff(beforeSource, afterSource) {
  const before = lint(beforeSource);
  const after = lint(afterSource);

  if (!before.voiceSystem || !after.voiceSystem) {
    return {
      tokens: {},
      regression: true,
      reason: 'One or both files failed to parse.',
    };
  }

  const result = {
    tokens: {
      audiences: diffById(before.voiceSystem.audiences, after.voiceSystem.audiences),
      surfaces: diffById(before.voiceSystem.surfaces, after.voiceSystem.surfaces),
      tones: diffById(before.voiceSystem.tones, after.voiceSystem.tones),
      units: diffById(before.voiceSystem.units, after.voiceSystem.units),
      beliefs: diffById(before.voiceSystem.beliefs, after.voiceSystem.beliefs),
      forbidden: diffStringArray(
        (before.voiceSystem.lexicon?.forbidden || []).map((f) => f.phrase),
        (after.voiceSystem.lexicon?.forbidden || []).map((f) => f.phrase),
      ),
      protected_terms: diffStringArray(
        (before.voiceSystem.lexicon?.protected_terms || []).map((t) => t.term),
        (after.voiceSystem.lexicon?.protected_terms || []).map((t) => t.term),
      ),
    },
    summary: {
      before: before.summary,
      after: after.summary,
    },
    regression:
      after.summary.errors > before.summary.errors ||
      after.summary.warnings > before.summary.warnings,
  };

  return result;
}

function diffById(beforeArr = [], afterArr = []) {
  const beforeIds = new Set(beforeArr.map((e) => e.id));
  const afterIds = new Set(afterArr.map((e) => e.id));
  const added = [...afterIds].filter((id) => !beforeIds.has(id));
  const removed = [...beforeIds].filter((id) => !afterIds.has(id));
  const modified = [];

  for (const id of afterIds) {
    if (beforeIds.has(id)) {
      const a = beforeArr.find((e) => e.id === id);
      const b = afterArr.find((e) => e.id === id);
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        modified.push(id);
      }
    }
  }

  return { added, removed, modified };
}

function diffStringArray(beforeArr, afterArr) {
  const a = new Set(beforeArr);
  const b = new Set(afterArr);
  return {
    added: [...b].filter((x) => !a.has(x)),
    removed: [...a].filter((x) => !b.has(x)),
  };
}
