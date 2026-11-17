## What you checked
I opened the deployed board (https://megadevs03e04.cloud-tek.io, build 49f8041df3a7) in Chromium, Europe/Berlin time, en-GB locale. I recorded all three flows in one take:

- **open-board** (00:00): the loader shows, then tonight's 8 incidents, newest first. Times show in local time, dd/mm (for example "12/11, 23:19 CET"). The full UTC value stays in `<time datetime>`. The footer and `<meta name="build">` both name 49f8041df3a7.
- **watch-board** (00:10): I did not reload. INC-4444 appears at the top, and the 2-second refresh keeps the board current.
- **ack-incident** (00:10–00:16): I moved the pointer onto the **Ack** button of the third row, INC-4622 (booking-api · us-west · sev2), and held it there. At 00:16 a new incident, INC-5740, arrived at the top. Every row moved down one place (44 px). The button under the pointer was now INC-5127's. The click at 00:16 acked **INC-5127** (notifications · sev3), not INC-4622. The ack API answered for INC-5127 (ackedAt 2026-11-12T22:27:10.122Z, receipt below). INC-4622, the incident on-call meant to take, stays un-acked.

Every issue works as written (SCHED-4511..4514, R1–R6). R1 and R2 together let a live insert move the list under the pointer between aiming and clicking. On-call then takes the wrong incident, and the one they meant stays open, with no warning. New incidents arrived every 6–12 s while I watched. This board will do the same on any busy night.

## When
00:16 in the recording. The pointer is on INC-4622's Ack from 00:10. The list shifts at 00:16, and the same click marks INC-5127 acked. The recording shows an elapsed "rec mm:ss" stamp at the top right and a red dot for the pointer. Both are recording aids and not part of the build.

## Where
- `app/app.js:90`: `render()` inserts new incidents at their newest-first place, which is the top (R1, SCHED-4511), so every row below moves down.
- `app/app.js:108`: the refresh runs every 2 s (R4, SCHED-4513), so an insert can come at any moment, including mid-click.
- `app/app.js:68`: Ack acks whatever row the button belongs to at click time (R2). Nothing checks that this is the row the user aimed at.

## Options for product
1. **Hold new incidents behind a bar.** Keep the list still and show "N new incidents · show" at the top. On-call clicks it, and the new rows slide in. R1 changes from "appear live at the top" to "announced live, inserted on request".
2. **Freeze while the pointer or focus is on the list.** Keep inserting live, but pause inserts while the pointer is over the list or an Ack has focus. Apply the queued inserts when the pointer leaves. R1 stays as it is, but on-call stops seeing new incidents while they are aiming.
3. **Confirm the ack.** Ack opens a one-line confirm that names the incident ("Ack INC-4622 booking-api?"). Then a shifted click cannot ack silently. This adds a click to every ack.
4. **Undo window.** The ack shows "Acked INC-5127 · Undo" for a few seconds before it is final. This needs an un-ack in the API, which the API does not have today.

My recommendation is option 1. It removes the shift instead of guarding against it, and keeps one-click acks.

```evidence
{
  "flow": "ack-incident",
  "at": "00:16",
  "expected": "INC-4622",
  "got": "INC-5127",
  "receipt": "a1.9dro_3NQX0wF6HnU.xEtCtGWDi16c23m9i7-XjUzW3zcEFnzBogbY4oteL9W-5Q_QWTBfOsb_Ppot7Qx9OGJmdsUbQVgp2WiE6gHlScvS0S_3EmIchqqDHt_GopZvM30dHKkL-dCfBShsbekPspAARmgC7Yp-tV5nKpQ3cMgkl-X67D9GYCWrFR8VMHzffsN7GoLMHhD3ZCYINqAHdvcN",
  "sha": "49f8041df3a7",
  "videoLink": "https://megadevs03e04.cloud-tek.io/recordings/step1.webm"
}
```
