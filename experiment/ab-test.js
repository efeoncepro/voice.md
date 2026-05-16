// experiment/ab-test.js
//
// A/B test: does VOICE.md change LLM output in measurable ways?
//
// For each prompt:
//   Condition A: bare system prompt ("You are a marketing copywriter for Efeonce, a LATAM agency.")
//   Condition B: same bare prompt + VOICE.md exported as system block
//
// For each output:
//   - Pass through the VOICE.md linter, scored against the appropriate surface
//   - Record errors, warnings, and a delta

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { lint, lintString } from '../src/linter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VOICE_PATH = path.join(__dirname, '..', 'examples', 'VOICE.md');
const voiceSource = fs.readFileSync(VOICE_PATH, 'utf8');
const voiceTokens = lint(voiceSource).voiceSystem;

const voicePromptPath = '/tmp/voice-prompt.md';
const voicePromptBlock = fs.readFileSync(voicePromptPath, 'utf8');

const BARE_PROMPT =
  'You are a marketing copywriter for Efeonce, a LATAM marketing agency. ' +
  'You write in Spanish (Latin American neutral). Respond ONLY with the requested ' +
  'copy — no explanations, no preamble, no quotes around the text.';

const WITH_VOICE_PROMPT =
  BARE_PROMPT + '\n\n--- BRAND VOICE CONTRACT ---\n\n' + voicePromptBlock;

// The 4 representative test cases. Each maps a prompt to the VOICE.md surface
// it will be scored against.
const TEST_CASES = [
  {
    id: 'linkedin-post-loop-marketing',
    surface: 'linkedin-post',
    user_prompt:
      'Escribe un post de LinkedIn (entre 800 y 1500 caracteres) explicando ' +
      'por qué el funnel tradicional está obsoleto y por qué Loop Marketing ' +
      'es el sucesor. Audiencia: CMOs de empresas medianas. Termina con una ' +
      'pregunta abierta. Incluye al menos un dato.',
  },
  {
    id: 'email-subject-nurturing',
    surface: 'email-subject',
    user_prompt:
      'Escribe un subject de email (máximo 50 caracteres) para invitar a un ' +
      'CMO a un diagnóstico gratuito de su sistema de medición de marketing.',
  },
  {
    id: 'web-headline-services',
    surface: 'web-headline',
    user_prompt:
      'Escribe un hero headline para la página de servicios de Efeonce ' +
      '(máximo 12 palabras). El servicio principal es operaciones creativas ' +
      'con inteligencia artificial.',
  },
  {
    id: 'web-paragraph-pitch',
    surface: 'web-paragraph',
    user_prompt:
      'Escribe un párrafo (máximo 3 líneas) que explique por qué medir las ' +
      'piezas creativas ya no es opcional. Tono provocador pero respaldado ' +
      'con argumento, no slogan vacío.',
  },
];

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function runOne(systemPrompt, userPrompt) {
  const res = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 800,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  return res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text.trim())
    .join('\n');
}

function score(output, surfaceId) {
  const findings = lintString(voiceTokens, surfaceId, output);
  return {
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
    rules_violated: [...new Set(findings.map((f) => f.rule))],
    findings,
  };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY not set in env.');
    process.exit(2);
  }

  const results = [];

  for (const tc of TEST_CASES) {
    console.error(`\n>>> ${tc.id}`);

    console.error('  [A] without VOICE.md...');
    const outputA = await runOne(BARE_PROMPT, tc.user_prompt);
    const scoreA = score(outputA, tc.surface);

    console.error('  [B] with VOICE.md...');
    const outputB = await runOne(WITH_VOICE_PROMPT, tc.user_prompt);
    const scoreB = score(outputB, tc.surface);

    results.push({
      id: tc.id,
      surface: tc.surface,
      prompt: tc.user_prompt,
      without_voice: { output: outputA, ...scoreA },
      with_voice: { output: outputB, ...scoreB },
      delta: {
        errors: scoreA.errors - scoreB.errors,
        warnings: scoreA.warnings - scoreB.warnings,
      },
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(2);
});
