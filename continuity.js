// TLVphoto Lab service continuity check (README.md). Node 20, no packages.
const fs = require("fs"), { execSync } = require("child_process");
const DAY = 86400000, today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
const iso = d => new Date(d).toISOString().slice(0, 10);
const env = k => process.env[k] || "";
const REMIND = +env("REMIND_DAYS") || 120, RELEASE = +env("RELEASE_DAYS") || 180;
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (_) { return d; } };
const st = read("state.json", {});
const say = s => { console.log(s); fs.writeFileSync(".summary", s); };
if (!st.last_seen) st.last_seen = iso(today);

function issue(title, body) {
  // one open issue per title; GitHub mails the repository owner about a new issue
  try {
    const open = JSON.parse(execSync(`gh issue list --state open --json title`).toString()).some(i => i.title === title);
    if (!open) execSync(`gh issue create --title ${JSON.stringify(title)} --body ${JSON.stringify(body)}`);
  } catch (e) { console.log("issue: " + e.message); }
}
async function get(q) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(env("API") + "?" + q + "&t=" + Date.now(), { signal: AbortSignal.timeout(30000), headers: { "User-Agent": "tlvphoto-continuity" } });
      const j = await r.json(); if (j && j.ok) return j;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 20000));
  }
  return null;
}
function release(key, why) {
  fs.writeFileSync("release.json", JSON.stringify({ release: key, date: iso(today), why }, null, 1) + "\n");
  issue("The TLVphoto release key is published", "release.json now holds the signed release key (" + why + "). Every TLVphoto licence code works offline on any computer from now on. This can't be taken back.");
  say("release key published: " + why);
}

(async () => {
  if (read("release.json", {}).release) { say("already released"); return; }
  const a = env("ACTION");
  if (a === "release") {
    if (env("CONFIRM") !== "RELEASE") { console.log("type RELEASE in confirm to publish"); process.exit(1); }
    const s = await get("release"), key = (s && s.release) || env("RELEASE_KEY");
    if (!key) { console.log("no release key: set the RELEASE_KEY secret"); process.exit(1); }
    release(key, "published by hand"); return;
  }
  const alive = await get("alive");
  let seen = new Date(st.last_seen + "T00:00:00Z");
  if (alive) {
    st.server_ok = iso(today);
    // the sealed key vault (no one can open it before the release key is out): a fresh copy once a week
    const old = read("vault.json", {});
    if (!old.date || today - new Date(old.date + "T00:00:00Z") >= 7 * DAY) { const v = await get("vault"); if (v && v.vault) fs.writeFileSync("vault.json", JSON.stringify({ vault: v.vault, date: iso(today) }, null, 1) + "\n"); }
    const s = new Date(today - alive.idle * DAY);
    // keep the state file quiet: it moves only when the owner's last activity moved by a week or more
    if (s - seen >= 7 * DAY || s < seen) { st.last_seen = iso(s); seen = s; }
    if (alive.released) { const r = await get("release"); if (r && r.release) { release(r.release, "released by the accounts server"); fs.writeFileSync("state.json", JSON.stringify(st, null, 1) + "\n"); return; } }
  } else console.log("accounts server not reachable; last owner activity " + st.last_seen);
  // "here" from this workflow counts too (for when the server is down; the server keeps its own count)
  if (a === "here") { st.here = iso(today); issueClose(); }
  if (st.here && new Date(st.here + "T00:00:00Z") > seen) seen = new Date(st.here + "T00:00:00Z");
  const idle = Math.round((today - seen) / DAY);
  if (idle >= RELEASE) {
    if (env("RELEASE_KEY")) release(env("RELEASE_KEY"), idle + " days without the owner");
    else issue("Release due but RELEASE_KEY is missing", "The owner has been away " + idle + " days, but this repository has no RELEASE_KEY secret.");
  } else if (idle >= REMIND) {
    issue("TLVphoto: are you there?", "No owner activity for " + idle + " days. In " + (RELEASE - idle) + " days the release key will be published and every licence code will work offline for good.\n\nTo reset the count: open the TLVphoto admin page, or click \"I'm here\" in the reminder mail, or run this workflow by hand with action \"here\".");
    say("reminder, idle " + idle);
  } else say("ok, idle " + idle);
  // a monthly mark keeps the repository active (GitHub stops schedules after 60 quiet days)
  if (!st.checked || today - new Date(st.checked + "T00:00:00Z") >= 30 * DAY) st.checked = iso(today);
  fs.writeFileSync("state.json", JSON.stringify(st, null, 1) + "\n");
})();
function issueClose() { try { execSync(`gh issue list --state open --json number,title`).toString() && JSON.parse(execSync(`gh issue list --state open --json number,title`).toString()).filter(i => i.title === "TLVphoto: are you there?").forEach(i => execSync(`gh issue close ${i.number} --comment "The owner is here."`)); } catch (_) {} }
