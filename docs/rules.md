# Linting Rules

The VOICE.md linter runs the following rules. Each rule produces findings at a
fixed severity.

## Schema rules (run on `voice-md lint <file>`)

| Rule | Severity | What it checks |
|------|----------|----------------|
| `missing-required-field` | error | Required top-level field is absent (`name`, `language`, `personality`, `beliefs`, `audiences`, `surfaces`) |
| `invalid-locale` | warning | `language.primary` is not a valid BCP-47 locale |
| `missing-default-audience` | error | No audience marked `is_default: true` — the denominator-common rule needs one |
| `multiple-default-audiences` | error | More than one audience has `is_default: true` |
| `duplicate-id` | error | Two entries in the same group share an `id` |
| `broken-ref` | error | A component references an unknown `audience` or `surface`; a unit references an unknown trait (warning); a reserved motif references an unknown unit (warning) |
| `section-order` | warning | `##` sections appear out of canonical order |
| `orphaned-term` | info | A protected term is defined in YAML but never referenced in prose or components |

## String validation rules (run on `voice-md lint-string`)

| Rule | Severity | What it checks |
|------|----------|----------------|
| `length-limit-exceeded` | error | Target string exceeds the surface's `max_length` |
| `length-below-minimum` | warning | Target string falls below the surface's `min_length` |
| `forbidden-term-used` | error | Target string contains a phrase from `lexicon.forbidden[]` |
| `protected-term-violation` | error | Target string contains a "never" variation of a protected term |
| `reserved-motif-used` | warning | Target string contains a reserved motif outside its owner's surfaces |
| `emoji-forbidden-here` | error | Target string contains emoji on a `forbid_emoji: true` surface |
| `artificial-caps-detected` | warning | Target string uses all-caps emphasis outside acronyms |
| `too-many-exclamations` | warning | Target string has more than one `!` |

## Exit codes

| Command | Exit 0 | Exit 1 | Exit 2 |
|---------|--------|--------|--------|
| `lint` | no errors | one or more errors | parse failure or invalid invocation |
| `lint-string` | no errors | one or more errors | unknown surface |
| `diff` | no regression | regression detected | parse failure |
| `export` | success | (n/a) | invalid format or parse failure |

## Future rules (not in alpha)

- `reading-level-out-of-range` — Flesch-Kincaid Spanish out of declared range
- `tone-mismatch` — LLM-judged tone drift across consecutive surfaces
- `audience-coverage-gap` — Surface lacks examples for all declared audiences
- `example-pair-required` — Declarative rules without matching do/dont pair
