# VOICE.md Specification

**Version:** alpha
**Status:** Active development. Schema may change before stable release.

A VOICE.md file describes a brand's communicational identity in a format
that AI coding agents and content agents can read and validate.

## File Structure

A VOICE.md file has two layers:

1. **YAML front matter** — Machine-readable voice tokens, delimited by `---`
   fences at the top of the file.
2. **Markdown body** — Human-readable voice rationale organized into `##`
   sections.

The tokens are the normative values. The prose provides context for how to
apply them. Tokens win when they conflict with prose.

## Token Schema

```yaml
version: <string>              # optional, current: "alpha"
name: <string>
description: <string>          # optional

language:
  primary: <BCP-47 code>       # e.g. es-419, en-US, pt-BR
  treatment: <enum>            # tu | usted | vos | you | thou
  contractions: <enum>         # allowed | forbidden

personality:
  archetypes: <string[]>
  traits: <string[]>

register:
  default: <string>
  formality: <enum>            # low | medium | high
  emoji_policy: <enum>         # institutional-zero | sparing | allowed
  exclamation_marks: <string>
  ellipsis_policy: <enum>
  semicolon_policy: <enum>

beliefs:
  - id: <string>               # kebab-case stable identifier
    statement: <string>

lexicon:
  protected_terms:
    - term: <string>           # canonical form
      first_mention: <string>  # optional, used on first occurrence
      never: <string[]>        # forbidden variations
      context: <string>        # optional disambiguation
  forbidden:
    - phrase: <string>
      reason: <string>
      exception: <string>      # optional
  reserved_motifs:
    - motif: <string>
      owner: <string>
      forbidden_in: <unit-id[]>

audiences:
  - id: <kebab-case>
    name: <string>
    personas: <string[]>
    vocabulary: <string[]>
    proof_type: <enum>
    is_default: <boolean>      # exactly one audience must be true
    inverts_accessible_depth: <boolean>

surfaces:
  - id: <kebab-case>
    name: <string>
    max_length: <number>
    min_length: <number>       # optional
    unit: <enum>               # words | characters | lines | sentences
    case: <enum>               # sentence-case | title-case | upper | lower
    forbid_emoji: <boolean>
    forbid_artificial_caps: <boolean>
    structure: <string[]>      # ordered required sections
    blame_user: <enum>         # allowed | forbidden
    cta_count: <number>
    hashtags: { min, max, mandatory }
    requires_action_verb: <boolean>

tones:
  - id: <kebab-case>
    name: <string>
    pattern: <enum>
    density_sentences: { min, max }

units:
  - id: <kebab-case>
    name: <string>
    personality_emphasis: <trait-id[]>
    recurring_theme: <string>

formatting:
  capitalization: <enum>
  quotation_marks: <enum>      # english-double | english-single | spanish
  em_dash: <string>            # exact whitespace pattern
  hyphen_use: <string[]>
  numbers:
    threshold_letters: <number>
    impact_data: <enum>
    percent_symbol: <enum>     # required | optional
    currency_symbol: <enum>
    thousands_separator: <string>
    decimal_separator: <string>
    millions_abbreviation: <string>
  emphasis:
    bold: <string[]>
    italic: <string[]>
    underline: <enum>          # allowed | forbidden
    all_caps: <string[]>

components:
  <component-name>:
    audience: <audience-id>
    surface: <surface-id>
    sections: <string[]>
    open_with: <string>
    forbid_open_with: <string>
    lead_with: <string>
    forbid_lead_with: <string>
    structure: <string[]>
    close_options: <string[]>
    forbid_close: <string>
```

## Token Types

| Type | Format | Example |
|------|--------|---------|
| Audience reference | `audience-id` | `strategic-executive` |
| Surface reference | `surface-id` | `email-subject` |
| Trait reference | `trait-id` | `proof-obsession` |
| BCP-47 language | locale string | `es-419`, `pt-BR` |
| Token reference (prose) | `{path.to.token}` | `{lexicon.protected_terms.Globe}` |

## Section Order

Sections use `##` headings. Sections can be omitted, but those present must
appear in this order:

| # | Section | Aliases |
|---|---------|---------|
| 1 | Overview | Brand Voice |
| 2 | Personality | |
| 3 | Beliefs | |
| 4 | Register | |
| 5 | Lexicon | |
| 6 | Audiences | |
| 7 | Surfaces | |
| 8 | Tones | |
| 9 | Units | |
| 10 | Formatting | |
| 11 | Components | |
| 12 | Do's and Don'ts | |

## Default Audience

Exactly one entry in `audiences[]` must have `is_default: true`. This audience
is used by the linter and by consumer agents when the interlocutor is not
identified or when content is shared across multiple personas (the
denominator-common rule).

## Reserved Motifs

`lexicon.reserved_motifs[]` declares editorial devices owned by derived
voices (founder personal brand, AI personas, etc.). The institutional voice
and all units listed in `forbidden_in` must not use these motifs.

The motif owner concept is what differentiates VOICE.md from DESIGN.md — a
visual token cannot be "owned" by a sub-voice, but a phrase or device can.

## Consumer Behavior for Unknown Content

| Scenario | Behavior |
|----------|----------|
| Unknown section heading | Preserve; do not error |
| Unknown surface property | Accept with warning |
| Unknown audience id referenced by component | Error |
| Unknown trait id referenced by unit | Warning |
| Duplicate audience id | Error |
| Duplicate surface id | Error |
| Missing `is_default` audience | Error |
| Multiple `is_default` audiences | Error |

## Validation Layers

VOICE.md validation runs at two layers:

**Layer 1 — Spec validation.** The linter validates the VOICE.md file itself
against this schema (token references, default audience, section order, etc.).
This is fully deterministic.

**Layer 2 — Output validation.** When a `surface_id` is attached to a string
in a consuming codebase (via ESLint plugin, runtime tagging, or eval set),
the linter validates that string against the surface's rules. This is also
deterministic for length, case, forbidden phrases, and protected terms.

A future Layer 3 (LLM-judged tone and reading level) is on the roadmap but
not part of the alpha spec.

## Versioning

VOICE.md files declare a `version` field at the root. Consumer tools should:

- Accept any version that matches their supported major.
- Warn on unknown minor versions but proceed.
- Reject unknown major versions.

The spec itself uses semantic versioning starting at `0.1.0-alpha`.
