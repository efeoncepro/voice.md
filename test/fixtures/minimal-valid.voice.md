---
name: Minimal Brand
description: A minimal valid VOICE.md for tests.
language:
  primary: en-US
  treatment: you
personality:
  traits:
    - direct
    - honest
beliefs:
  - id: simple-is-good
    statement: Simple is better than complex.
audiences:
  - id: general
    name: General audience
    is_default: true
surfaces:
  - id: tweet
    name: Tweet
    max_length: 280
    unit: characters
    forbid_emoji: false
lexicon:
  protected_terms:
    - term: Acme
      never: ["acme", "ACME"]
  forbidden:
    - phrase: synergy
      reason: corporate-jargon
---

## Overview

This is a minimal valid VOICE.md. The brand is Acme.

## Personality

Direct and honest.

## Beliefs

Simple is better than complex.

## Audiences

General audience only.

## Surfaces

Tweet only.

## Lexicon

Acme is the only protected term.
