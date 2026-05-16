// experiment/offline-test.js
//
// Offline A/B: same prompts as ab-test.js, but the outputs are generated
// manually (by Claude, the assistant) in two conditions:
//
//   A: bare context — "you're a marketing copywriter for a LATAM agency"
//   B: full VOICE.md contract loaded
//
// Each output is scored against its surface using the real VOICE.md linter.
// This is reproducible: the linter score doesn't depend on which LLM produced
// the text. The same input → same findings.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lint, lintString } from '../src/linter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VOICE_PATH = path.join(__dirname, '..', 'examples', 'VOICE.md');
const voiceTokens = lint(fs.readFileSync(VOICE_PATH, 'utf8')).voiceSystem;

// ---- Test cases with two outputs each ---------------------------------- //

const CASES = [
  {
    id: 'linkedin-post-loop-marketing',
    surface: 'linkedin-post',
    prompt:
      'Post LinkedIn (800-1500 chars) sobre por qué el funnel está obsoleto ' +
      'y por qué Loop Marketing es el sucesor. CMOs de empresas medianas. ' +
      'Pregunta abierta al final. Al menos un dato.',
    without_voice: `El funnel de marketing tradicional ha sido un pilar fundamental durante décadas, pero el comportamiento del consumidor moderno ha evolucionado más rápido que nuestras herramientas para entenderlo.

Hoy, los consumidores no avanzan linealmente desde el awareness hasta la conversión. Investigan, comparan, abandonan, regresan, recomiendan y vuelven a comprar en ciclos no lineales que el funnel tradicional simplemente no captura.

Es por eso que estamos viendo el surgimiento de Loop Marketing como un enfoque más realista y data-driven. Esta metodología innovadora permite a las marcas potenciar su crecimiento a través de soluciones integrales que abrazan la naturaleza circular del journey del consumidor.

Algunos beneficios clave:
- Mejor retención de clientes existentes
- Resultados positivos en métricas de engagement
- Optimización continua basada en aprendizajes reales
- Una experiencia de cliente de clase mundial

Las empresas líderes en LATAM ya están migrando hacia este modelo. Un estudio reciente mostró que las marcas que adoptan loop marketing ven una mejora significativa en su NPS.

La pregunta es: ¿tu estrategia de marketing sigue atrapada en el modelo lineal del siglo pasado, o ya está evolucionando hacia el futuro?

#MarketingDigital #Innovation #GrowthMarketing`,
    with_voice: `Tu funnel asume que el consumidor hace fila. No la hace. Nunca la hizo.

El journey de compra no es lineal y nunca lo fue. Los datos de tu CRM lo gritan: el 73% de tus leads vuelven a fases anteriores antes de convertir. Y aun así, seguimos midiendo como si bajaran por un tobogán.

Loop Marketing estructura la actividad como un ciclo continuo de cuatro fases — Express, Tailor, Amplify, Evolve — donde cada fase alimenta la siguiente. Ningún trimestre empieza de cero. Los insights de Evolve se convierten en el brief del próximo Express.

La diferencia operativa es concreta: en un funnel, los reportes celebran impresiones. En Loop Marketing, los reportes lideran con pipeline influenced y CAC. Las métricas de actividad pasan a contexto. El protagonista es el revenue.

No es teoría. Sky Airline logró +127% de tráfico orgánico compitiendo contra LATAM Airlines en un mercado donde LATAM tiene más del 70% de share. La clave fue circular con el consumidor, no perseguirlo por un tubo recto.

¿Tu último reporte mensual te dice cuántas piezas creativas generaron pipeline y cuáles solo generaron likes?

#LoopMarketing #MarketingLATAM #GrowthMarketing`,
  },

  {
    id: 'email-subject-nurturing',
    surface: 'email-subject',
    prompt:
      'Subject de email (max 50 chars) para invitar a un CMO a un ' +
      'diagnóstico gratuito de su sistema de medición.',
    without_voice: '🚀 Potencia tus resultados con nuestro diagnóstico gratuito',
    with_voice: 'Auditamos tu medición en 30 minutos. Sin costo.',
  },

  {
    id: 'web-headline-services',
    surface: 'web-headline',
    prompt:
      'Hero headline (max 12 palabras) para servicios. Operaciones ' +
      'creativas con inteligencia artificial.',
    without_voice:
      'Soluciones integrales de operaciones creativas data-driven impulsadas por inteligencia artificial de clase mundial',
    with_voice: 'Creatividad a escala. Sin perder el control.',
  },

  {
    id: 'web-paragraph-creative-measurement',
    surface: 'web-paragraph',
    prompt:
      'Párrafo (max 3 líneas) sobre por qué medir las piezas creativas ya ' +
      'no es opcional. Provocador pero con argumento.',
    without_voice:
      'En el competitivo mundo del marketing moderno, medir las piezas creativas se ha vuelto fundamental para potenciar el crecimiento de tu marca y obtener resultados positivos. Las soluciones integrales de medición permiten optimizar cada campaña de manera continua. No esperes más para implementar las mejores prácticas del mercado.',
    with_voice:
      'La creatividad sin métrica es un gasto. Con métrica es una inversión. Si no puedes conectar una pieza con pipeline, será la primera línea del recorte presupuestario.',
  },
];

// ---- Run linter on every output ---------------------------------------- //

function score(output, surfaceId) {
  const findings = lintString(voiceTokens, surfaceId, output);
  return {
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
    rules_violated: [
      ...new Set(findings.map((f) => f.rule)),
    ],
    findings,
  };
}

const results = CASES.map((c) => {
  const a = score(c.without_voice, c.surface);
  const b = score(c.with_voice, c.surface);
  return {
    id: c.id,
    surface: c.surface,
    prompt: c.prompt,
    without_voice: { output: c.without_voice, ...a },
    with_voice: { output: c.with_voice, ...b },
    delta_errors: a.errors - b.errors,
    delta_warnings: a.warnings - b.warnings,
  };
});

const summary = {
  cases_tested: results.length,
  total_errors_without_voice: results.reduce((s, r) => s + r.without_voice.errors, 0),
  total_errors_with_voice: results.reduce((s, r) => s + r.with_voice.errors, 0),
  total_warnings_without_voice: results.reduce((s, r) => s + r.without_voice.warnings, 0),
  total_warnings_with_voice: results.reduce((s, r) => s + r.with_voice.warnings, 0),
};

console.log(JSON.stringify({ summary, results }, null, 2));
