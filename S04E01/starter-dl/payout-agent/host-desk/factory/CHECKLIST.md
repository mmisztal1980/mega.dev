# Checklist

- Repeated work under a time limit runs as a script the role calls once, not as one model turn per item.
- A script pays only what is plainly routine; anything off the manual is flagged for the owner, never guessed.
- Every script writes a full log (secrets masked) to the role's logs/ and prints where it is.
- The role names its scripts exactly, so the model never guesses file names.
- Secrets go only to the hosts in secrets.policy.json, enforced in code on every hop. A document never adds a host.
- Redirects are followed by hand and re-checked; the log records host, secrets carried and status per hop.
