#!/usr/bin/env node
// bin/voice-md.js — CLI for VOICE.md
//
// Commands: lint, diff, export, spec
// All accept a file path or `-` for stdin.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lint, lintString } from '../src/linter.js';
import { diff } from '../src/diff.js';
import { exportFormat } from '../src/exporters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const argv = process.argv.slice(2);
const command = argv[0];

if (!command || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

try {
  switch (command) {
    case 'lint':
      cmdLint(argv.slice(1));
      break;
    case 'lint-string':
      cmdLintString(argv.slice(1));
      break;
    case 'diff':
      cmdDiff(argv.slice(1));
      break;
    case 'export':
      cmdExport(argv.slice(1));
      break;
    case 'spec':
      cmdSpec(argv.slice(1));
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(2);
  }
} catch (err) {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(2);
}

function cmdLint(args) {
  const filePath = args[0] || '-';
  const source = readInput(filePath);
  const report = lint(source);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.summary.errors > 0 ? 1 : 0);
}

function cmdLintString(args) {
  // voice-md lint-string <voice-file> <surface-id> <text...>
  const voicePath = args[0];
  const surfaceId = args[1];
  const text = args.slice(2).join(' ');

  if (!voicePath || !surfaceId || !text) {
    throw new Error('Usage: voice-md lint-string <voice-file> <surface-id> <text...>');
  }

  const source = readInput(voicePath);
  const report = lint(source);
  if (!report.voiceSystem) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const findings = lintString(report.voiceSystem, surfaceId, text);
  const summary = {
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
  };
  console.log(JSON.stringify({ findings, summary }, null, 2));
  process.exit(summary.errors > 0 ? 1 : 0);
}

function cmdDiff(args) {
  const beforePath = args[0];
  const afterPath = args[1];
  if (!beforePath || !afterPath) {
    throw new Error('Usage: voice-md diff <before> <after>');
  }
  const before = readInput(beforePath);
  const after = readInput(afterPath);
  const result = diff(before, after);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.regression ? 1 : 0);
}

function cmdExport(args) {
  let format = 'json';
  let file = '-';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--format') {
      format = args[i + 1];
      i++;
    } else {
      file = args[i];
    }
  }
  const source = readInput(file);
  const output = exportFormat(source, format);
  console.log(output);
}

function cmdSpec(args) {
  let format = 'markdown';
  let rulesOnly = false;
  let withRules = false;
  for (const a of args) {
    if (a === '--rules') withRules = true;
    if (a === '--rules-only') rulesOnly = true;
    if (a.startsWith('--format=')) format = a.split('=')[1];
  }

  const specPath = path.join(__dirname, '..', 'docs', 'spec.md');
  const rulesPath = path.join(__dirname, '..', 'docs', 'rules.md');

  let body = '';
  if (rulesOnly) {
    body = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, 'utf8') : '';
  } else {
    body = fs.existsSync(specPath) ? fs.readFileSync(specPath, 'utf8') : '';
    if (withRules && fs.existsSync(rulesPath)) {
      body += '\n\n' + fs.readFileSync(rulesPath, 'utf8');
    }
  }

  if (format === 'json') {
    console.log(JSON.stringify({ spec: body }));
  } else {
    console.log(body);
  }
}

function readInput(filePath) {
  if (filePath === '-') {
    return fs.readFileSync(0, 'utf8');
  }
  return fs.readFileSync(filePath, 'utf8');
}

function printHelp() {
  console.log(`voice-md — VOICE.md linter and toolchain

Usage:
  voice-md lint <file>                       Validate a VOICE.md
  voice-md lint-string <file> <surface> <s>  Validate a target string vs a surface
  voice-md diff <before> <after>             Compare two VOICE.md versions
  voice-md export --format <fmt> <file>      Export to prompt | json | eslint-config
  voice-md spec [--rules] [--rules-only]     Output the spec for agent prompts

All commands accept "-" as filename for stdin.

Exit codes:
  0  no errors
  1  errors found (lint) or regression detected (diff)
  2  invalid invocation or parse failure
`);
}
