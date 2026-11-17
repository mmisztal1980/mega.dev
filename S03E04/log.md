# S03E04 — show me when — log

## 2026-11-12 start-challenge
- start-challenge(c0000000-0000-4000-8000-0000005e03e4) → session v1.eyJ…(masked, saved in session.secret), expires 2026-11-19T19:15:32Z
- starter: https://hq.mega.dev/media/show-me-when/sched-prod-board-2dff0937.zip
- api: https://hq.mega.dev/challenges/show-me-when/api
- task: build 4 ready issues, deploy board to public https, recording + report (step 1); product answers; rebuild + prove (step 2).
- Waiting for human go-ahead before step 1.
- downloaded starter.zip
- built SCHED-4511..4514 + R6 in app/app.js, index.html, style.css; config.js filled (session)
- local smoke ok in 3 tz; watching insert rate
- human: proceed (deploy + redeploys of sched-prod-board Worker)
- deployed sched-prod-board v 00674ff5-1ecb-403a-b315-9799c594f124 at https://megadevs03e04.cloud-tek.io, build 29481aaee748
- recording step1 (recordings/step1/events.json): open 00:00, new incident 00:10, pointer on Ack of INC-4622 00:11, list shifted 00:16, click 00:16 landed on INC-5127, ack reply 00:17 receipt a1.-aCn…(masked; full in events.json)
- report-step1.md written; recording at https://megadevs03e04.cloud-tek.io/recordings/step1.webm (build 49f8041df3a7)
- claim step1 #1 rejected: 'Which row did you mean, and which got the ack? Name them in the evidence block as expected and got (incident ids).' → added expected/got
- claim step1 #2: progress. product answers ~2026-11-12T22:33:48Z via resume-challenge {productReceipt} (saved in session.secret)
- resume: product chose confirm on Ack naming incident id; hooks confirm, confirm-ack, confirm-cancel; replay f08ed2e7, local run chosen
- deployed build 62448d5ae6b1 (SCHED-4515 confirm); replay local exit 0 unmet [] (replay/out-1.json); recording step2 at /recordings/step2.webm; report-step2.md written
- claim step2: SOLVED 2026-11-12T22:37:55Z (replay local, unmet [])
