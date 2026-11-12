---
key: SCHED-4468
title: "spacing: move hard-coded margins to the spacing scale"
status: open
labels: [agent-ready, from:product]
---

## Intent
Some components still set their own margins and padding. Move every one to the 4 px scale in the tokens (DES-3). Nothing visible changes. Until this ships, a denser layout cannot come from the spacing scale.

## Acceptance
- Given the component sources, when they are searched for margin and padding values, then every value is a spacing-scale token.
- Given any page, when it is rendered before and after the change, then the layout is the same, pixel for pixel.
- Given the spacing scale, when the change is diffed, then no step outside the 4 px scale is added.
- Given a component, when it is reviewed, then it does not set a margin or padding that is not a token.

## Boundaries
- Must not change any layout a user sees.

Allowed by AUT-1 (bringing code in line with a rule in `specs/` when nothing visible changes).
