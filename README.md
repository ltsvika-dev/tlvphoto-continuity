# TLVphoto Lab: service continuity

This public repository keeps a promise to TLVphoto Lab customers: if the service ever stops, the software they paid for keeps working.

Every buyer gets a licence key by email (XXXXX-XXXXX-XXXXX-XXXXX-XXXXX). While the service runs, the code signs a new computer in through the accounts server (with the usual computer limit). If the owner stops looking after the service, this repository publishes a signed **release key** in `release.json`. From then on the app accepts every licence key offline, on any computer, by looking it up in `vault.json`: a weekly copy of all keys, sealed (AES-GCM) so nobody can read it before the release key, which carries the key that opens it, and signed by the server. It holds no e-mails, only a hash of each key with its type and end date:

- lifetime licence: the full version for good
- yearly subscription: the full version until the end date written in its code, then the free version

Online services (updates, online AI) stop with the server.

## How it decides

A scheduled workflow runs every day (`.github/workflows/continuity.yml`):

1. It asks the accounts server how many days ago the owner was last active (`api.php?alive`; every visit to the admin page and the "I'm here" link in the reminder mail count).
2. After `REMIND_DAYS` (120) without activity it opens an issue here, which GitHub mails to the owner. The server also sends its own reminder mails.
3. Once a week it saves a fresh sealed `vault.json`.
4. After `RELEASE_DAYS` (180) it writes `release.json` from the secret `RELEASE_KEY`. If the server already released its own key, that one is copied.
5. If the server can't be reached, the last activity it reported keeps counting, so a server that is gone also leads to the release.

The release key is signed with the server's Ed25519 key, so nobody else can make one, and blocking the app's network does not help anyone: the app only trusts a signed key. A release can't be taken back.

## The owner

- To reset the count: open the admin page, or click "I'm here" in the reminder, or run the workflow by hand with action `here`.
- To release now on purpose: run the workflow by hand with action `release` and type `RELEASE` in the confirm box.
- One time setup: in the admin page, "המשכיות השירות" > "מפתח שחרור ל-GitHub", copy the key into this repository's Settings > Secrets and variables > Actions > New repository secret, name `RELEASE_KEY`.
