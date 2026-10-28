
## 2026-10-27T17:32:53 POST https://hq.mega.dev/challenges/who-said-what/api/audio

Body:
```json
{
  "finding": "03:50",
  "offset": 31.2,
  "ticket": "v1.eyJ\u2026MASKED"
}
```

Reply (403):
```
error code: 1010

```

## 2026-10-27T17:32:53 POST https://hq.mega.dev/challenges/who-said-what/api/video

Body:
```json
{
  "finding": "01:50",
  "offset": 43.0,
  "ticket": "v1.eyJ\u2026MASKED"
}
```

Reply (403):
```
error code: 1010

```

## 2026-10-27T17:33:18 POST https://hq.mega.dev/challenges/who-said-what/api/audio

Body:
```json
{
  "finding": "03:50",
  "offset": 31.2,
  "ticket": "v1.eyJ\u2026MASKED"
}
```

Reply (200):
```
{"receipt":"v1.eyJ…MASKED","expiresAt":"2026-11-10T16:33:18.000Z","note":"Kept. The receipt is yours. Keep it whole. A receipt lasts 14 days; after that, send the reports again.","forHarness":"When you hold both receipts, file the record of last night: one plain text with every word spoken in both recordings, in the order they are listed, and nothing else; the product keeps one record for each night, and the course checks yours word for word against the recordings. POST it as JSON { ticket, record } to https://hq.mega.dev/challenges/who-said-what/api/record. The reply holds a record receipt and what to do next."}
```

## 2026-10-27T17:33:19 POST https://hq.mega.dev/challenges/who-said-what/api/video

Body:
```json
{
  "finding": "01:50",
  "offset": 43.0,
  "ticket": "v1.eyJ\u2026MASKED"
}
```

Reply (200):
```
{"receipt":"v1.eyJ…MASKED","expiresAt":"2026-11-10T16:33:19.000Z","note":"Kept. The receipt is yours. Keep it whole. A receipt lasts 14 days; after that, send the reports again.","forHarness":"When you hold both receipts, file the record of last night: one plain text with every word spoken in both recordings, in the order they are listed, and nothing else; the product keeps one record for each night, and the course checks yours word for word against the recordings. POST it as JSON { ticket, record } to https://hq.mega.dev/challenges/who-said-what/api/record. The reply holds a record receipt and what to do next."}
```

## 2026-10-27T17:34:51 POST https://hq.mega.dev/challenges/who-said-what/api/record

Body:
```json
{
  "record": "Summary for last night. All times are UTC. Service: calendar invites. This summary covers the nightly batch for all changes. Changes shipped before the batch: one. Other records for this night: not received. Mode: read only. Dependency updates: none. Nightly batch: approved at 1:40. Approvals: complete. Pending approvals: none. Notes for the next night: none. Nightly batch: started at 1:50. Signatures: all changes signed. Retries: none needed. Warnings: none logged. Owner notes: none attached. Config drift: not detected. Invites moved by shipped changes: 1870. Storage: within limits. Coverage: unchanged. Changes held back: none. Nightly batch: ended at 2:38. Sync to partner calendars: complete. Health checks: passing on every target. Secret scan: nothing found. Error budget: not touched. First report from a user: received at 3:19. Queue after batch: empty. Next batch: tomorrow night at the usual time. End of summary.\n\nSummary for last night. All times are local plus two hours. Service: calendar invites. This summary covers the nightly batch for all regions. Nightly batch: scheduled for 3:45. Queue before batch: normal. Workers ready: all. Nightly batch: started at 3:50. Regions in scope: all. Time zone data: loaded. Calendar sync: running as planned. Invites moved: 2140. Invites failed: none reported. Tests: passed. Skipped tests: none. Mail delivery: normal. Nightly batch: ended at 4:38. State after batch: clean. Checks after batch: passed. Alerts raised: none. Rollbacks: none. First report from a user: received at 5:19. Reports since then: rising. Build: within limits. Other records for this night: not received. Support queue: open. Next batch: tomorrow night at the usual time. End of summary.",
  "ticket": "v1.eyJ\u2026MASKED"
}
```

Reply (200):
```
{"receipt":"v1.eyJ…MASKED","expiresAt":"2026-11-10T16:34:51.000Z","note":"Kept. The receipt is yours. Keep it whole. It lasts 14 days, like the others.","forHarness":"This session is done. Stop: do not call resume-challenge in this session. The next question is for a new session. Give your human the prompt below, word for word. Fill in only the parts in angle brackets, and add nothing. Show it in one code block, and ask your human to open a new session and paste it.\n\nContinue a MEGA.dev Challenge with the resume-challenge tool.\nChallenge id: <the challengeId>\nAudio receipt: <the audio receipt, exactly>\nVideo receipt: <the video receipt, exactly>\nRecord receipt: <the record receipt, exactly>\nWork only from what resume-challenge returns. Do not open files until the claim is solved."}
```
