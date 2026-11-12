---
key: SCHED-4412
title: "colours: move hard-coded colours to design tokens"
status: open
labels: [agent-ready, from:product]
---

## Intent
Components still carry raw hex values. Move every colour in components to the `--color-*` tokens (DES-2). Nothing visible changes. Until this ships, a new colour scheme cannot be a token set.

## Acceptance
- Given the component sources, when they are searched for raw hex, rgb() or named colours, then there are none; every colour is a `--color-*` token.
- Given any page, when it is rendered before and after the change, then it looks the same, pixel for pixel.
- Given the change, when the tokens file is diffed, then no new colour value is added and no existing value is changed.
- Given a component, when it is reviewed, then it does not contain a colour that is not a token.

## Boundaries
- Must not change any colour a user sees.
- Must not add new colour values to the palette.

Allowed by AUT-1 (bringing code in line with a rule in `specs/` when nothing visible changes).
