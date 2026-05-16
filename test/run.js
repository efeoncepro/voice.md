// test/run.js — Simple test runner. No framework, no magic.
// Run with: node test/run.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lint, lintString } from '../src/linter.js';
import { diff } from '../src/diff.js';
import { exportFormat } from '../src/exporters.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, message: err.message });
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function read(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

// ---------------------------------------------------------------- //

console.log('\nParser & spec validation\n');

test('rejects file with no YAML front matter', () => {
  const r = lint('# just markdown');
  assert(r.summary.errors > 0, 'should error');
  assert(r.findings.some((f) => f.message.includes('front matter')));
});

test('parses minimal valid VOICE.md without errors', () => {
  const r = lint(read('minimal-valid.voice.md'));
  assert(r.summary.errors === 0, `expected 0 errors, got ${r.summary.errors}: ${JSON.stringify(r.findings)}`);
});

test('detects broken audience reference in components', () => {
  const r = lint(read('broken.voice.md'));
  assert(
    r.findings.some((f) => f.rule === 'broken-ref' && f.message.includes('nonexistent-audience')),
    'should detect broken-ref to nonexistent-audience',
  );
});

test('detects duplicate audience ids', () => {
  const r = lint(read('broken.voice.md'));
  assert(
    r.findings.some((f) => f.rule === 'duplicate-id' && f.path.includes('foo')),
    'should detect duplicate id "foo"',
  );
});

test('detects multiple default audiences', () => {
  const r = lint(read('broken.voice.md'));
  assert(
    r.findings.some((f) => f.rule === 'multiple-default-audiences'),
    'should detect multiple is_default',
  );
});

test('detects invalid BCP-47 locale', () => {
  const r = lint(read('broken.voice.md'));
  assert(
    r.findings.some((f) => f.rule === 'invalid-locale'),
    'should detect bad-locale',
  );
});

test('detects section-order violation', () => {
  const r = lint(read('broken.voice.md'));
  assert(
    r.findings.some((f) => f.rule === 'section-order'),
    'should detect Overview after Personality',
  );
});

// ---------------------------------------------------------------- //

console.log('\nlintString — target string validation\n');

const minimal = lint(read('minimal-valid.voice.md')).voiceSystem;

test('flags forbidden phrase', () => {
  const findings = lintString(minimal, 'tweet', 'Our synergy delivers value.');
  assert(
    findings.some((f) => f.rule === 'forbidden-term-used'),
    'should flag "synergy"',
  );
});

test('flags protected-term violation (lowercase variant)', () => {
  const findings = lintString(minimal, 'tweet', 'I love acme.');
  assert(
    findings.some((f) => f.rule === 'protected-term-violation'),
    'should flag "acme" → must be "Acme"',
  );
});

test('passes clean text', () => {
  const findings = lintString(minimal, 'tweet', 'Acme builds simple products.');
  const errors = findings.filter((f) => f.severity === 'error');
  assert(errors.length === 0, `expected no errors, got: ${JSON.stringify(errors)}`);
});

test('flags length exceeded', () => {
  const longText = 'a'.repeat(500);
  const findings = lintString(minimal, 'tweet', longText);
  assert(
    findings.some((f) => f.rule === 'length-limit-exceeded'),
    'should flag length',
  );
});

test('rejects unknown surface id', () => {
  const findings = lintString(minimal, 'nonexistent-surface', 'hello');
  assert(
    findings.some((f) => f.message.includes('Unknown surface')),
    'should reject unknown surface',
  );
});

test('flags multiple exclamation marks', () => {
  const findings = lintString(minimal, 'tweet', 'Wow! Amazing! Incredible!');
  assert(
    findings.some((f) => f.rule === 'too-many-exclamations'),
    'should flag triple !',
  );
});

// ---------------------------------------------------------------- //

console.log('\nEfeonce VOICE.md (productive file)\n');

const efeoncePath = path.join(__dirname, '..', 'examples', 'VOICE.md');
const efeonceSource = fs.readFileSync(efeoncePath, 'utf8');

test('Efeonce VOICE.md parses without errors', () => {
  const r = lint(efeonceSource);
  const errors = r.findings.filter((f) => f.severity === 'error');
  assert(
    errors.length === 0,
    `expected 0 errors, got ${errors.length}: ${JSON.stringify(errors, null, 2)}`,
  );
});

test('Efeonce VOICE.md catches "soluciones integrales" in a tweet', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(
    tokens,
    'linkedin-hook',
    'Te ofrecemos soluciones integrales para tu negocio.',
  );
  assert(
    findings.some((f) => f.rule === 'forbidden-term-used'),
    'should flag soluciones integrales',
  );
});

test('Efeonce VOICE.md catches "loop marketing" lowercase in web headline', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'web-headline', 'Conoce el loop marketing');
  assert(
    findings.some((f) => f.rule === 'protected-term-violation'),
    'should flag lowercase variant',
  );
});

test('Efeonce VOICE.md respects "Loop Marketing" canonical form', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'web-headline', 'Conoce Loop Marketing');
  const errors = findings.filter((f) => f.severity === 'error');
  assert(errors.length === 0, `expected no errors, got: ${JSON.stringify(errors)}`);
});

test('Efeonce VOICE.md catches motif in institutional surface', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(
    tokens,
    'email-subject',
    'Te lo explico con manzanitas 🍏🍏🍏',
  );
  assert(
    findings.some((f) => f.rule === 'reserved-motif-used'),
    'should flag manzanitas in institutional',
  );
});

test('Efeonce VOICE.md flags emoji in email-subject', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'email-subject', 'Resultados 🚀');
  assert(
    findings.some((f) => f.rule === 'emoji-forbidden-here'),
    'should flag emoji in email subject',
  );
});

test('Efeonce VOICE.md flags hero headline > 12 words', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const headline =
    'Somos la mejor agencia de marketing digital de toda Latinoamérica para tu empresa';
  const findings = lintString(tokens, 'web-headline', headline);
  assert(
    findings.some((f) => f.rule === 'length-limit-exceeded'),
    'should flag too-long headline',
  );
});

test('Efeonce VOICE.md flags "potenciar" anywhere', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(
    tokens,
    'linkedin-post',
    'Potenciar tu marca es nuestra misión.'.padEnd(810, ' eso es loop marketing.'),
  );
  assert(
    findings.some((f) => f.rule === 'forbidden-term-used'),
    'should flag potenciar',
  );
});

// ---------------------------------------------------------------- //

console.log('\nDiff\n');

test('diff detects added forbidden phrase', () => {
  const before = read('minimal-valid.voice.md');
  const after = before.replace(
    `  forbidden:
    - phrase: synergy
      reason: corporate-jargon`,
    `  forbidden:
    - phrase: synergy
      reason: corporate-jargon
    - phrase: leverage
      reason: corporate-jargon`,
  );
  const result = diff(before, after);
  assert(
    result.tokens.forbidden.added.includes('leverage'),
    `expected "leverage" in added, got ${JSON.stringify(result.tokens.forbidden)}`,
  );
});

test('diff regression flag: true when after has more errors', () => {
  const before = read('minimal-valid.voice.md');
  const after = read('broken.voice.md');
  const result = diff(before, after);
  assert(result.regression === true, 'regression should be true');
});

// ---------------------------------------------------------------- //

console.log('\nExporters\n');

test('export json produces parseable JSON', () => {
  const json = exportFormat(read('minimal-valid.voice.md'), 'json');
  const parsed = JSON.parse(json);
  assert(parsed.name === 'Minimal Brand');
  assert(parsed.forbidden.length === 1);
  assert(parsed.protected_terms[0].canonical === 'Acme');
});

test('export prompt produces non-empty string', () => {
  const prompt = exportFormat(read('minimal-valid.voice.md'), 'prompt');
  assert(prompt.includes('Voice System Prompt'));
  assert(prompt.includes('Acme'));
});

test('export eslint-config produces a valid module string', () => {
  const cfg = exportFormat(read('minimal-valid.voice.md'), 'eslint-config');
  assert(cfg.includes('module.exports'));
  assert(cfg.includes('no-restricted-syntax'));
  assert(cfg.includes('synergy'));
});

test('export Efeonce VOICE.md to prompt — captures real beliefs', () => {
  const prompt = exportFormat(efeonceSource, 'prompt');
  assert(prompt.includes('vanity-metrics'), 'should mention vanity-metrics belief');
  assert(prompt.includes('Loop Marketing'), 'should keep Loop Marketing protected');
  assert(prompt.includes('manzanitas'), 'should warn about reserved motif');
});

// ---------------------------------------------------------------- //

console.log('\nStemmer (Spanish flexion detection)\n');

const { stemEs, stemTokens } = await import('../src/stemmer-es.js');

test('stems infinitive verbs', () => {
  assert(stemEs('potenciar') === stemEs('potenciamos'), 'potenciar = potenciamos');
  assert(stemEs('potenciar') === stemEs('potencian'), 'potenciar = potencian');
  assert(stemEs('potenciar') === stemEs('potenciarán'), 'potenciar = potenciarán');
});

test('stems adjective gender/number variations', () => {
  assert(stemEs('robusto') === stemEs('robusta'));
  assert(stemEs('robusto') === stemEs('robustos'));
  assert(stemEs('robusto') === stemEs('robustas'));
});

test('stems agent nouns (-ador, -adora, -adores)', () => {
  assert(stemEs('innovador') === stemEs('innovadora'));
  assert(stemEs('innovador') === stemEs('innovadores'));
});

test('stemTokens returns Set of stems', () => {
  const stems = stemTokens('Potenciamos tu marca con soluciones');
  assert(stems instanceof Set);
  assert(stems.has(stemEs('potenciar')), 'should contain potenciar stem');
});

// ---------------------------------------------------------------- //

console.log('\nSanitizer (Markdown + placeholder stripping)\n');

const { sanitize } = await import('../src/sanitize.js');

test('strips single-brace placeholders', () => {
  assert(sanitize('Hola {nombre}, bienvenido').trim() === 'Hola , bienvenido');
});

test('strips JS interpolation including the dollar sign', () => {
  const out = sanitize('${greeting}, mundo').trim();
  assert(!out.includes('$'), `expected no $, got: ${JSON.stringify(out)}`);
});

test('strips bold and italic markers but keeps text', () => {
  assert(sanitize('**bienvenido**') === 'bienvenido');
  assert(sanitize('_tarea_') === 'tarea');
});

test('strips inline code but preserves surrounding text', () => {
  const out = sanitize('Use `pnpm` para instalar');
  assert(out.includes('Use'));
  assert(out.includes('para instalar'));
  assert(!out.includes('`'));
});

test('keeps link text but drops URL', () => {
  const out = sanitize('Click [aquí](https://example.com) para continuar');
  assert(out.includes('aquí'));
  assert(!out.includes('https://'));
});

test('strips list markers at line start', () => {
  const out = sanitize('- primero\n- segundo');
  assert(!out.includes('- '));
  assert(out.includes('primero'));
  assert(out.includes('segundo'));
});

// ---------------------------------------------------------------- //

console.log('\nStem-based forbidden detection\n');

test('catches flexion of "potenciar" in arbitrary surface', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'linkedin-post',
    'Esto te potenciará el negocio'.padEnd(810, ' Loop Marketing.'));
  assert(
    findings.some((f) => f.rule === 'forbidden-term-used' && f.message.includes('potenciar')),
    'should catch "potenciará" as flexion of forbidden "potenciar"',
  );
});

test('catches flexion of "innovador" → "innovadora"', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'web-headline', 'Una innovadora solución');
  assert(
    findings.some((f) => f.rule === 'forbidden-term-used' && f.message.includes('innovador')),
    'should catch "innovadora" as flexion of forbidden "innovador"',
  );
});

test('does NOT false-positive on unrelated word with similar stem', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'web-headline', 'Construye sistemas reales');
  const violations = findings.filter((f) => f.severity === 'error');
  assert(violations.length === 0, `unexpected violations: ${JSON.stringify(violations)}`);
});

// ---------------------------------------------------------------- //

console.log('\nMarkdown-aware lexical checks\n');

test('does not flag forbidden word inside placeholder', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  // "{potenciar}" looks like a templating variable, not actual copy
  const findings = lintString(tokens, 'web-headline', 'Sistema {potenciar}');
  assert(
    !findings.some((f) => f.rule === 'forbidden-term-used'),
    'should not flag forbidden phrase inside placeholder',
  );
});

test('still flags forbidden word in **bold**', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'web-headline', 'Algo **potenciar** algo');
  assert(
    findings.some((f) => f.rule === 'forbidden-term-used'),
    'should flag word even when bolded',
  );
});

// ---------------------------------------------------------------- //

console.log('\nA2 enforcement rules — CTA action verb\n');

test('cta-button without action verb produces warning', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'cta-button', 'Información adicional');
  assert(
    findings.some((f) => f.rule === 'cta-missing-action-verb'),
    'should warn about missing action verb',
  );
});

test('cta-button with action verb passes', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'cta-button', 'Agenda demo');
  assert(
    !findings.some((f) => f.rule === 'cta-missing-action-verb'),
    'should accept imperative verb start',
  );
});

// ---------------------------------------------------------------- //

console.log('\nA2 enforcement rules — error blames user\n');

test('error-message that blames user is flagged', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'error-message',
    'Ingresaste mal el código. Debes intentarlo de nuevo. Por favor revisa.');
  assert(
    findings.some((f) => f.rule === 'error-blames-user'),
    'should flag user-blaming error',
  );
});

test('error-message that describes system state passes', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'error-message',
    'El código no coincide. Intenta nuevamente con otro código.');
  assert(
    !findings.some((f) => f.rule === 'error-blames-user'),
    'should accept neutral framing',
  );
});

test('portal-alert-error inherits blame_user: forbidden', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'portal-alert-error',
    'Olvidaste completar el campo obligatorio. Debes revisar.');
  assert(
    findings.some((f) => f.rule === 'error-blames-user'),
    'should propagate blame_user check to portal alerts',
  );
});

// ---------------------------------------------------------------- //

console.log('\nA2 enforcement rules — structure\n');

test('error-message with only 1 sentence warns about incomplete structure', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'error-message', 'Algo salió mal');
  assert(
    findings.some((f) => f.rule === 'structure-incomplete'),
    'should warn — needs 2 sentences (what-happened, what-to-do)',
  );
});

test('error-message with 2 sentences passes structure check', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'error-message',
    'El servidor no respondió. Inténtalo en unos segundos.');
  assert(
    !findings.some((f) => f.rule === 'structure-incomplete'),
    'should pass',
  );
});

// ---------------------------------------------------------------- //

console.log('\nA2 enforcement rules — hashtags\n');

test('linkedin-post missing mandatory hashtag is flagged', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const body = 'A'.repeat(810) + ' #MarketingDigital #GrowthMarketing #B2B';
  const findings = lintString(tokens, 'linkedin-post', body);
  assert(
    findings.some((f) => f.rule === 'missing-mandatory-hashtag'),
    'should flag missing #LoopMarketing',
  );
});

test('linkedin-post with mandatory hashtag passes', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const body = 'A'.repeat(810) + ' #LoopMarketing #B2B #GrowthMarketing';
  const findings = lintString(tokens, 'linkedin-post', body);
  assert(
    !findings.some((f) => f.rule === 'missing-mandatory-hashtag'),
    'should pass',
  );
});

test('linkedin-post with too few hashtags warns', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const body = 'A'.repeat(810) + ' #LoopMarketing';
  const findings = lintString(tokens, 'linkedin-post', body);
  assert(
    findings.some((f) => f.rule === 'too-few-hashtags'),
    'should warn about < min hashtags',
  );
});

// ---------------------------------------------------------------- //

console.log('\nA2 enforcement rules — sentence-case detection\n');

test('web-headline with Title Case in opening is flagged', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'web-headline', 'La Mejor Solución Para Tu Negocio');
  assert(
    findings.some((f) => f.rule === 'title-case-detected'),
    'should detect Title Case opening',
  );
});

test('web-headline in sentence case passes', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'web-headline', 'La mejor solución para tu negocio');
  assert(
    !findings.some((f) => f.rule === 'title-case-detected'),
    'should pass sentence case',
  );
});

// ---------------------------------------------------------------- //

console.log('\nPortal surfaces (new in 0.1.0-alpha.3)\n');

test('portal-button-primary catches non-verb start', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'portal-button-primary', 'Información');
  assert(
    findings.some((f) => f.rule === 'cta-missing-action-verb'),
    'primary button should require action verb',
  );
});

test('portal-kpi-title length capped at 24 chars', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'portal-kpi-title',
    'Revenue per Asset por trimestre acumulado');
  assert(
    findings.some((f) => f.rule === 'length-limit-exceeded'),
    'should flag long KPI title',
  );
});

test('portal-aria-label forbids artificial caps', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'portal-aria-label', 'AVISO IMPORTANTE');
  assert(
    findings.some((f) => f.rule === 'artificial-caps-detected'),
    'aria-label should not use shouty caps',
  );
});

test('portal-snackbar-error blames-forbidden + emoji-forbidden', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'portal-snackbar-error',
    'Ingresaste mal el dato 🚨');
  const rules = findings.map((f) => f.rule);
  assert(rules.includes('error-blames-user'), 'should flag user blame');
  assert(rules.includes('emoji-forbidden-here'), 'should flag emoji');
});

test('email-transactional-subject forbids artificial caps and emoji', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'email-transactional-subject',
    'IMPORTANTE: revisa tu cuenta 🚨');
  const rules = findings.map((f) => f.rule);
  assert(rules.includes('artificial-caps-detected'));
  assert(rules.includes('emoji-forbidden-here'));
});

test('nexa-narrative-short catches forbidden phrase in generated insight', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'nexa-narrative-short',
    'Tu campaña tuvo resultados positivos este trimestre.');
  assert(
    findings.some((f) => f.rule === 'forbidden-term-used'),
    'should catch forbidden "resultados positivos"',
  );
});

test('Efeonce VOICE.md now declares 49 surfaces', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  assert(
    tokens.surfaces.length === 49,
    `expected 49 surfaces, got ${tokens.surfaces.length}`,
  );
});

// ---------------------------------------------------------------- //

console.log('\nException context (audience-aware lexicon)\n');

test('"data-driven" allowed for technical-digital audience', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'linkedin-post',
    'Migramos a una arquitectura data-driven para el equipo de Growth.'.padEnd(810, ' Loop Marketing.'),
    { audienceId: 'technical-digital' });
  assert(
    !findings.some((f) => f.rule === 'forbidden-term-used' && f.message.includes('data-driven')),
    'should allow data-driven for technical audience via exception',
  );
});

test('"data-driven" forbidden for strategic-executive audience', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'linkedin-post',
    'Somos una agencia data-driven.'.padEnd(810, ' Loop Marketing.'),
    { audienceId: 'strategic-executive' });
  assert(
    findings.some((f) => f.rule === 'forbidden-term-used' && f.message.includes('data-driven')),
    'should still forbid for non-technical audience',
  );
});

// ---------------------------------------------------------------- //

console.log('\nFase B — UX writing rules (NN/g + Polaris + Mailchimp)\n');

const fbTokens = lint(efeonceSource).voiceSystem;

test('filler word "por favor" flagged in portal-validation-message', () => {
  const findings = lintString(fbTokens, 'portal-validation-message',
    'Por favor ingresa un email válido');
  assert(
    findings.some((f) => f.rule === 'filler-word' && f.message.includes('por favor')),
    'should flag "por favor"',
  );
});

test('filler word "simplemente" flagged in portal-helper-text', () => {
  const findings = lintString(fbTokens, 'portal-helper-text',
    'Simplemente ingresa tu correo');
  assert(
    findings.some((f) => f.rule === 'filler-word'),
    'should flag "simplemente"',
  );
});

test('filler word NOT flagged in marketing surface (web-headline)', () => {
  const findings = lintString(fbTokens, 'web-headline',
    'Simplemente medible');
  assert(
    !findings.some((f) => f.rule === 'filler-word'),
    'should NOT apply filler rules to non-product surfaces',
  );
});

test('system-as-actor "la aplicación" flagged in error-message', () => {
  const findings = lintString(fbTokens, 'error-message',
    'La aplicación no pudo guardar. Intenta de nuevo.');
  assert(
    findings.some((f) => f.rule === 'system-as-actor'),
    'should flag "la aplicación" as system actor',
  );
});

test('system-as-actor "el sistema" flagged in portal-alert-error', () => {
  const findings = lintString(fbTokens, 'portal-alert-error',
    'El sistema detectó un error. Por favor reintenta.');
  assert(
    findings.some((f) => f.rule === 'system-as-actor'),
    'should flag "el sistema"',
  );
});

test('first-person plural "no pudimos" passes (active voice, user-facing)', () => {
  const findings = lintString(fbTokens, 'error-message',
    'No pudimos guardar tus cambios. Inténtalo de nuevo.');
  assert(
    !findings.some((f) => f.rule === 'system-as-actor'),
    'should NOT flag first-person plural framing',
  );
});

test('performative apology "lo sentimos" flagged in snackbar-error', () => {
  const findings = lintString(fbTokens, 'portal-snackbar-error',
    'Lo sentimos, hubo un problema');
  assert(
    findings.some((f) => f.rule === 'performative-apology'),
    'should flag "lo sentimos"',
  );
});

test('performative apology "disculpe las molestias" flagged', () => {
  const findings = lintString(fbTokens, 'portal-alert-error',
    'Disculpe las molestias mientras restauramos el servicio.');
  assert(
    findings.some((f) => f.rule === 'performative-apology'),
    'should flag "disculpe las molestias"',
  );
});

test('generic CTA "Enviar" alone flagged on portal-button-primary', () => {
  const findings = lintString(fbTokens, 'portal-button-primary', 'Enviar');
  assert(
    findings.some((f) => f.rule === 'generic-cta'),
    'should flag bare "Enviar"',
  );
});

test('CTA "Enviar invitación" passes (verb + specific object)', () => {
  const findings = lintString(fbTokens, 'portal-button-primary', 'Enviar invitación');
  assert(
    !findings.some((f) => f.rule === 'generic-cta'),
    'should accept verb + object',
  );
});

test('generic confirmation "¿Estás seguro?" flagged', () => {
  const findings = lintString(fbTokens, 'portal-confirmation-message',
    '¿Estás seguro? Esta acción es permanente.');
  assert(
    findings.some((f) => f.rule === 'generic-confirmation'),
    'should flag generic confirmation',
  );
});

test('specific confirmation "¿Eliminar 12 archivos?" passes', () => {
  const findings = lintString(fbTokens, 'portal-confirmation-message',
    '¿Eliminar 12 archivos? Esta acción no se puede deshacer.');
  assert(
    !findings.some((f) => f.rule === 'generic-confirmation'),
    'should accept consequence-naming confirmation',
  );
});

test('error prefix "Error:" flagged in error-message', () => {
  const findings = lintString(fbTokens, 'error-message',
    'Error: No se pudo procesar el pago. Reintenta.');
  assert(
    findings.some((f) => f.rule === 'error-prefix-redundant'),
    'should flag redundant "Error:" prefix',
  );
});

test('error without prefix passes', () => {
  const findings = lintString(fbTokens, 'error-message',
    'No pudimos procesar el pago. Verifica los datos de tu tarjeta.');
  assert(
    !findings.some((f) => f.rule === 'error-prefix-redundant'),
    'should accept prefix-less error',
  );
});

test('passive voice "fue procesado" detected', () => {
  const findings = lintString(fbTokens, 'portal-snackbar-success',
    'El pedido fue procesado correctamente');
  assert(
    findings.some((f) => f.rule === 'passive-voice'),
    'should detect "fue procesado"',
  );
});

test('active voice "procesamos el pedido" passes', () => {
  const findings = lintString(fbTokens, 'portal-snackbar-success',
    'Procesamos tu pedido correctamente');
  assert(
    !findings.some((f) => f.rule === 'passive-voice'),
    'should accept active voice',
  );
});

test('microcopy density: 4 sentences in tooltip exceeds limit', () => {
  const findings = lintString(fbTokens, 'portal-tooltip',
    'Esto es una explicación. Tiene mucho detalle. Y más detalle. Y aún más detalle.');
  assert(
    findings.some((f) => f.rule === 'microcopy-too-dense'),
    'should flag tooltip with 4 sentences',
  );
});

test('microcopy density: 2 sentences in tooltip passes', () => {
  const findings = lintString(fbTokens, 'portal-tooltip',
    'Click para expandir. Muestra el detalle completo.');
  assert(
    !findings.some((f) => f.rule === 'microcopy-too-dense'),
    'should accept 2-sentence tooltip',
  );
});

test('runUxRules skips when surface is not in applies_to lists', () => {
  // blog-paragraph is not in any UX rule's applies_to_surfaces
  const findings = lintString(fbTokens, 'blog-paragraph',
    'La aplicación lo sentimos por favor');  // would trigger 3 rules if scoped
  assert(
    !findings.some((f) => ['filler-word', 'system-as-actor', 'performative-apology'].includes(f.rule)),
    'should not run UX rules on non-product surface',
  );
});

// ---------------------------------------------------------------- //

console.log('\nMulti-language UX rules (en-US, pt-BR)\n');

// Build a synthetic VOICE.md with language: en-US for these tests
const englishVoice = efeonceSource.replace('primary: es-419', 'primary: en-US');

test('filler word "please" flagged in English VOICE.md', () => {
  const tokens = lint(englishVoice).voiceSystem;
  const findings = lintString(tokens, 'portal-validation-message',
    'Please enter a valid email');
  assert(
    findings.some((f) => f.rule === 'filler-word'),
    'should flag "please" when language=en-US',
  );
});

test('filler word "por favor" NOT flagged when language=en-US', () => {
  const tokens = lint(englishVoice).voiceSystem;
  const findings = lintString(tokens, 'portal-validation-message',
    'Por favor ingresa email');
  // "por favor" has applies_to: [es-419, es-ES], so in en-US doc it should NOT trigger
  assert(
    !findings.some((f) => f.rule === 'filler-word' && f.message.includes('por favor')),
    'should respect language scoping of filler words',
  );
});

test('generic-cta "Submit" flagged in en-US', () => {
  const tokens = lint(englishVoice).voiceSystem;
  const findings = lintString(tokens, 'portal-button-primary', 'Submit');
  assert(
    findings.some((f) => f.rule === 'generic-cta'),
    'should flag bare "Submit" in en-US',
  );
});

// Portuguese
const portugueseVoice = efeonceSource.replace('primary: es-419', 'primary: pt-BR');

test('filler word "atualmente" flagged in pt-BR', () => {
  const tokens = lint(portugueseVoice).voiceSystem;
  const findings = lintString(tokens, 'portal-helper-text',
    'Atualmente o sistema não está disponível');
  assert(
    findings.some((f) => f.rule === 'filler-word'),
    'should flag "atualmente" in pt-BR',
  );
});

test('system-as-actor "o sistema" flagged in pt-BR error-message', () => {
  const tokens = lint(portugueseVoice).voiceSystem;
  const findings = lintString(tokens, 'error-message',
    'O sistema não conseguiu processar. Tente novamente.');
  assert(
    findings.some((f) => f.rule === 'system-as-actor'),
    'should flag "o sistema"',
  );
});

test('"o sistema" NOT flagged in es-419 (language scoping)', () => {
  const tokens = lint(efeonceSource).voiceSystem;
  const findings = lintString(tokens, 'error-message',
    'O sistema falhou'); // pt-BR phrase in es-419 doc
  assert(
    !findings.some((f) => f.rule === 'system-as-actor'),
    'should respect language scoping',
  );
});

// ---------------------------------------------------------------- //

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  console.log('FAILURES:');
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.message}`);
  }
  process.exit(1);
}
