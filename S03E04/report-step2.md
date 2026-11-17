## System Diff
Build 62448d5ae6b1 against step 1's build 49f8041df3a7. It is live at https://megadevs03e04.cloud-tek.io.

**Product's decision:** "New incidents stay live at the top and Ack stays on the row, but Ack asks to confirm, and the confirm names the incident id." This is option 3 from the step-1 report. It is filed as SCHED-4515 and written into plan.md R2.

- **Behavior:** Ack on a row no longer sends the ack. It opens a confirm bound to that row's incident id, not to a list position. Only the confirm's **Ack** calls `api.ack(id)` for the id the confirm names, then marks that row acked. **Cancel** or Escape closes the confirm and sends nothing. A refresh while the confirm is open does not change what it acks. R1 (live inserts at the top), R3, R4, R5 and R6 are unchanged.
- **UX:** The confirm is a centered dialog (role alertdialog). Its text names the incident first: "Ack INC-5127? notifications · us-west · calendar push rejected", with Cancel and Ack buttons, and focus on Ack. Every ack now takes two clicks. In return, a click that lands on a shifted row shows the wrong id before anything is sent.
- **Data:** No change to the API or to what is stored. The ack request is the same (`/ack?id=&cursor=`), and it is sent only after the confirm. A cancelled confirm sends no request.
- **Plan:** R2 is rewritten in plan.md. The hooks table gains three rows.
- **data-testid hooks:** added `confirm` (the dialog; its text names the incident id, and `data-id` holds it too), `confirm-ack` and `confirm-cancel`. The pinned hooks are unchanged, and `ack` still sits on each row: `board`, `loader`, `empty`, `incident-list`, `incident-row`, `ack`, `acked`, `build-sha`.
- **Code:** `app/app.js:65` (row Ack opens the confirm), `app/app.js:76` (`askConfirm`, binds the id), `app/app.js:92-108` (cancel / ack), `app/index.html:20-26` (the dialog), `app/style.css` (dialog styles), `plan.md` R2 and the hooks table, `issues/SCHED-4515-confirm-ack.md`.

## What you checked
I recorded the same take as step 1, on build 62448d5ae6b1 (Chromium, Europe/Berlin, en-GB):
- 00:00: the loader shows, then 8 incidents, newest first, in local dd/mm time.
- 00:10: INC-4444 arrives live at the top. I put the pointer on INC-4622's Ack and held it there.
- 00:16: INC-5740 arrives, and the list shifts down one row. The click lands on INC-5127's Ack. The confirm opens and names **INC-5127**, so nothing is sent.
- 00:18: I press Cancel. No ack request is sent.
- 00:19: I press Ack on INC-4622. The confirm names **INC-4622**.
- 00:21: I press the confirm's Ack. The ack API answers for INC-4622, and only INC-4622's row shows acked.

I ran the course's replay (replay-f08ed2e7.mjs, sha256 f08ed2e7…cfd4, unedited) on this machine against the live URL with the nonce. It exits 0 with no unmet checks. Its three person-like acks each hit the intended incident: INC-4622, INC-5127 and INC-4444.

```evidence
{
  "sha": "62448d5ae6b1",
  "videoLink": "https://megadevs03e04.cloud-tek.io/recordings/step2.webm"
}
```
