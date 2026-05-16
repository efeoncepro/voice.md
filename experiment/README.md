# A/B Experiment

Two scripts that compare LLM output **with** and **without** the VOICE.md
contract loaded as a system prompt. The linter scores both, deterministically.

## `offline-test.js`

Outputs are pre-generated (no API key required). Run:

```bash
node experiment/offline-test.js > offline-results.json
```

The current snapshot of results lives in `offline-results.json`. Summary:

| Surface | Without VOICE.md | With VOICE.md |
|---------|------------------|---------------|
| linkedin-post | 7 errors | 0 |
| email-subject | 2 errors | 0 |
| web-headline | 4 errors | 0 |
| web-paragraph | 3 errors | 0 |
| **Total** | **16** | **0** |

## `ab-test.js`

Same harness, but calls the Anthropic API live. Requires:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
node experiment/ab-test.js > live-results.json
```

Each test case runs twice per condition by default (4 API calls per case × 4
cases = 16 calls, ~$0.20 in tokens). Increase `TEST_CASES` to 20+ for
statistically meaningful results before integrating to production.
