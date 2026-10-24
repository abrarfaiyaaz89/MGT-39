// MGT-39 push sender. Runs on GitHub Actions every ~5 minutes (free). No server, no card.
import admin from "firebase-admin";
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
if (!sa.project_id) { console.log("FIREBASE_SERVICE_ACCOUNT secret is missing"); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore(), fcm = admin.messaging();
const APP = "https://abrarfaiyaaz89.github.io/MGT-39/";
const TYPES = { cancel: "Class cancelled", resched: "Rescheduled", extra: "Extra class", room: "Room change", exam: "Exam / Quiz", deadline: "Assignment deadline", general: "Announcement" };
const ANS = { yes: "Class will be held", no: "Class cancelled", later: "Will reschedule" };
const now = Date.now();
const metaRef = db.doc("meta/push"), meta = (await metaRef.get()).data() || {};
const from = (meta.t || now - 10 * 60e3) - 4 * 60e3, done = new Set(meta.done || []);
const list = async q => (await q.get()).docs.map(d => ({ id: d.id, ...d.data() }));
const [notices, reqs, ups, chats, rems] = await Promise.all([
  list(db.collection("notices").where("ts", ">", from)),
  list(db.collection("requests").where("ts", ">", from)),
  list(db.collection("updates").where("answeredAt", ">", admin.firestore.Timestamp.fromMillis(from))),
  list(db.collection("chats").where("lastAt", ">", from)),
  list(db.collection("notices").where("remindAt", ">", from))
]);
const title = n => n.type === "general" ? (n.title || "Notice") : (n.course || "Notice");
const short = (t, k = 120) => String(t || "").replace(/\s+/g, " ").slice(0, k);
const cand = [];
for (const n of notices) if (!(n.exp && n.exp < now)) cand.push({ key: "n:" + n.id, kind: "n", n });
for (const n of rems) if (!(n.exp && n.exp < now)) cand.push({ key: "r:" + n.id + ":" + n.remindAt, kind: "r", n });
for (const r of reqs) cand.push({ key: "q:" + r.id, kind: "q", r });
for (const u of ups) cand.push({ key: "u:" + u.id, kind: "u", u });
for (const c of chats) if (c.lastBy) cand.push({ key: "c:" + c.id + ":" + c.lastAt, kind: "c", c });
const fresh = cand.filter(e => !done.has(e.key));
if (!fresh.length) { await metaRef.set({ t: now, done: [...done].slice(-500) }); console.log("No new events"); process.exit(0); }

const profs = (await db.collection("profiles").get()).docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.ok !== false);
const byId = Object.fromEntries(profs.map(p => [p.id, p]));
const audience = n => {
  const a = n.aud || n.push || (["teacher", "admin"].includes(n.byRole) ? "all" : "students"), set = new Set();
  for (const p of profs) { if (p.id === n.byId || p.role === "admin") continue; if (a === "all" || (a === "students" && (p.role === "student" || p.role === "cr"))) set.add(p.id); }
  for (const id of n.mentions || []) if (id !== n.byId && byId[id]) set.add(id);
  return set;
};
const msgs = [];
for (const e of fresh) {
  let to = new Set(), t = "", b = "";
  if (e.kind === "n") {
    const n = e.n; to = audience(n); t = (TYPES[n.type] || "Notice") + ": " + title(n);
    b = short([n.date, n.time && (n.time + (n.etm ? "–" + n.etm : "")), n.room, n.note].filter(Boolean).join(" · "));
  } else if (e.kind === "r") {
    const n = e.n, seen = n.seen || {}; to = new Set([...audience(n)].filter(id => !seen[id]));
    t = "Please check: " + title(n); b = "You haven't seen this notice yet.";
  } else if (e.kind === "q") {
    const r = e.r; to = new Set((r.mentions || []).filter(id => byId[id]));
    t = "New request from @" + (r.byNick || "CR"); b = short((r.course || "") + ": " + (r.message || ""));
  } else if (e.kind === "u") {
    const u = e.u; for (const p of profs) if ((p.role === "student" || p.role === "cr") && p.id !== u.repById) to.add(p.id);
    t = (ANS[u.status] || "Update") + " · " + (u.course || ""); b = short(u.message);
  } else if (e.kind === "c") {
    const c = e.c; to = new Set((c.members || []).filter(id => id !== c.lastBy && byId[id]));
    t = "New message"; b = (byId[c.lastBy]?.name || "Someone") + " sent you a message";
  }
  if (to.size) msgs.push({ key: e.key, to, data: { title: short(t, 80), body: b, url: APP, tag: e.key } });
}
const uids = [...new Set(msgs.flatMap(m => [...m.to]))], tokOf = {}, owner = {};
for (let i = 0; i < uids.length; i += 300) {
  const refs = uids.slice(i, i + 300).map(u => db.doc("tokens/" + u));
  for (const d of await db.getAll(...refs)) if (d.exists) { tokOf[d.id] = d.data().tokens || []; for (const t of tokOf[d.id]) owner[t] = d.id; }
}
let sent = 0; const bad = [];
for (const m of msgs) {
  const tokens = [...new Set([...m.to].flatMap(u => tokOf[u] || []))];
  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    const res = await fcm.sendEachForMulticast({ tokens: chunk, data: m.data, webpush: { headers: { Urgency: "high", TTL: "43200" } } });
    res.responses.forEach((r, k) => { if (r.success) sent++; else if (/registration-token-not-registered|invalid-registration-token|invalid-argument/.test(r.error?.code || "")) bad.push(chunk[k]); });
  }
}
for (const t of bad) if (owner[t]) await db.doc("tokens/" + owner[t]).update({ tokens: admin.firestore.FieldValue.arrayRemove(t) }).catch(() => {});
await metaRef.set({ t: now, done: [...done, ...fresh.map(e => e.key)].slice(-500) });
console.log(`Events: ${fresh.length}, notifications sent: ${sent}, removed dead tokens: ${bad.length}`);
