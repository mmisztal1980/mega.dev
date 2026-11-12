---
key: SCHED-4463
title: "type: move hard-coded font sizes to the type scale"
status: open
labels: [agent-ready, from:product]
---

## Intent
Some components still set their own font sizes. Move every size to the type scale in the tokens (DES-1). Nothing visible changes. Until this ships, a text-size setting cannot follow the type scale.

## Acceptance
- Given the component sources, when they are searched for font sizes, then every size is a type-scale token.
- Given any page, when it is rendered before and after the change, then the text is the same size, pixel for pixel.
- Given the type scale, when the change is diffed, then no new size is added to the scale.
- Given a component, when it is reviewed, then it does not set a font size that is not a token.

## Boundaries
- Must not change any size a user sees.
- Must not add steps to the type scale.

Allowed by AUT-1 (bringing code in line with a rule in `specs/` when nothing visible changes).
