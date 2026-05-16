---
name: Test Broken VOICE
language:
  primary: bad-locale
audiences:
  - id: foo
    name: Foo
    is_default: true
  - id: foo
    name: Foo Duplicate
    is_default: true
surfaces:
  - id: tweet
    name: Tweet
    max_length: 280
    unit: characters
components:
  test-component:
    audience: nonexistent-audience
    surface: tweet
---

## Personality

Body content.

## Overview

Sections out of order — Overview should come before Personality.
