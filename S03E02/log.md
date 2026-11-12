# S03E02 — nothing ships unmarked — log

## 2026-11-10 start-challenge
- challengeId c0000000-0000-4000-8000-0000005e03e2
- session saved to session.secret (v1.eyJ…bRQ masked), expires 2026-11-11T12:20:40Z
- repo zip: https://hq.mega.dev/media/nothing-ships-unmarked/sched-prod-3e6e841d.zip
- api: https://hq.mega.dev/challenges/nothing-ships-unmarked/api
- ask: triage every request into tracker; each open issue labeled agent-ready or needs-human; README names issue file format
- skill: own skill named `triage`; send its text with tracker; check-lane skill-wiring
- submit: claim-challenge answer { session, tracker {kind md files | kind gh ghJson}, skill {name,path,text} } ≤256KB

## collect + triage
- collector run 1: backlog 17, desk 4, chat 2, mail 4 (10 requests)
- triaged all; checker found 6 acceptance lists without a must-not line → fixed
- collector run 2 (re-poll): desk 4, chat 2, mail 1 new — IN-9776 clashes with IN-8541 (mm/dd), IN-8087 clashes with IN-8530 (bookings@), IN-5260 = 2 problems merged by tove → split, IN-1966 dup of SCHED-4418, IN-3740 dup of IN-1629, IN-1699, IN-7404 new
- run 3: desk 2 (IN-6901 keyboard picker, IN-8821 invite links = dup of done SCHED-4423)
- run 4: desk 1 (IN-2180 no-show column); run 5 + 6: nothing new; checker (with API coverage) → ok
- skill: .agents/skills/triage (SKILL.md + scripts/check.mjs), linked .claude/skills/triage → harness lists `triage`
- runs 7–11: mail IN-3976 (withdraws IN-3084) → IN-3084 closed not-planned; mail IN-5481 → merged into SCHED-4498; then 3 empty polls; checker ok

## claim 2026-11-10T12:29:19Z — solved
- stats: 22 requests in → 19 issues · 6 merged · closed 2 dup, 1 contradicts-spec, 1 not-planned · open 21 agent-ready, 3 needs-human
- debrief saved: https://hq.mega.dev/challenges/nothing-ships-unmarked#debrief
- artifact offered: "ask" (in deck, not installed)
