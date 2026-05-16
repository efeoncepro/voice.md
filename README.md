# VOICE.md

A format specification for describing a brand's communicational identity to AI
agents. VOICE.md gives agents a persistent, structured understanding of how a
brand speaks — its lexicon, tone, beliefs, audiences, and per-surface
constraints — and a linter that validates both the spec and the strings agents
produce against it.

VOICE.md is to copy and tone what
[DESIGN.md](https://github.com/google-labs-code/design.md) is to visual
identity.

## Why this exists

Coding agents now have AGENTS.md for repository conventions and DESIGN.md for
visual systems. Content has nothing comparable. Brand voice lives in PDFs and
Notion pages that humans read but agents can't validate against, so every LLM
that produces copy for a brand — Verk Agent generating posts, Claude Code
writing UI strings, Cursor producing email templates — relies on whatever
voice context happens to be inlined into the current prompt. The result is
drift across surfaces and across runs.

VOICE.md fixes this by being a single, versionable, lint-able source of truth
that an agent reads once at session start and that CI can verify against every
PR.

## The Format

A VOICE.md file combines machine-readable voice tokens (YAML front matter)
with human-readable rationale (markdown prose). Tokens give agents exact
values. Prose tells them *why* those values exist and how to apply them.

```yaml
---
name: Efeonce Group
language:
  primary: es-419
  treatment: tu
personality:
  traits:
    - architect-hands-dirty
    - uncomfortable-honesty
    - proof-obsession
beliefs:
  - id: vanity-metrics-pact
    statement: Las vanity metrics son un acuerdo de silencio entre agencia y cliente.
lexicon:
  protected_terms:
    - term: "Loop Marketing"
      never: ["loop marketing", "LM", "el Loop"]
  forbidden:
    - phrase: "soluciones integrales"
      reason: jerga-agencia-genérica
audiences:
  - id: strategic-executive
    name: Estratégico-Ejecutivo
    is_default: true
surfaces:
  - id: email-subject
    max_length: 50
    unit: characters
    forbid_emoji: true
---

## Overview

Efeonce sounds like a director of strategy who built the system they operate.
...
```

An agent that reads this file knows exactly how to write an email subject for
Efeonce, what phrases to avoid, what terminology to protect, and which audience
to address by default.

## Getting Started

Validate a VOICE.md against the spec — catch broken references, missing
defaults, forbidden phrases, and structural issues — as structured JSON that
agents can act on.

```bash
npx @efeonce/voice.md lint VOICE.md
```

```json
{
  "findings": [
    {
      "severity": "error",
      "path": "lexicon.forbidden:soluciones integrales",
      "rule": "forbidden-term-used",
      "message": "Forbidden phrase \"soluciones integrales\" used. Reason: jerga-agencia-genérica."
    }
  ],
  "summary": { "errors": 1, "warnings": 0, "info": 0 }
}
```

Validate a target string against a specific surface — this is what CI hooks
into:

```bash
npx @efeonce/voice.md lint-string VOICE.md email-subject "Potenciar tu negocio 🚀"
```

```json
{
  "findings": [
    { "rule": "forbidden-term-used", "message": "Forbidden phrase \"potenciar\" used." },
    { "rule": "emoji-forbidden-here", "message": "Surface \"email-subject\" forbids emoji." }
  ],
  "summary": { "errors": 2 }
}
```

Compare two versions to detect regressions:

```bash
npx @efeonce/voice.md diff VOICE.md VOICE-v2.md
```

Exits with code 1 if the new version has more errors or warnings than the old —
plug it into CI.

## Exporting

VOICE.md becomes useful when other systems consume it.

```bash
# Inject this block as a system prompt for your content agents
npx @efeonce/voice.md export --format prompt VOICE.md > voice-prompt.md

# Generate an ESLint config that fails build on forbidden phrases in JSX strings
npx @efeonce/voice.md export --format eslint-config VOICE.md > .eslintrc.voice.cjs

# Flat JSON for i18n linters or custom tooling
npx @efeonce/voice.md export --format json VOICE.md > voice.json
```

## Spec

The full VOICE.md specification lives at
[`docs/spec.md`](./docs/spec.md). The full rules table lives at
[`docs/rules.md`](./docs/rules.md).

Output the spec for injection into agent prompts:

```bash
npx @efeonce/voice.md spec
npx @efeonce/voice.md spec --rules
npx @efeonce/voice.md spec --rules-only
```

## Token Schema (condensed)

| Section | Purpose |
|---------|---------|
| `language` | Locale, treatment (tu/usted/you/etc), contractions |
| `personality` | Archetypes and named traits |
| `register` | Default formality, emoji policy, punctuation rules |
| `beliefs[]` | Inheritable narrative DNA — every piece must trace to at least one |
| `lexicon.protected_terms[]` | Canonical names with their forbidden variations |
| `lexicon.forbidden[]` | Phrases that dilute voice, with reasons |
| `lexicon.reserved_motifs[]` | Editorial devices owned by sub-voices |
| `audiences[]` | Registers per buyer persona, with one `is_default` |
| `surfaces[]` | Per-channel constraints: length, case, structure |
| `tones[]` | Modulation patterns (explain, condense, provoke, instruct, demonstrate) |
| `units[]` | Sub-brands with personality emphasis on parent traits |
| `formatting` | Capitalization, numbers, emphasis, currency |
| `components` | Templated piece types (pitch document, client report, etc.) |

See [`examples/VOICE.md`](./examples/VOICE.md) for a complete production-grade
file — the actual VOICE.md used by Efeonce Group across Greenhouse, Kortex,
Verk, and Efeonce Web.

## Status

VOICE.md is at version `alpha`. The spec, token schema, and CLI are under
active development. Expect changes as the format matures.

## License

Apache 2.0. Contributions welcome.

## Why Apache 2.0?

Same license as
[DESIGN.md](https://github.com/google-labs-code/design.md) and
[AGENTS.md](https://agents.md). Maximizes adoption in enterprise contexts and
removes friction for derivative tooling.

## Authors

Created and maintained by [Efeonce Group SpA](https://efeoncepro.com), an
ASaaS (Agency-as-a-Service) operating in Chile, Colombia, México, and Perú.
