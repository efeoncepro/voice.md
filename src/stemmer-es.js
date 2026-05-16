// src/stemmer-es.js — Spanish Snowball stemmer (Martin Porter algorithm)
//
// Stems Spanish words to detect inflected forms of forbidden phrases.
// Example: "potenciar" → "potenc"; "potenciamos" → "potenc"; "potenciarán" → "potenc"
//
// Implementation derived from Snowball Spanish algorithm:
// https://snowballstem.org/algorithms/spanish/stemmer.html
//
// Public domain / BSD. Zero dependencies. ~5KB.

const VOWELS = 'aeiouáéíóúü';
const VOWELS_RE = new RegExp(`[${VOWELS}]`);

/**
 * Stem a single Spanish word to its Snowball root.
 *
 * @param {string} word
 * @returns {string} stemmed form
 */
export function stemEs(word) {
  if (!word || word.length < 3) return word;

  let w = word.toLowerCase();

  // Remove accents on stressed forms (Snowball Spanish step 0 prefix)
  w = w.replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
       .replace(/ó/g, 'o').replace(/ú/g, 'u');

  // Compute regions R1 and R2
  const { r1Start, r2Start, rvStart } = computeRegions(w);
  const r1 = (s) => s.slice(r1Start);
  const r2 = (s) => s.slice(r2Start);
  const rv = (s) => s.slice(rvStart);

  // --- Step 0: attached pronoun ---
  const pronouns = [
    'selas', 'selos', 'sela', 'selo', 'les', 'las', 'los',
    'nos', 'me', 'se', 'la', 'le', 'lo',
  ];
  const step0Suffixes = [
    'iéndo', 'ándo', 'ár', 'ér', 'ír',
    'iendo', 'ando', 'ar', 'er', 'ir',
    'yendo',
  ];

  for (const p of pronouns) {
    if (rv(w).endsWith(p)) {
      const beforePronoun = w.slice(0, w.length - p.length);
      for (const suf of step0Suffixes) {
        if (rv(beforePronoun).endsWith(suf)) {
          w = beforePronoun;
          break;
        }
      }
      break;
    }
  }

  // --- Step 1: standard suffix removal ---
  const step1a = [
    'amientos', 'imientos', 'amiento', 'imiento',
    'aciones', 'aciónes', 'aciones',
    'amente', 'idades', 'ancias', 'encias', 'idades',
    'adores', 'edores', 'idores',
    'adoras', 'edoras', 'idoras',
    'antes', 'ancia', 'encia', 'adora', 'osos', 'osas',
    'ables', 'ibles', 'ismos', 'istas',
    'adora', 'ación', 'antes', 'ancia', 'logía', 'logías',
    'ución', 'uciones', 'encia', 'amente', 'aciones',
  ];
  const step1b = [
    'iva', 'ivo', 'ivas', 'ivos',
  ];
  const step1c = [
    'osa', 'oso', 'osas', 'osos',
    'ador', 'ante', 'able', 'ible', 'ismo', 'ista', 'oso',
    'mente', 'idad', 'ivo', 'iva',
  ];

  let modified = false;

  for (const suf of step1a) {
    if (r2(w).endsWith(suf)) {
      w = w.slice(0, w.length - suf.length);
      modified = true;
      break;
    }
  }

  if (!modified) {
    for (const suf of step1c) {
      if (r2(w).endsWith(suf)) {
        w = w.slice(0, w.length - suf.length);
        modified = true;
        break;
      }
    }
  }

  // --- Step 2a: verb suffixes (preceded by 'y' in RV) ---
  if (!modified) {
    const step2a = [
      'yeron', 'yendo', 'yamos', 'yáis',
      'yan', 'yen', 'yas', 'yes', 'ya', 'ye', 'yo', 'yó',
    ];
    for (const suf of step2a) {
      if (rv(w).endsWith(suf)) {
        const before = w.slice(0, w.length - suf.length);
        if (before.endsWith('u')) {
          w = before + suf.charAt(0); // preserve 'y' after 'u'
          modified = true;
          break;
        }
      }
    }
  }

  // --- Step 2b: verb suffixes (others) ---
  if (!modified) {
    const step2b = [
      'aríamos', 'eríamos', 'iríamos',
      'iéramos', 'iésemos', 'aríais', 'eríais', 'iríais',
      'ierais', 'iesemos', 'asteis', 'isteis', 'ábamos',
      'aremos', 'eremos', 'iremos', 'ásemos', 'aríais',
      'ásteis', 'aríais', 'aríamos',
      'aríais', 'aréis', 'eréis', 'iréis',
      'íamos', 'arían', 'arías', 'arán', 'arás',
      'erían', 'erías', 'erán', 'erás',
      'irían', 'irías', 'irán', 'irás',
      'ieron', 'iendo', 'ieran', 'iesen', 'ieras', 'ieses',
      'aban', 'arán', 'aran', 'asen', 'aras', 'ases',
      'aréis', 'ando', 'aron', 'amos', 'aría', 'erás',
      'aron', 'imos', 'ió', 'ían', 'ías', 'éis',
      'ado', 'ido', 'ada', 'ida', 'ase', 'iese',
      'ar', 'er', 'ir', 'as', 'es', 'is', 'an', 'en', 'in',
      'aba', 'ada', 'ada', 'ían', 'ías',
    ];
    for (const suf of step2b) {
      if (rv(w).endsWith(suf)) {
        w = w.slice(0, w.length - suf.length);
        modified = true;
        break;
      }
    }
  }

  // --- Step 3: residual suffix ---
  const step3 = ['os', 'a', 'o', 'á', 'í', 'ó', 'e', 'é'];
  for (const suf of step3) {
    if (rv(w).endsWith(suf)) {
      w = w.slice(0, w.length - suf.length);
      break;
    }
  }

  return w;
}

/**
 * Compute R1, R2, RV regions per Snowball Spanish definition.
 */
function computeRegions(w) {
  let r1Start = w.length;
  let r2Start = w.length;
  let rvStart = w.length;

  // R1 = region after first vowel followed by non-vowel
  for (let i = 0; i < w.length - 1; i++) {
    if (VOWELS_RE.test(w[i]) && !VOWELS_RE.test(w[i + 1])) {
      r1Start = i + 2;
      break;
    }
  }
  // R2 = region after first vowel followed by non-vowel inside R1
  for (let i = r1Start; i < w.length - 1; i++) {
    if (VOWELS_RE.test(w[i]) && !VOWELS_RE.test(w[i + 1])) {
      r2Start = i + 2;
      break;
    }
  }
  // RV: if 2nd letter is consonant, RV after next vowel; if first two are
  // vowels, RV after next consonant; else RV starts at pos 3.
  if (w.length >= 2) {
    if (!VOWELS_RE.test(w[1])) {
      for (let i = 2; i < w.length; i++) {
        if (VOWELS_RE.test(w[i])) {
          rvStart = i + 1;
          break;
        }
      }
    } else if (VOWELS_RE.test(w[0]) && VOWELS_RE.test(w[1])) {
      for (let i = 2; i < w.length; i++) {
        if (!VOWELS_RE.test(w[i])) {
          rvStart = i + 1;
          break;
        }
      }
    } else {
      rvStart = 3;
    }
  }

  return { r1Start, r2Start, rvStart };
}

/**
 * Tokenize text into words and stem each. Returns the set of stems.
 *
 * @param {string} text
 * @returns {Set<string>}
 */
export function stemTokens(text) {
  const tokens = text.toLowerCase().match(/[a-záéíóúüñ]+/gi) || [];
  return new Set(tokens.map((t) => stemEs(t)));
}
