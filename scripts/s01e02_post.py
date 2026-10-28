import json, sys, subprocess, datetime, os
# usage: post.py <workdir> <endpoint> <body-json-file>; sends with curl, logs body and reply with the ticket masked
wd, url, bodyf = sys.argv[1:4]
ticket = open(os.path.join(wd, ".ticket")).read().strip()
body = json.load(open(bodyf)); body["ticket"] = ticket
r = subprocess.run(["curl", "-sS", "-X", "POST", "-H", "Content-Type: application/json", "--data-binary", "@-", "-w", "\n%{http_code}", url],
                   input=json.dumps(body), capture_output=True, text=True)
text, _, status = r.stdout.rpartition("\n")
mask = lambda s: s.replace(ticket, ticket[:6] + "…MASKED")
logged = dict(body); logged["ticket"] = mask(ticket)
with open(os.path.join(wd, "log.md"), "a") as f:
    f.write(f"\n## {datetime.datetime.now().isoformat(timespec='seconds')} POST {url}\n\nBody:\n```json\n{json.dumps(logged, indent=2)}\n```\n\nReply ({status}):\n```\n{mask(text)}\n```\n")
print(status); print(text)
