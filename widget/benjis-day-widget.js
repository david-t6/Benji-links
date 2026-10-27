// Benji's Day for Scriptable.
// Paste this into a Scriptable script named "Benji's Day".
// The passcode is saved in the iOS Keychain. It is never written in this file.
// Decryption runs in a hidden WebView so it can use the same WebCrypto as the app.

const DATA_URL = "https://david-t6.github.io/Benji-links/app/data.enc.json";
const APP_URL = "https://david-t6.github.io/Benji-links/app/";
const KEYCHAIN_KEY = "benjis-day-passcode";
const CACHE_NAME = "benjis-day-cache.json";

const PAPER = new Color("#F6F1E6");
const SUN = new Color("#E6A817");
const INK = new Color("#2C261C");
const SUB = new Color("#7A705F");
const TRACK = new Color("#E4DCCB");

const DECRYPT_JS = `
async function benjiDecrypt(passcode, env) {
  if (!env || env.v !== 1 || !env.salt || !env.iv || !env.ct) throw new Error("bad envelope");
  function b64(s) {
    var bin = atob(String(s));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  var salt = b64(env.salt);
  var iv = b64(env.iv);
  var ct = b64(env.ct);
  if (salt.length !== 16 || iv.length !== 12 || ct.length < 17) throw new Error("bad envelope");
  var base = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(passcode)), "PBKDF2", false, ["deriveKey"]);
  var key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt, iterations: 210000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  var buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(buf));
}
`.trim();

function cachePath() {
  const fm = FileManager.local();
  return fm.joinPath(fm.documentsDirectory(), CACHE_NAME);
}

function readCache() {
  try {
    const fm = FileManager.local();
    const path = cachePath();
    if (!fm.fileExists(path)) return null;
    const data = JSON.parse(fm.readString(path));
    if (!data || data.v !== 1) return null;
    return data;
  } catch (err) {
    return null;
  }
}

function writeCache(data) {
  const fm = FileManager.local();
  fm.writeString(cachePath(), JSON.stringify(data));
}

async function askPasscode() {
  const alert = new Alert();
  alert.title = "Benji's Day";
  alert.message = "Enter your passcode. It is saved in the iPhone Keychain.";
  alert.addSecureTextField("Passcode", "");
  alert.addAction("Save");
  alert.addCancelAction("Cancel");
  const choice = await alert.present();
  if (choice === -1) return "";
  return alert.textFieldValue(0) || "";
}

async function passcode() {
  if (Keychain.contains(KEYCHAIN_KEY)) {
    const saved = Keychain.get(KEYCHAIN_KEY);
    if (saved) return saved;
  }
  if (config.runsInWidget) return "";
  const value = await askPasscode();
  if (!value) return "";
  Keychain.set(KEYCHAIN_KEY, value);
  return value;
}

async function decryptEnvelope(passcodeValue, env) {
  const view = new WebView();
  await view.loadURL(APP_URL);
  const expr = "(async () => { " + DECRYPT_JS + "; return JSON.stringify(await benjiDecrypt(" + JSON.stringify(passcodeValue) + ", " + JSON.stringify(env) + ")); })()";
  const raw = await view.evaluateJavaScript(expr);
  if (typeof raw !== "string" || !raw) throw new Error("decrypt");
  const data = JSON.parse(raw);
  if (!data || data.v !== 1) throw new Error("decrypt");
  return data;
}

async function loadDay(pass) {
  const cached = readCache();
  let env = null;
  try {
    const req = new Request(DATA_URL);
    req.timeoutInterval = 20;
    env = await req.loadJSON();
  } catch (err) {
    return cached;
  }
  try {
    const fresh = await decryptEnvelope(pass, env);
    writeCache(fresh);
    return fresh;
  } catch (err) {
    if (!config.runsInWidget) {
      try { Keychain.remove(KEYCHAIN_KEY); } catch (ignore) {}
      const alert = new Alert();
      alert.title = "Benji's Day";
      alert.message = "That passcode didn't open the day. Run the script again to try another.";
      alert.addAction("OK");
      await alert.present();
    }
    return cached;
  }
}

function taskCounts(data) {
  const open = [];
  let done = 0;
  (data.groups || []).forEach(function (group) {
    (group.waiting || []).forEach(function (item) {
      if (item && item.text) open.push(String(item.text));
    });
    (group.todo || []).forEach(function (item) {
      if (!item || !item.text) return;
      if (item.done) done += 1;
      else open.push(String(item.text));
    });
  });
  return { open: open, done: done };
}

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}

function fmtHour(value) {
  const hour = Math.floor(value);
  const min = Math.round((value - hour) * 60);
  const ap = hour >= 12 ? "PM" : "AM";
  let h12 = hour % 12;
  if (h12 === 0) h12 = 12;
  return h12 + ":" + pad(min) + " " + ap;
}

function nextEvent(data) {
  const schedule = data.schedule || [];
  if (!schedule.length) return null;
  const now = new Date();
  const iso = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
  const today = String(data.DAY_ISO || "") === iso;
  if (!today) {
    return { title: String(schedule[0].title || "Next event"), when: fmtHour(schedule[0].start), quiet: false };
  }
  const hour = now.getHours() + now.getMinutes() / 60;
  let hit = null;
  for (let i = 0; i < schedule.length; i++) {
    if (schedule[i].end > hour) { hit = schedule[i]; break; }
  }
  if (!hit) return { title: "Nothing else today", when: "", quiet: true };
  const live = hour >= hit.start;
  return { title: String(hit.title || "Next event"), when: live ? "Now" : fmtHour(hit.start), quiet: false };
}

function baseWidget() {
  const widget = new ListWidget();
  widget.backgroundColor = PAPER;
  widget.url = APP_URL;
  widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  widget.setPadding(14, 14, 14, 14);
  return widget;
}

function addRule(widget) {
  const rule = widget.addStack();
  rule.backgroundColor = SUN;
  rule.cornerRadius = 2;
  rule.size = new Size(28, 4);
  widget.addSpacer(8);
}

function addBar(widget, pct) {
  const family = config.widgetFamily || "medium";
  const width = family === "small" ? 126 : family === "large" ? 300 : 118;
  const clamped = Math.max(0, Math.min(1, pct));
  const fillW = Math.max(clamped > 0 ? 6 : 0, Math.round(width * clamped));
  const bar = widget.addStack();
  bar.layoutHorizontally();
  bar.cornerRadius = 3;
  if (fillW > 0) {
    const fill = bar.addStack();
    fill.backgroundColor = SUN;
    fill.cornerRadius = 3;
    fill.size = new Size(fillW, 6);
  }
  const restW = Math.max(0, width - fillW);
  if (restW > 0) {
    const rest = bar.addStack();
    rest.backgroundColor = TRACK;
    rest.cornerRadius = 3;
    rest.size = new Size(restW, 6);
  }
}

function addCount(widget, open, done, big) {
  const num = widget.addText(String(open));
  num.font = Font.boldSystemFont(big ? 44 : 36);
  num.textColor = INK;
  num.minimumScaleFactor = 0.7;
  const label = widget.addText("open");
  label.font = Font.mediumSystemFont(13);
  label.textColor = SUB;
  const meta = widget.addText(done + " done");
  meta.font = Font.mediumSystemFont(13);
  meta.textColor = SUN;
  widget.addSpacer(6);
  const total = open + done;
  addBar(widget, total ? done / total : 0);
}

function paintLocked() {
  const widget = baseWidget();
  addRule(widget);
  const title = widget.addText("Benji's Day");
  title.font = Font.boldSystemFont(16);
  title.textColor = INK;
  widget.addSpacer(6);
  const body = widget.addText("Open this script in Scriptable once and save your passcode.");
  body.font = Font.regularSystemFont(13);
  body.textColor = SUB;
  return widget;
}

function paint(data) {
  const family = config.widgetFamily || "medium";
  const counts = taskCounts(data);
  const event = nextEvent(data);
  const widget = baseWidget();
  addRule(widget);

  if (family === "small") {
    addCount(widget, counts.open.length, counts.done, false);
    widget.addSpacer();
    const updated = widget.addText(data.UPDATED ? String(data.UPDATED) : "");
    updated.font = Font.regularSystemFont(11);
    updated.textColor = SUB;
    updated.lineLimit = 1;
    return widget;
  }

  if (family === "medium") {
    const row = widget.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    const left = row.addStack();
    left.layoutVertically();
    addCount(left, counts.open.length, counts.done, false);
    row.addSpacer(12);
    const right = row.addStack();
    right.layoutVertically();
    if (event) {
      const when = right.addText(event.when || "Next");
      when.font = Font.mediumSystemFont(12);
      when.textColor = SUN;
      const title = right.addText(event.title);
      title.font = Font.boldSystemFont(15);
      title.textColor = INK;
      title.lineLimit = 2;
      right.addSpacer(6);
    }
    const lines = counts.open.slice(0, 3);
    lines.forEach(function (text) {
      const line = right.addText(text);
      line.font = Font.regularSystemFont(12);
      line.textColor = SUB;
      line.lineLimit = 1;
    });
    right.addSpacer(4);
    const updated = right.addText(data.UPDATED ? String(data.UPDATED) : "");
    updated.font = Font.regularSystemFont(11);
    updated.textColor = SUB;
    updated.lineLimit = 1;
    return widget;
  }

  const head = widget.addStack();
  head.layoutHorizontally();
  head.bottomAlignContent();
  const num = head.addText(String(counts.open.length));
  num.font = Font.boldSystemFont(42);
  num.textColor = INK;
  head.addSpacer(8);
  const words = head.addText("open · " + counts.done + " done");
  words.font = Font.mediumSystemFont(15);
  words.textColor = SUB;
  widget.addSpacer(6);
  const total = counts.open.length + counts.done;
  addBar(widget, total ? counts.done / total : 0);
  widget.addSpacer(10);
  if (event) {
    const when = widget.addText(event.when || "Next");
    when.font = Font.mediumSystemFont(12);
    when.textColor = SUN;
    const title = widget.addText(event.title);
    title.font = Font.boldSystemFont(16);
    title.textColor = INK;
    title.lineLimit = 1;
    widget.addSpacer(8);
  }
  counts.open.slice(0, 5).forEach(function (text) {
    const line = widget.addText(text);
    line.font = Font.regularSystemFont(14);
    line.textColor = INK;
    line.lineLimit = 1;
    widget.addSpacer(3);
  });
  widget.addSpacer();
  const updated = widget.addText(data.UPDATED ? "Updated " + data.UPDATED : "");
  updated.font = Font.regularSystemFont(11);
  updated.textColor = SUB;
  updated.lineLimit = 1;
  return widget;
}

async function run() {
  const pass = await passcode();
  if (!pass) {
    const cached = readCache();
    return cached ? paint(cached) : paintLocked();
  }
  const data = await loadDay(pass);
  if (!data) return paintLocked();
  return paint(data);
}

const widget = await run();
Script.setWidget(widget);
if (!config.runsInWidget) {
  const family = config.widgetFamily;
  if (family === "small") await widget.presentSmall();
  else if (family === "large") await widget.presentLarge();
  else await widget.presentMedium();
}
Script.complete();
