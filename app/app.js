/* Benji's Day. Plain DOM, no framework. crypto.js provides BenjiCrypto. */
(function () {
  "use strict";

  var PASS_KEY = "benjis-day:passcode";
  var REFRESH_KEY = "benjis-day:refresh-at";
  var STATE_KEY = "benjis-day:v2";
  var FACE_KEY = "benjis-day:face";
  var OFFER_KEY = "benjis-day:face-offer";
  var K = { green: "#00C805", ink: "#111214", bg: "#FFFFFF", soft: "#7BE07F" };

  var S = {
    demo: false,
    screen: "opening",
    data: null,
    passcode: null,
    overrides: {},
    queue: [],
    added: [],
    removed: {},
    snapshotAt: "",
    addOpen: false,
    addDraft: "",
    addSection: "",
    addFocus: false,
    freshId: null,
    tab: "todo",
    groupOpen: {},
    showDone: {},
    expandTodo: {},
    leaving: {},
    popId: null,
    burstId: null,
    inboxLeaving: null,
    openInbox: null,
    showSkipped: false,
    showBal: false,
    openTx: null,
    settings: false,
    settingsError: "",
    cheer: null,
    cheerTimer: 0,
    syncing: false,
    syncNote: "",
    syncOk: false,
    syncTimer: 0,
    ptr: 0,
    painted: false,
    enterTab: "",
    passError: "",
    canFace: false,
    busy: false,
    faceError: "",
    faceBusy: false,
    faceGesture: false,
    offerOn: true,
    offerBusy: false,
    offerError: "",
    lastPct: {},
  };

  var faceOk = false;
  var faceAbort = null;
  var faceGen = 0;
  var prevPct = null;
  var prevReplies = null;
  var tweens = {};
  var tweenToken = 0;
  var flushChain = Promise.resolve();
  var clockSig = "";
  var refreshTimer = 0;
  var refreshUntil = 0;
  var refreshBaseline = "";
  var refreshBusy = false;

  function reducedMotion() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch (e) { return false; }
  }

  function el(tag, attrs, kids) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.indexOf("on") === 0 && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, String(v));
    });
    (kids || []).forEach(function (kid) {
      if (kid == null || kid === false) return;
      node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    });
    return node;
  }

  function svgEl(size, paths, className) {
    var ns = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 " + size + " " + size);
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("fill", "none");
    if (className) s.setAttribute("class", className);
    paths.forEach(function (p) {
      var path = document.createElementNS(ns, "path");
      Object.keys(p).forEach(function (k) { path.setAttribute(k, p[k]); });
      s.append(path);
    });
    return s;
  }

  function chevron(open) {
    return svgEl(14, [{
      d: "M5 2.5 L9.5 7 L5 11.5",
      stroke: "#A2A7AD",
      "stroke-width": "1.8",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }], "chev" + (open ? " open" : ""));
  }

  function syncIcon(spinning, ok) {
    if (ok) {
      return svgEl(24, [{
        d: "M5 12.5 L9.2 17 L19 7",
        stroke: "currentColor",
        "stroke-width": "2.2",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }], "sync-pop");
    }
    var cls = spinning && !reducedMotion() ? "spin" : "";
    return svgEl(24, [
      { d: "M21 12a9 9 0 0 0-9-9 9.7 9.7 0 0 0-6.7 2.7L3 8", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" },
      { d: "M3 3v5h5", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" },
      { d: "M3 12a9 9 0 0 0 9 9 9.7 9.7 0 0 0 6.7-2.7L21 16", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" },
      { d: "M16 16h5v5", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" },
    ], cls);
  }

  function gearIcon() {
    return svgEl(24, [
      { d: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z", stroke: "currentColor", "stroke-width": "1.8" },
      { d: "M12 3.5v2.2M12 18.3V20.5M3.5 12h2.2M18.3 12H20.5M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round" },
    ]);
  }

  function checkPath(stroke) {
    return svgEl(14, [{
      d: "M3 7.4 L5.8 10 L11 4.2",
      stroke: stroke,
      "stroke-width": "2.2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }]);
  }

  function burst() {
    var wrap = el("span", { class: "burst", "aria-hidden": "true" });
    wrap.append(el("span", { class: "ring" }));
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2;
      var dot = el("span", { class: "bdot" });
      dot.style.background = i % 2 ? K.green : K.soft;
      dot.style.setProperty("--dx", Math.cos(a) * 24 + "px");
      dot.style.setProperty("--dy", Math.sin(a) * 24 + "px");
      wrap.append(dot);
    }
    return wrap;
  }

  function bar(pct, height, key, color, delay) {
    var track = el("div", { class: "bar", style: "height:" + height + "px" });
    var fill = el("div", { class: "bar-fill" });
    fill.style.background = color || K.green;
    fill.style.height = height + "px";
    var target = Math.max(0, Math.min(1, pct)) * 100;
    var from = S.lastPct[key];
    if (from == null) from = 0;
    fill.style.width = from + "%";
    S.lastPct[key] = target;
    var wait = S.painted ? 0 : (delay || 40);
    setTimeout(function () {
      requestAnimationFrame(function () {
        fill.classList.add("go");
        if (delay && !S.painted) fill.style.transitionDelay = delay + "ms";
        fill.style.width = target + "%";
      });
    }, wait);
    track.append(fill);
    return track;
  }

  function mountTween(node, key, value) {
    if (tweens[key] == null || reducedMotion()) {
      tweens[key] = value;
      node.textContent = String(value);
      return;
    }
    var from = tweens[key];
    var token = ++tweenToken + ":" + key;
    node.dataset.tween = token;
    var start = performance.now();
    function step(now) {
      if (node.dataset.tween !== token) return;
      var p = Math.min(1, (now - start) / 550);
      var e = 1 - Math.pow(1 - p, 3);
      tweens[key] = from + (value - from) * e;
      node.textContent = String(Math.round(tweens[key]));
      if (p < 1) requestAnimationFrame(step);
      else tweens[key] = value;
    }
    requestAnimationFrame(step);
  }

  /* ---------- time and labels ---------- */

  function fmtHour(h) {
    var hh = Math.floor(h);
    var mm = Math.round((h - hh) * 60);
    var ap = hh >= 12 ? "PM" : "AM";
    var h12 = hh % 12 === 0 ? 12 : hh % 12;
    return { t: h12 + ":" + (mm < 10 ? "0" : "") + mm, ap: ap };
  }
  function fmtRange(s, e) {
    var a = fmtHour(s);
    var b = fmtHour(e);
    return a.t + (a.ap === b.ap ? "" : " " + a.ap) + "-" + b.t + " " + b.ap;
  }
  function displayName(t) {
    return String(t || "").replace(/^\(\d{3}\) \d{3}-\d{4} \((.+)\)$/, "$1");
  }
  function splitNext(d) {
    var s = String(d || "");
    var i = s.indexOf("Next:");
    return i < 0 ? { what: s, next: "" } : { what: s.slice(0, i).trim(), next: s.slice(i + 5).trim() };
  }
  function localIso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function initialOf(s) {
    return (String(s).replace(/[^A-Za-z0-9]/g, "").charAt(0) || "?").toUpperCase();
  }
  function greeting(d) {
    var h = d.getHours();
    if (h >= 5 && h < 12) return "Good morning";
    if (h >= 12 && h < 17) return "Good afternoon";
    return "Good evening";
  }
  function dayLabel(mmdd) {
    var parts = String(mmdd).split("/").map(Number);
    var m = parts[0];
    var d = parts[1];
    var y = Number(String(S.data.DAY_ISO || "").slice(0, 4));
    var dt = new Date(y, m - 1, d);
    var wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getDay()];
    var mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
    var todayKey = String(S.data.DAY_ISO || "").slice(5).replace("-", "/").replace(/^0/, "");
    return mmdd === todayKey ? "Today, " + mo + " " + d : wd + ", " + mo + " " + d;
  }
  function nowIso() { return new Date().toISOString(); }

  /* ---------- model ---------- */

  function inboxId(item) {
    return item.title + "|" + item.meta + "|" + splitNext(item.detail).what;
  }
  var SECTIONS = ["Church", "Weekday Coffee", "Grace & Growth", "Personal"];
  function stableTodoId(task, groupName, kind) {
    var own = task && typeof task.id === "string" ? task.id : "";
    // Mine items carry their u- id. Everything else keeps group|kind|text.
    if (kind === "t" && own && (task.mine === true || own.indexOf("u-") === 0)) return own;
    return groupName + "|" + kind + "|" + (task && task.text ? task.text : "");
  }
  function sectionNames() {
    return SECTIONS.slice();
  }
  function normalizeSection(name) {
    return SECTIONS.indexOf(name) >= 0 ? name : "Personal";
  }
  function userEventOk(ev) {
    if (!ev || typeof ev.id !== "string" || ev.id.indexOf("u-") !== 0) return false;
    if (typeof ev.at !== "string" || !ev.at) return false;
    if (ev.type === "remove") return true;
    if (ev.type !== "add") return false;
    return typeof ev.text === "string" && ev.text.trim().length > 0;
  }
  function dataTodoIds() {
    var ids = {};
    (S.data && S.data.groups || []).forEach(function (g) {
      (g.todo || []).forEach(function (t) {
        if (t && typeof t.id === "string" && t.id) ids[t.id] = true;
      });
    });
    return ids;
  }
  function allTodos() {
    var out = [];
    var seen = {};
    (S.data.groups || []).forEach(function (g) {
      (g.waiting || []).forEach(function (w) {
        var id = stableTodoId(w, g.name, "w");
        if (S.removed[id]) return;
        seen[id] = true;
        out.push({ text: w.text, meta: w.meta, src: w.src, done: false, id: id, waiting: true, group: g.name, mine: false });
      });
      (g.todo || []).forEach(function (t) {
        var id = stableTodoId(t, g.name, "t");
        if (S.removed[id]) return;
        if (seen[id]) return;
        seen[id] = true;
        var mine = t.mine === true || (typeof t.id === "string" && t.id.indexOf("u-") === 0);
        var section = mine ? normalizeSection(t.section) : g.name;
        out.push({
          text: t.text,
          meta: t.meta,
          src: t.src,
          done: !!t.done,
          id: id,
          waiting: false,
          group: section,
          mine: mine,
        });
      });
    });
    (S.added || []).forEach(function (a) {
      if (!a || seen[a.id] || S.removed[a.id]) return;
      seen[a.id] = true;
      out.push({
        text: a.text,
        meta: "",
        done: false,
        id: a.id,
        waiting: false,
        group: normalizeSection(a.section),
        mine: true,
      });
    });
    return out;
  }
  function allInbox() {
    var out = [];
    (S.data.needsReply || []).forEach(function (item) {
      out.push(Object.assign({}, item, { needs: true, id: inboxId(item) }));
    });
    (S.data.fyi || []).forEach(function (item) {
      out.push(Object.assign({}, item, { needs: false, id: inboxId(item) }));
    });
    return out;
  }
  function isDone(item) {
    var ov = S.overrides[item.id];
    if (ov && ov.type === "todo") return !!ov.done;
    return !!item.done;
  }
  function inboxHidden(item) {
    var ov = S.overrides[item.id];
    return !!(ov && ov.type === "inbox" && ov.done);
  }
  function counts() {
    var todos = allTodos();
    var done = todos.filter(isDone).length;
    var replies = allInbox().filter(function (i) { return i.needs && !inboxHidden(i); }).length;
    return { total: todos.length, done: done, left: todos.length - done, replies: replies };
  }
  function reseedMilestones() {
    var c = counts();
    prevPct = c.total ? c.done / c.total : 0;
    prevReplies = c.replies;
  }
  function noteTapMilestones() {
    var c = counts();
    var p = c.total ? c.done / c.total : 0;
    var title = "";
    var sub = "";
    if (prevPct !== null) {
      if (p >= 1 && prevPct < 1) { title = "All done"; sub = "Every to-do checked off."; }
      else if (p >= 0.5 && prevPct < 0.5) { title = "Halfway there"; sub = c.done + " of " + c.total + " done"; }
    }
    if (!title && prevReplies !== null && prevReplies > 0 && c.replies === 0) {
      title = "Inbox zero";
      sub = "Nothing waiting on a reply.";
    }
    prevPct = p;
    prevReplies = c.replies;
    if (title) cheer(title, sub);
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STATE_KEY);
      if (!raw) return;
      var p = JSON.parse(raw);
      S.overrides = p.overrides && typeof p.overrides === "object" ? p.overrides : {};
      S.queue = Array.isArray(p.queue) ? p.queue : [];
      S.added = Array.isArray(p.added) ? p.added.filter(function (a) {
        return a && typeof a.id === "string" && a.id.indexOf("u-") === 0 && typeof a.text === "string" && a.text;
      }) : [];
      S.removed = p.removed && typeof p.removed === "object" ? p.removed : {};
      S.snapshotAt = typeof p.snapshotAt === "string" ? p.snapshotAt : "";
    } catch (e) {
      S.overrides = {};
      S.queue = [];
      S.added = [];
      S.removed = {};
    }
  }
  function saveState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        overrides: S.overrides,
        queue: S.queue,
        added: S.added,
        removed: S.removed,
        snapshotAt: S.snapshotAt,
      }));
    } catch (e) { /* storage full or blocked */ }
  }
  function adoptData(data) {
    S.data = data;
    S.snapshotAt = nowIso();
  }
  function reconcileMine() {
    var published = dataTodoIds();
    S.added = (S.added || []).filter(function (item) { return item && !published[item.id]; });
    Object.keys(S.removed || {}).forEach(function (id) {
      if (published[id]) return;
      if (S.snapshotAt && String(S.removed[id] || "") < S.snapshotAt) delete S.removed[id];
    });
  }
  function upsertAdded(ev) {
    var text = String(ev.text || "").trim();
    if (!text) return;
    var section = normalizeSection(ev.section);
    var cur = null;
    (S.added || []).forEach(function (a) { if (a.id === ev.id) cur = a; });
    if (cur) {
      if (String(cur.at || "") >= ev.at) return;
      cur.text = text;
      cur.section = section;
      cur.at = ev.at;
      if (!S.removed[ev.id] || String(S.removed[ev.id]) < ev.at) delete S.removed[ev.id];
      return;
    }
    if (S.removed[ev.id] && String(S.removed[ev.id]) >= ev.at) return;
    delete S.removed[ev.id];
    S.added.push({ id: ev.id, text: text, section: section, at: ev.at });
  }
  function applyEvent(ev) {
    // Refresh is not a check-off. Add and remove update David's own list, not done-state.
    if (!ev || ev.type === "refresh") return;
    if (ev.type === "add" || ev.type === "remove") {
      if (!userEventOk(ev)) return;
      if (ev.type === "add") upsertAdded(ev);
      else if (!S.added.some(function (a) { return a.id === ev.id && String(a.at) > ev.at; })) {
        S.added = S.added.filter(function (a) { return a.id !== ev.id; });
        if (!S.removed[ev.id] || String(S.removed[ev.id]) < ev.at) S.removed[ev.id] = ev.at;
      }
      return;
    }
    if (ev.type !== "todo" && ev.type !== "inbox") return;
    if (typeof ev.id !== "string" || !ev.id) return;
    if (typeof ev.done !== "boolean") return;
    if (typeof ev.at !== "string" || !ev.at) return;
    var cur = S.overrides[ev.id];
    if (cur && cur.at >= ev.at) return;
    S.overrides[ev.id] = {
      type: ev.type,
      id: ev.id,
      text: typeof ev.text === "string" ? ev.text : "",
      done: ev.done,
      at: ev.at,
    };
  }
  function prune() {
    if (!S.data) return;
    reconcileMine();
    var todos = {};
    allTodos().forEach(function (t) { todos[t.id] = t; });
    var inbox = {};
    allInbox().forEach(function (i) { inbox[i.id] = i; });
    Object.keys(S.overrides).forEach(function (id) {
      var ov = S.overrides[id];
      if (ov.type === "todo") {
        var item = todos[id];
        if (!item || !!item.done === !!ov.done) delete S.overrides[id];
      } else if (ov.type === "inbox") {
        var row = inbox[id];
        if (!row || ov.done === false) delete S.overrides[id];
      }
    });
  }
  function enqueue(ev) {
    if ((ev.type === "add" || ev.type === "remove") && !userEventOk(ev)) return;
    if (ev.type === "todo" || ev.type === "inbox") {
      S.overrides[ev.id] = { type: ev.type, id: ev.id, text: ev.text, done: ev.done, at: ev.at };
    }
    var prev = null;
    S.queue.forEach(function (q) { if (q.id === ev.id && q.type === ev.type) prev = q; });
    if (prev && (ev.type === "add" || ev.type === "remove") && String(prev.at || "") >= String(ev.at || "")) return;
    S.queue = S.queue.filter(function (q) { return !(q.id === ev.id && q.type === ev.type); });
    S.queue.push(ev);
    saveState();
    flushQueue();
  }
  function ntfyBody(ev) {
    if (ev.type === "add") {
      return { type: "add", id: ev.id, text: String(ev.text || "").trim(), section: normalizeSection(ev.section), at: ev.at };
    }
    if (ev.type === "remove") return { type: "remove", id: ev.id, at: ev.at };
    return { type: ev.type, id: ev.id, text: ev.text || "", done: !!ev.done, at: ev.at };
  }

  /* ---------- links ---------- */

  function smsHref(raw) {
    var m = /^sms:(.*)$/i.exec(String(raw || "").trim());
    if (!m) return "";
    var num = m[1].split(/[?&;]/)[0].replace(/[^0-9+]/g, "");
    if (num && !/^\+?[0-9]+$/.test(num)) return "";
    return "sms:" + num;
  }
  function gmailParts(raw) {
    var s = String(raw || "").trim();
    var gm = /^https:\/\/mail\.google\.com\/mail\/u\/[^?#]*\?authuser=([^&#]+)[^#]*#(.*)$/i.exec(s);
    if (!gm) return null;
    var email = gm[1];
    try { email = decodeURIComponent(email); } catch (e) { /* keep */ }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    var th = /^(?:all|inbox)\/([A-Za-z0-9]+)$/.exec(gm[2]);
    if (th) return { email: email, thread: th[1], fallback: s };
    if (gm[2] === "inbox") return { email: email, thread: "", fallback: s };
    return null;
  }
  function safeHttp(raw) {
    try {
      var u = new URL(raw, location.href);
      if (u.protocol === "https:" || u.protocol === "http:") return u.href;
    } catch (e) { /* ignore */ }
    return "";
  }
  var GMAIL_APP = "googlegmail://";
  function openNative(url) {
    window.location.href = url;
  }
  function showBrowserOffer(anchor, href) {
    if (!anchor || !href) return;
    window.setTimeout(function () {
      if (!anchor.isConnected || document.hidden) return;
      var row = anchor.parentNode;
      if (!row || row.querySelector(".browser-offer")) return;
      var offer = el("a", {
        class: "browser-offer",
        href: href,
        target: "_blank",
        rel: "noopener",
        text: "Open in browser instead",
      });
      anchor.insertAdjacentElement("afterend", offer);
    }, 3000);
  }
  function openSmart(raw, ev) {
    if (ev) ev.preventDefault();
    var href = String(raw || "").trim();
    var sms = smsHref(href);
    if (sms) { openNative(sms); return; }
    var g = gmailParts(href);
    if (g) { openNative(GMAIL_APP); return; }
    var http = safeHttp(href);
    if (http) window.open(http, "_blank", "noopener");
  }
  function linkEl(raw, label, className) {
    var sms = smsHref(raw);
    var g = gmailParts(raw);
    var http = safeHttp(raw);
    var a = el("a", { class: className || "pill press", text: label });
    a.append(document.createTextNode(" "));
    a.append(el("span", { "aria-hidden": "true", text: "›" }));
    if (sms) {
      a.setAttribute("href", sms);
      a.addEventListener("click", function (e) {
        e.preventDefault();
        openNative(sms);
      });
      return a;
    }
    if (g) {
      a.setAttribute("href", GMAIL_APP);
      a.addEventListener("click", function (e) {
        e.preventDefault();
        openNative(GMAIL_APP);
        showBrowserOffer(a, g.fallback);
      });
      return a;
    }
    if (http) {
      a.setAttribute("href", http);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
      return a;
    }
    return null;
  }

  /* ---------- sync ---------- */

  function fetchTimeout(url, options, ms) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, ms);
    var opts = Object.assign({}, options || {}, { signal: ctrl.signal });
    return fetch(url, opts).then(function (res) {
      clearTimeout(timer);
      return res;
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }
  function fetchNamed(name) {
    var url = new URL(name, document.baseURI);
    url.searchParams.set("t", String(Date.now()));
    return fetchTimeout(url.href, { cache: "no-store" }, 20000).then(function (res) {
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    });
  }
  function flushQueue() {
    var run = flushChain.then(flushOnce, flushOnce);
    flushChain = run.then(function () {}, function () {});
    return run;
  }
  function flushOnce() {
    if (!S.passcode || !S.queue.length) return Promise.resolve();
    return BenjiCrypto.topicForPasscode(S.passcode).then(function (topic) {
      var batch = S.queue.slice();
      var failed = {};
      var chain = Promise.resolve();
      batch.forEach(function (ev) {
        chain = chain.then(function () {
          if ((ev.type === "add" || ev.type === "remove") && !userEventOk(ev)) return null;
          return BenjiCrypto.encryptJson(S.passcode, ntfyBody(ev)).then(function (env) {
            return fetchTimeout("https://ntfy.sh/" + topic, {
              method: "POST",
              cache: "no-store",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify(env),
            }, 12000);
          }).then(function (res) {
            if (!res.ok) failed[ev.id + "\n" + ev.at] = true;
          }).catch(function () {
            failed[ev.id + "\n" + ev.at] = true;
          });
        });
      });
      return chain.then(function () {
        S.queue = S.queue.filter(function (ev) {
          var inBatch = batch.some(function (b) { return b.id === ev.id && b.at === ev.at; });
          if (!inBatch) return true;
          return !!failed[ev.id + "\n" + ev.at];
        });
        saveState();
      });
    });
  }
  function pollNtfy() {
    return BenjiCrypto.topicForPasscode(S.passcode).then(function (topic) {
      return fetchTimeout("https://ntfy.sh/" + topic + "/json?poll=1&since=12h", { cache: "no-store" }, 12000);
    }).then(function (res) {
      if (!res.ok) throw new Error("ntfy");
      return res.text();
    }).then(function (text) {
      var jobs = [];
      text.split("\n").forEach(function (line) {
        var trimmed = line.trim();
        if (!trimmed) return;
        var msg;
        try { msg = JSON.parse(trimmed); } catch (e) { return; }
        if (msg.event && msg.event !== "message") return;
        if (typeof msg.message !== "string" || !msg.message) return;
        var env;
        try { env = JSON.parse(msg.message); } catch (e) { return; }
        jobs.push(BenjiCrypto.decryptJson(S.passcode, env));
      });
      return Promise.all(jobs);
    }).then(function (list) {
      return list.filter(Boolean).sort(function (a, b) {
        if (a.at < b.at) return -1;
        if (a.at > b.at) return 1;
        return 0;
      });
    });
  }
  function paintSync() {
    var btn = document.getElementById("sync");
    var label = document.getElementById("sync-label");
    if (!btn || !label) return;
    label.textContent = syncLabel();
    btn.setAttribute("aria-label", "Sync, " + syncLabel());
    btn.classList.toggle("ok", !!S.syncOk);
    var icon = syncIcon(S.syncing, S.syncOk);
    var old = btn.querySelector("svg");
    if (old) old.replaceWith(icon);
    else btn.insertBefore(icon, label);
  }
  function syncLabel() {
    if (S.syncing) return "Syncing…";
    if (S.syncNote) return S.syncNote;
    if (S.data && S.data.UPDATED) return "Updated " + S.data.UPDATED;
    return "Sync";
  }
  function markSynced(note, ok) {
    S.syncNote = note;
    S.syncOk = !!ok;
    clearTimeout(S.syncTimer);
    if (note === "Synced just now") {
      S.syncTimer = setTimeout(function () {
        if (S.syncNote === "Synced just now") {
          S.syncNote = "";
          S.syncOk = false;
          if (S.screen === "app") render();
        }
      }, 60000);
    }
  }
  function noteUpdated(time) {
    stopRefreshWatch();
    S.syncNote = "Updated " + time;
    S.syncOk = true;
    clearTimeout(S.syncTimer);
    S.syncTimer = setTimeout(function () {
      if (S.syncOk && S.syncNote && S.syncNote.indexOf("Updated ") === 0) {
        S.syncOk = false;
        S.syncNote = "";
        if (S.screen === "app") render();
      }
    }, 4000);
  }
  function lastRefreshAt() {
    try {
      var n = Number(localStorage.getItem(REFRESH_KEY) || 0);
      return isFinite(n) ? n : 0;
    } catch (e) { return 0; }
  }
  function stopRefreshWatch() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = 0;
    refreshUntil = 0;
    refreshBusy = false;
  }
  function expireRefresh() {
    var showing = S.syncNote && S.syncNote.indexOf("Refreshing") === 0;
    stopRefreshWatch();
    if (showing) {
      S.syncNote = "";
      S.syncOk = false;
      if (S.screen === "app") render();
    }
  }
  function startRefreshWatch(baseline) {
    refreshBaseline = baseline == null ? "" : String(baseline);
    refreshUntil = Date.now() + 10 * 60 * 1000;
    S.syncNote = "Refreshing… new data in a few minutes";
    S.syncOk = false;
    clearTimeout(S.syncTimer);
    if (!refreshTimer) refreshTimer = setInterval(pollRefresh, 30000);
  }
  function pollRefresh() {
    if (!refreshTimer) return;
    if (Date.now() > refreshUntil || S.screen !== "app" || (!S.passcode && !S.demo)) {
      expireRefresh();
      return;
    }
    if (refreshBusy) return;
    refreshBusy = true;
    var name = S.demo ? "data.sample.json" : "data.enc.json";
    fetchNamed(name).then(function (payload) {
      if (S.demo) return payload;
      if (!S.passcode) return null;
      return BenjiCrypto.decryptJson(S.passcode, payload);
    }).then(function (plain) {
      if (!plain || !refreshTimer) return;
      var next = plain.UPDATED ? String(plain.UPDATED) : "";
      if (next && next !== refreshBaseline) {
        adoptData(plain);
        prune();
        saveState();
        reseedMilestones();
        noteUpdated(next);
      }
    }).catch(function () { /* keep waiting for the next poll */ }).then(function () {
      refreshBusy = false;
    });
  }
  function requestRefresh() {
    if (!S.passcode) return Promise.resolve("skipped");
    if (Date.now() - lastRefreshAt() < 120000) return Promise.resolve("debounced");
    var ev = { type: "refresh", id: "refresh", at: new Date().toISOString() };
    return BenjiCrypto.topicForPasscode(S.passcode).then(function (topic) {
      return BenjiCrypto.encryptJson(S.passcode, ev).then(function (env) {
        return fetchTimeout("https://ntfy.sh/" + topic, {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(env),
        }, 12000);
      });
    }).then(function (res) {
      if (!res.ok) return "failed";
      try { localStorage.setItem(REFRESH_KEY, String(Date.now())); } catch (e) { /* still sent */ }
      return "sent";
    }).catch(function () { return "failed"; });
  }
  function doSync(opts) {
    opts = opts || {};
    var wantRefresh = !!opts.refresh;
    if (S.syncing || S.screen !== "app" || !S.data) return Promise.resolve();
    S.syncing = true;
    S.syncOk = false;
    paintSync();
    var dataOk = false;
    var ntfyOk = true;
    var refreshResult = "skipped";
    var baseline = S.data && S.data.UPDATED ? String(S.data.UPDATED) : "";
    var work = S.passcode ? flushQueue() : Promise.resolve();
    work = work.then(function () {
      if (!wantRefresh) return "skipped";
      return requestRefresh();
    }).then(function (result) {
      refreshResult = result || "skipped";
      return S.demo ? fetchNamed("data.sample.json") : fetchNamed("data.enc.json");
    }).then(function (payload) {
      if (S.demo) {
        adoptData(payload);
        dataOk = true;
        return null;
      }
      return BenjiCrypto.decryptJson(S.passcode, payload).then(function (plain) {
        if (!plain) throw new Error("decrypt");
        adoptData(plain);
        dataOk = true;
      });
    }).then(function () {
      if (!S.passcode) return null;
      return pollNtfy().then(function (events) {
        events.forEach(applyEvent);
        S.queue.forEach(applyEvent);
      }).catch(function () { ntfyOk = false; });
    }).then(function () {
      prune();
      saveState();
      reseedMilestones();
    }).catch(function () { dataOk = false; });
    return work.then(function () {
      S.syncing = false;
      var updatedNow = S.data && S.data.UPDATED ? String(S.data.UPDATED) : "";
      if (refreshResult === "sent") {
        if (baseline && updatedNow && updatedNow !== baseline) noteUpdated(updatedNow);
        else startRefreshWatch(baseline || updatedNow);
      } else if (refreshTimer) {
        S.syncNote = "Refreshing… new data in a few minutes";
        S.syncOk = false;
      } else if (refreshResult === "failed") {
        markSynced("Couldn't sync", false);
      } else if (dataOk && ntfyOk && S.queue.length === 0) {
        markSynced("Synced just now", true);
      } else if (dataOk && S.queue.length) {
        markSynced("Saved on this phone", false);
      } else if (!dataOk) {
        markSynced("Couldn't refresh", false);
      } else {
        markSynced("Couldn't sync", false);
      }
      if (S.screen === "app") render();
    });
  }

  /* ---------- Face ID ---------- */

  function loadFace() {
    try {
      var raw = localStorage.getItem(FACE_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (!p || (p.mode !== "prf" && p.mode !== "uv") || typeof p.credentialId !== "string") return null;
      if (p.mode === "prf" && (!p.wrapped || p.wrapped.v !== 1)) return null;
      return p;
    } catch (e) { return null; }
  }
  function saveFace(rec) {
    localStorage.setItem(FACE_KEY, JSON.stringify(rec));
    if (rec.mode === "prf") localStorage.removeItem(PASS_KEY);
  }
  function faceAvailable() {
    if (!window.isSecureContext || !window.PublicKeyCredential) return Promise.resolve(false);
    if (!PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return Promise.resolve(false);
    return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(function () { return false; });
  }
  function prfBytes(cred) {
    try {
      var ext = cred.getClientExtensionResults();
      var first = ext && ext.prf && ext.prf.results && ext.prf.results.first;
      if (!first) return null;
      var bytes = new Uint8Array(first);
      return bytes.length === 32 ? bytes : null;
    } catch (e) { return null; }
  }
  function prfEnabled(cred) {
    try {
      var ext = cred.getClientExtensionResults();
      return !!(ext && ext.prf && (ext.prf.enabled || ext.prf.results));
    } catch (e) { return false; }
  }
  function uvOk(cred) {
    try {
      var buf = null;
      if (cred.response && cred.response.authenticatorData) buf = cred.response.authenticatorData;
      else if (cred.response && cred.response.getAuthenticatorData) buf = cred.response.getAuthenticatorData();
      if (!buf) return true;
      var data = new Uint8Array(buf);
      if (data.length < 33) return false;
      return (data[32] & 0x04) === 0x04;
    } catch (e) { return true; }
  }
  function saltBuffer() {
    return BenjiCrypto.prfSalt().then(function (salt) {
      return salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength);
    });
  }
  function createFaceCredential(withPrf) {
    return saltBuffer().then(function (salt) {
      var publicKey = {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: "Benji's Day", id: location.hostname },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: "benji",
          displayName: "Benji",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "preferred",
          userVerification: "required",
        },
        attestation: "none",
        timeout: 60000,
      };
      if (withPrf) publicKey.extensions = { prf: { eval: { first: salt } } };
      return navigator.credentials.create({ publicKey: publicKey });
    });
  }
  function getFaceCredential(credentialId, withPrf, signal) {
    return saltBuffer().then(function (salt) {
      var id = BenjiCrypto.b64decode(credentialId);
      var publicKey = {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: location.hostname,
        userVerification: "required",
        allowCredentials: [{ type: "public-key", id: id }],
        timeout: 60000,
      };
      if (withPrf) publicKey.extensions = { prf: { eval: { first: salt } } };
      return navigator.credentials.get({ publicKey: publicKey, signal: signal });
    });
  }
  function enrollFace() {
    var created = null;
    return createFaceCredential(true).catch(function (err) {
      if (err && err.name === "NotAllowedError") throw err;
      return createFaceCredential(false);
    }).then(function (cred) {
      if (!cred) throw new DOMException("cancelled", "NotAllowedError");
      if (!uvOk(cred)) throw new Error("uv");
      created = cred;
      var id = BenjiCrypto.b64encode(new Uint8Array(cred.rawId));
      var secret = prfBytes(cred);
      if (secret || !prfEnabled(cred)) return { id: id, secret: secret };
      return getFaceCredential(id, true, undefined).then(function (assertion) {
        if (!assertion || !uvOk(assertion)) throw new Error("uv");
        return { id: id, secret: prfBytes(assertion) };
      }).catch(function (err) {
        if (err && err.name === "NotAllowedError") throw err;
        return { id: id, secret: null };
      });
    }).then(function (got) {
      if (got.secret) {
        return BenjiCrypto.wrapPasscode(got.secret, S.passcode).then(function (wrapped) {
          saveFace({ v: 1, mode: "prf", credentialId: got.id, wrapped: wrapped });
          localStorage.removeItem(OFFER_KEY);
        });
      }
      saveFace({ v: 1, mode: "uv", credentialId: got.id });
      if (S.passcode) localStorage.setItem(PASS_KEY, S.passcode);
      localStorage.removeItem(OFFER_KEY);
    });
  }
  function disableFace() {
    if (S.passcode) localStorage.setItem(PASS_KEY, S.passcode);
    localStorage.removeItem(FACE_KEY);
    localStorage.setItem(OFFER_KEY, "skip");
  }
  function passcodeFromAssertion(cred) {
    var face = loadFace();
    if (!face || !uvOk(cred)) return Promise.resolve(null);
    if (face.mode === "prf") {
      var secret = prfBytes(cred);
      if (!secret) return Promise.resolve(null);
      return BenjiCrypto.unwrapPasscode(secret, face.wrapped);
    }
    return Promise.resolve(localStorage.getItem(PASS_KEY));
  }
  function startFaceGet(gesture) {
    var face = loadFace();
    if (!face) return;
    if (faceAbort) faceAbort.abort();
    faceAbort = new AbortController();
    var signal = faceAbort.signal;
    var gen = ++faceGen;
    S.faceBusy = true;
    S.faceGesture = !!gesture;
    if (gesture) {
      S.faceError = "";
      render();
    }
    getFaceCredential(face.credentialId, face.mode === "prf", signal).then(function (cred) {
      if (gen !== faceGen) return null;
      if (!cred) throw new Error("cancel");
      return passcodeFromAssertion(cred).then(function (pass) {
        if (gen !== faceGen) return null;
        if (!pass) throw new Error("unwrap");
        return unlockWithPasscode(pass, { fromFace: true });
      });
    }).catch(function (err) {
      if (gen !== faceGen) return;
      S.faceBusy = false;
      if (err && err.name === "AbortError") return;
      if (!gesture) {
        if (S.screen === "face") render();
        return;
      }
      S.faceError = err && err.message === "unwrap"
        ? "Face ID couldn't unlock the saved passcode. Use your passcode instead."
        : "Face ID didn't unlock. Try again or use your passcode.";
      if (S.screen === "face") render();
    });
  }

  /* ---------- unlock ---------- */

  function showApp() {
    S.screen = "app";
    S.settings = false;
    reseedMilestones();
    render();
    doSync();
  }
  function unlockWithPasscode(pw, opts) {
    opts = opts || {};
    var job;
    if (S.demo) job = fetchNamed("data.sample.json").then(function (data) { return data; });
    else {
      job = fetchNamed("data.enc.json").then(function (env) {
        return BenjiCrypto.decryptJson(pw, env);
      });
    }
    return job.then(function (data) {
      if (!data) {
        if (opts.auto) localStorage.removeItem(PASS_KEY);
        renderPasscode({ error: "That passcode didn't work.", canFace: !!loadFace() });
        return;
      }
      S.passcode = pw;
      adoptData(data);
      prune();
      saveState();
      var face = loadFace();
      if (!face) {
        localStorage.setItem(PASS_KEY, pw);
        if (!opts.skipOffer && !S.demo && localStorage.getItem(OFFER_KEY) !== "skip") {
          return faceAvailable().then(function (ok) {
            faceOk = ok;
            if (ok) { presentOffer(); return; }
            showApp();
          });
        }
      } else if (face.mode === "prf") {
        localStorage.removeItem(PASS_KEY);
      }
      showApp();
    }).catch(function () {
      renderPasscode({ error: "Couldn't load today's data.", canFace: !!loadFace() || !!opts.fromFace });
    });
  }
  function presentOffer() {
    S.offerOn = true;
    S.offerError = "";
    S.offerBusy = false;
    S.screen = "offer";
    render();
  }
  function acceptOffer() {
    if (!S.offerOn) {
      localStorage.setItem(OFFER_KEY, "skip");
      showApp();
      return;
    }
    S.offerBusy = true;
    S.offerError = "";
    render();
    enrollFace().then(function () {
      S.offerBusy = false;
      showApp();
    }).catch(function (err) {
      S.offerBusy = false;
      S.offerError = err && err.name === "NotAllowedError"
        ? "Face ID was cancelled."
        : "Face ID isn't available on this phone.";
      render();
    });
  }
  function renderPasscode(opts) {
    opts = opts || {};
    S.screen = "passcode";
    S.passError = opts.error || "";
    S.canFace = !!opts.canFace && !!loadFace();
    S.busy = false;
    render();
    var input = document.getElementById("passcode");
    if (input) input.focus();
  }
  function lockApp() {
    stopRefreshWatch();
    S.syncNote = "";
    S.syncOk = false;
    S.passcode = null;
    S.data = null;
    S.settings = false;
    S.cheer = null;
    S.syncing = false;
    if (loadFace()) {
      faceGen++;
      if (faceAbort) faceAbort.abort();
      S.faceBusy = false;
      S.faceError = "";
      S.screen = "face";
      render();
    } else renderPasscode();
  }
  function usePasscodeInstead() {
    faceGen++;
    if (faceAbort) faceAbort.abort();
    S.faceBusy = false;
    S.faceError = "";
    renderPasscode({ canFace: true });
  }

  /* ---------- interactions ---------- */

  function submitAdd(e) {
    if (e) e.preventDefault();
    var input = document.getElementById("add-text");
    var text = (input ? input.value : S.addDraft || "").replace(/\s+/g, " ").trim();
    if (!text) {
      if (input) input.focus();
      return;
    }
    if (text.length > 240) text = text.slice(0, 240);
    var picked = document.getElementById("add-section");
    var names = sectionNames();
    var section = picked ? picked.value : S.addSection;
    section = normalizeSection(section);
    var item = {
      id: "u-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      text: text,
      section: section,
      at: nowIso(),
    };
    S.added.push(item);
    delete S.removed[item.id];
    S.addDraft = "";
    S.addOpen = false;
    S.freshId = item.id;
    S.groupOpen[section] = true;
    if (S.demo) saveState();
    else enqueue({ type: "add", id: item.id, text: item.text, section: item.section, at: item.at });
    render();
    setTimeout(function () {
      if (S.freshId === item.id) {
        S.freshId = null;
        if (S.screen === "app") render();
      }
    }, 400);
  }
  function removeMine(item) {
    var queuedAdd = (S.queue || []).some(function (q) { return q.type === "add" && q.id === item.id; });
    var published = !!dataTodoIds()[item.id];
    S.queue = S.queue.filter(function (q) { return q.id !== item.id; });
    S.added = S.added.filter(function (a) { return a.id !== item.id; });
    delete S.overrides[item.id];
    if (queuedAdd && !published) delete S.removed[item.id];
    else S.removed[item.id] = nowIso();
    if (!S.demo && !(queuedAdd && !published) && userEventOk({ type: "remove", id: item.id, at: S.removed[item.id] })) {
      S.queue.push({ type: "remove", id: item.id, at: S.removed[item.id] });
    }
    saveState();
    if (!S.demo) flushQueue();
    render();
  }
  function toggleTodo(item) {
    var cur = isDone(item);
    var next = !cur;
    enqueue({ type: "todo", id: item.id, text: item.text, done: next, at: nowIso() });
    S.popId = item.id;
    S.burstId = next ? item.id : null;
    if (next) {
      S.leaving[item.id] = true;
      noteTapMilestones();
      render();
      setTimeout(function () {
        delete S.leaving[item.id];
        if (S.popId === item.id) S.popId = null;
        if (S.burstId === item.id) S.burstId = null;
        if (S.screen === "app") render();
      }, 620);
    } else {
      noteTapMilestones();
      render();
    }
  }
  function markInbox(item, done) {
    enqueue({
      type: "inbox",
      id: item.id,
      text: splitNext(item.detail).what,
      done: done,
      at: nowIso(),
    });
    noteTapMilestones();
    render();
  }
  function cheer(title, sub) {
    S.cheer = { title: title, sub: sub, n: Date.now() };
    render();
    clearTimeout(S.cheerTimer);
    S.cheerTimer = setTimeout(function () {
      S.cheer = null;
      if (S.screen === "app") render();
    }, 2500);
  }

  /* ---------- views ---------- */

  function render() {
    var y = window.scrollY;
    var root = document.getElementById("app");
    document.body.dataset.screen = S.screen;
    root.replaceChildren(build());
    if (S.screen === "app") window.scrollTo(0, y);
    if (S.addFocus) {
      S.addFocus = false;
      var addInput = document.getElementById("add-text");
      if (addInput) addInput.focus();
    }
    S.painted = true;
  }
  function build() {
    if (S.screen === "passcode") return passcodeView();
    if (S.screen === "face") return faceView();
    if (S.screen === "offer") return offerView();
    if (S.screen === "message") return messageView();
    if (S.screen === "app" && S.data) return appView();
    return openingView();
  }
  function openingView() {
    return el("main", { class: "lock" }, [
      el("div", { class: "lock-inner" }, [
        el("h1", { text: "Benji's Day" }),
        el("p", { class: "lead", text: "Opening…" }),
      ]),
    ]);
  }
  function messageView() {
    return el("main", { class: "lock" }, [
      el("div", { class: "lock-inner" }, [
        el("h1", { text: "Benji's Day" }),
        el("p", { class: "lead", text: S.passError || "Something went wrong." }),
      ]),
    ]);
  }
  function passcodeView() {
    var kids = [
      el("h1", { text: "Benji's Day" }),
      el("label", { class: "lead", for: "passcode", text: "Enter your passcode" }),
    ];
    var formKids = [
      el("input", {
        id: "passcode",
        type: "password",
        autocomplete: "current-password",
        autocapitalize: "off",
        autocorrect: "off",
        spellcheck: "false",
        enterkeyhint: "go",
        "aria-label": "Passcode",
      }),
      el("button", { class: "btn press", id: "continue", type: "submit", text: "Continue" }),
      el("p", { class: "err", text: S.passError || "" }),
    ];
    var form = el("form", { onsubmit: onPassSubmit }, formKids);
    kids.push(form);
    if (S.canFace) {
      kids.push(el("button", {
        class: "text-btn press",
        id: "use-face",
        type: "button",
        text: "Use Face ID instead",
        onclick: function () {
          S.faceError = "";
          S.screen = "face";
          render();
          startFaceGet(true);
        },
      }));
    }
    return el("main", { class: "lock" }, [el("div", { class: "lock-inner" }, kids)]);
  }
  function onPassSubmit(e) {
    e.preventDefault();
    var input = document.getElementById("passcode");
    var pw = input ? input.value : "";
    if (!pw) {
      var err = document.querySelector(".err");
      if (err) err.textContent = "Enter your passcode.";
      return;
    }
    var btn = document.getElementById("continue");
    if (btn) { btn.disabled = true; btn.textContent = "Opening…"; }
    unlockWithPasscode(pw, {});
  }
  function faceView() {
    var label = S.faceBusy && S.faceGesture ? "Waiting for Face ID…" : "Unlock with Face ID";
    return el("main", { class: "lock" }, [
      el("div", { class: "lock-inner" }, [
        el("h1", { text: "Benji's Day" }),
        el("button", {
          class: "btn press",
          id: "face-unlock",
          type: "button",
          text: label,
          disabled: S.faceBusy ? "disabled" : null,
          onclick: function () { startFaceGet(true); },
        }),
        el("button", {
          class: "text-btn press",
          id: "use-passcode",
          type: "button",
          text: "Use passcode instead",
          onclick: usePasscodeInstead,
        }),
        el("p", { class: "err", text: S.faceError || "" }),
      ]),
    ]);
  }
  function offerView() {
    var sw = el("button", {
      class: "switch" + (S.offerOn ? " on" : ""),
      type: "button",
      role: "switch",
      "aria-checked": S.offerOn ? "true" : "false",
      "aria-label": "Use Face ID to unlock",
      disabled: S.offerBusy ? "disabled" : null,
      onclick: function () {
        if (S.offerBusy) return;
        S.offerOn = !S.offerOn;
        render();
      },
    }, [el("i")]);
    return el("main", { class: "lock" }, [
      el("div", { class: "lock-inner" }, [
        el("h1", { text: "Benji's Day" }),
        el("p", { class: "lead strong", text: "Use Face ID to unlock" }),
        el("p", { class: "lock-copy", text: "Next time, a glance can open Benji's Day on this phone." }),
        el("div", { class: "offer-row" }, [
          el("span", { text: "Use Face ID to unlock" }),
          sw,
        ]),
        el("button", {
          class: "btn press",
          id: "continue",
          type: "button",
          text: S.offerBusy ? "Waiting for Face ID…" : "Continue",
          disabled: S.offerBusy ? "disabled" : null,
          onclick: acceptOffer,
        }),
        el("p", { class: "err", text: S.offerError || "" }),
      ]),
    ]);
  }

  function appView() {
    var enter = S.enterTab !== S.tab;
    S.enterTab = S.tab;
    var colKids = [header(), ptrEl(), hero(), tabs()];
    var panelKids = [];
    if (S.tab === "todo") panelKids = todoTab();
    else if (S.tab === "inbox") panelKids = inboxTab();
    else panelKids = moneyTab();
    colKids.push(el("div", { class: enter ? "in" : "" }, panelKids));
    var rootKids = [el("div", { class: "col" }, colKids)];
    if (S.settings) rootKids.push(settingsSheet());
    if (S.cheer) rootKids.push(celebrate());
    return el("div", { class: "app" }, rootKids);
  }
  function ptrEl() {
    if (S.ptr <= 0) return null;
    return el("div", { class: "ptr", style: "height:" + S.ptr + "px" }, [
      el("span", { text: S.ptr > 64 ? "Release to sync" : "Pull to sync" }),
    ]);
  }
  function header() {
    return el("header", { class: "head" }, [
      el("div", { class: "head-top" }, [
        el("h1", { text: "Benji's Day" }),
        el("button", {
          class: "icon-btn press",
          id: "settings",
          type: "button",
          "aria-label": "Settings",
          onclick: function () {
            S.settings = true;
            S.settingsError = "";
            render();
            faceAvailable().then(function (ok) {
              var changed = faceOk !== ok;
              faceOk = ok;
              // A saved Face ID record already draws the sheet. Rebuilding it
              // a moment later would drop a tap on Lock.
              if (changed && !loadFace() && S.settings && S.screen === "app") render();
            });
          },
        }, [gearIcon()]),
      ]),
      el("button", {
        class: "sync-btn press" + (S.syncOk ? " ok" : ""),
        id: "sync",
        type: "button",
        "aria-label": "Sync, " + syncLabel(),
        onclick: function () { doSync({ refresh: true }); },
      }, [
        syncIcon(S.syncing, S.syncOk),
        el("span", { id: "sync-label", text: syncLabel() }),
      ]),
    ]);
  }
  function hero() {
    var c = counts();
    var pct = c.total ? c.done / c.total : 0;
    var num = el("span", { class: "num", id: "left-count" });
    mountTween(num, "left", c.left);
    return el("div", { class: "hero" + (S.painted ? "" : " in-slow") }, [
      el("div", { class: "greet", text: greeting(new Date()) + ", Benji" }),
      el("div", { class: "big-row" }, [num, el("span", { class: "big-label", text: "to-dos left" })]),
      el("div", { class: "progress-line", text: c.done + " of " + c.total + " done · " + Math.round(pct * 100) + "%" }),
      el("div", { style: "margin-top:14px" }, [bar(pct, 5, "hero")]),
      el("div", { class: "stats" }, [
        stat(String(c.replies), "need a reply", "inbox"),
        stat(String((S.data.schedule || []).length), "on the calendar", "todo"),
        stat(S.data.spend ? S.data.spend.total : "", "spent this week", "money"),
      ]),
      el("div", { class: "meta-line", text: (S.data.DATE_LABEL || "") + " · Updated " + (S.data.UPDATED || "") }),
    ]);
  }
  function stat(value, label, tab) {
    return el("button", {
      class: "stat press",
      type: "button",
      "aria-label": value + " " + label,
      onclick: function () { S.tab = tab; render(); },
    }, [el("b", { text: value }), el("span", { text: label })]);
  }
  function tabs() {
    var c = counts();
    var items = [
      { id: "todo", label: "To-do", count: c.total - c.done },
      { id: "inbox", label: "Inbox", count: c.replies },
      { id: "money", label: "Finances" },
    ];
    var idx = Math.max(0, items.findIndex(function (t) { return t.id === S.tab; }));
    var row = el("div", { class: "tabs", role: "tablist" });
    items.forEach(function (t) {
      var on = t.id === S.tab;
      var btn = el("button", {
        class: "tab press",
        type: "button",
        role: "tab",
        "data-tab": t.id,
        "aria-selected": on ? "true" : "false",
        onclick: function () { S.tab = t.id; render(); },
      }, [t.label]);
      if (t.count != null) btn.append(el("span", { class: "tab-count", text: String(t.count) }));
      row.append(btn);
    });
    var ind = el("div", { class: "tab-ind" }, [el("i")]);
    ind.style.setProperty("--i", String(idx));
    row.append(ind);
    return el("div", { class: "tabs-wrap" }, [row]);
  }
  function section(title, right) {
    var row = el("div", { class: "section" }, [el("h2", { text: title })]);
    if (right) row.append(el("span", { text: right }));
    return row;
  }

  function todoTab() {
    var nodes = [timeline()];
    var todos = allTodos();
    var open = todos.filter(function (t) { return !isDone(t); }).length;
    nodes.push(section("To-dos", open + " open"));
    nodes.push(addTodoControl());
    nodes.push(el("div", { class: "hint", text: "Tap the circle to check one off. Finished items move to Done at the bottom of each group." }));
    var by = [];
    todos.forEach(function (item) {
      var g = by.find(function (x) { return x.name === item.group; });
      if (!g) { g = { name: item.group, items: [] }; by.push(g); }
      g.items.push(item);
    });
    by.filter(function (g) { return g.items.length; }).forEach(function (g, index) {
      nodes.push(groupCard(g, index));
    });
    return nodes;
  }
  function timeline() {
    var schedule = S.data.schedule || [];
    if (!schedule.length) return el("div");
    var d = new Date();
    var iso = localIso(d);
    var day = String(S.data.DAY_ISO || "");
    var rel = iso < day ? -1 : iso > day ? 1 : 0;
    var now = d.getHours() + d.getMinutes() / 60;
    var hi = rel < 0 ? 0 : rel > 0 ? -1 : schedule.findIndex(function (s) { return s.end > now; });
    var liveIdx = rel === 0 ? schedule.findIndex(function (s) { return now >= s.start && now < s.end; }) : -1;
    var box = el("div");
    box.append(section("Today", schedule.length + " events"));
    schedule.forEach(function (s, i) {
      var a = fmtHour(s.start);
      var past = rel > 0 || (rel === 0 && now >= s.end);
      var isHi = i === hi;
      var live = i === liveIdx;
      if (i > 0) box.append(el("div", { class: "hair sched" }));
      var row = el("div", { class: "sched" + (past ? " past" : "") + (isHi ? " hi" : "") });
      row.append(el("div", { class: "when" }, [
        el("b", { text: a.t }),
        el("em", { text: a.ap }),
      ]));
      var mid = el("div", { style: "flex:1;min-width:0" }, [
        el("div", { class: "title", text: s.title }),
        el("div", { class: "range", text: fmtRange(s.start, s.end) }),
      ]);
      row.append(mid);
      if (isHi) {
        row.append(el("span", { class: "now" }, [
          el("span", { class: "dot" + (live ? " live" : "") }),
          el("span", { class: "now-label", text: live ? "Now" : "Up next" }),
        ]));
      }
      box.append(row);
    });
    return box;
  }
  function groupCard(g, index) {
    var open = S.groupOpen[g.name] !== false;
    var gd = g.items.filter(isDone).length;
    var all = g.items.length > 0 && gd === g.items.length;
    var openItems = g.items.filter(function (i) { return !isDone(i) || S.leaving[i.id]; });
    var doneItems = g.items.filter(function (i) { return isDone(i) && !S.leaving[i.id]; });
    var head = el("button", {
      class: "group-head press",
      type: "button",
      "aria-expanded": open ? "true" : "false",
      onclick: function () { S.groupOpen[g.name] = !open; render(); },
    });
    var line = el("span", { class: "group-line" }, [
      el("strong", { text: g.name }),
    ]);
    if (all) line.append(el("span", { class: "all-done", text: "All done" }));
    line.append(el("span", { class: "gd", text: gd + "/" + g.items.length }));
    line.append(chevron(open));
    head.append(line);
    head.append(el("span", { style: "display:block;margin-top:8px" }, [
      bar(g.items.length ? gd / g.items.length : 0, 3, "g:" + g.name, K.green, index * 60),
    ]));
    var card = el("section", { class: "group" + (S.painted ? "" : " in-row"), style: S.painted ? "" : "animation-delay:" + (index * 50) + "ms" }, [head]);
    if (!open) return card;
    var body = el("div", { class: "in" });
    openItems.forEach(function (it, i) {
      var out = !!S.leaving[it.id];
      var wrap = el("div", { class: (out ? "leave" : "") + (S.freshId === it.id ? " in" : "") });
      wrap.append(todoRow(it, isDone(it), i === 0));
      body.append(wrap);
    });
    if (doneItems.length) {
      if (openItems.length) body.append(el("div", { class: "hair" }));
      var shown = !!S.showDone[g.name];
      body.append(el("button", {
        class: "done-toggle press",
        type: "button",
        "aria-expanded": shown ? "true" : "false",
        "aria-label": (shown ? "Hide" : "Show") + " " + doneItems.length + " done in " + g.name,
        onclick: function () { S.showDone[g.name] = !shown; render(); },
      }, [
        el("span", { text: "Done (" + doneItems.length + ")" }),
        chevron(shown),
      ]));
      if (shown) {
        doneItems.forEach(function (it) {
          var row = el("div", { class: "in" });
          row.append(todoRow(it, true, false));
          body.append(row);
        });
      }
    }
    card.append(body);
    return card;
  }
  function todoRow(it, on, first) {
    var box = el("div");
    if (!first) box.append(el("div", { class: "hair todo" }));
    var circle = el("span", { class: "circle" + (on ? " on" : "") + (S.popId === it.id ? " pop" : "") });
    if (on) circle.append(checkPath(K.bg));
    var wrap = el("span", { class: "check-wrap" }, [circle]);
    if (S.burstId === it.id && !reducedMotion()) wrap.append(burst());
    var check = el("button", {
      class: "check-btn",
      type: "button",
      "data-check": it.id,
      "aria-label": (on ? "Uncheck" : "Check") + " " + it.text,
      onclick: function () { toggleTodo(it); },
    }, [wrap]);
    var copy = el("span", { class: "todo-copy" }, [
      el("span", { class: "todo-text" + (on ? " on" : ""), text: it.text }),
    ]);
    if (it.mine || it.waiting || it.meta) {
      var meta = el("span", { class: "todo-meta" });
      if (it.mine) meta.append(el("span", { class: "mine-mark", text: "Added by you" }));
      if (it.mine && (it.waiting || it.meta)) meta.append(el("span", { "aria-hidden": "true", text: "·" }));
      if (it.waiting) meta.append(el("span", { class: "wait" + (on ? " on" : ""), text: "Waiting on you" }));
      if (it.waiting && it.meta) meta.append(el("span", { "aria-hidden": "true", text: "·" }));
      if (it.meta) meta.append(el("span", { text: it.meta }));
      copy.append(meta);
    }
    var mainKids = [copy];
    var expanded = !!(it.src && S.expandTodo[it.id]);
    if (it.src) mainKids.push(chevron(expanded));
    var main = el("button", {
      class: "todo-main press",
      type: "button",
      "aria-expanded": it.src ? (expanded ? "true" : "false") : null,
      "aria-label": it.src ? it.text + ", show source" : (on ? "Uncheck " : "Check ") + it.text,
      onclick: function () {
        if (it.src) { S.expandTodo[it.id] = !S.expandTodo[it.id]; render(); }
        else toggleTodo(it);
      },
    }, mainKids);
    var row = el("div", { class: "todo", "data-id": it.id });
    row.append(check, main);
    if (it.mine) {
      row.append(el("button", {
        class: "todo-x press",
        type: "button",
        "aria-label": "Remove " + it.text,
        onclick: function () { removeMine(it); },
      }, [el("span", { "aria-hidden": "true", text: "×" })]));
    }
    box.append(row);
    if (expanded && it.src) {
      var pill = linkEl(it.src.href, it.src.label, "pill press");
      if (pill) box.append(el("div", { class: "src in" }, [pill]));
    }
    return box;
  }

  function addTodoControl() {
    if (!S.addOpen) {
      return el("button", {
        class: "add-todo press",
        id: "add-todo",
        type: "button",
        onclick: function () {
          var names = sectionNames();
          if (SECTIONS.indexOf(S.addSection) < 0) S.addSection = "Personal";
          S.addOpen = true;
          S.addFocus = true;
          render();
        },
      }, [el("span", { text: "Add a to-do" })]);
    }
    var names = sectionNames();
    if (SECTIONS.indexOf(S.addSection) < 0) S.addSection = "Personal";
    var select = el("select", {
      id: "add-section",
      "aria-label": "Section",
      onchange: function (e) { S.addSection = e.target.value; },
    });
    names.forEach(function (name) {
      var opt = el("option", { value: name, text: name });
      if (name === S.addSection) opt.setAttribute("selected", "selected");
      select.append(opt);
    });
    return el("form", { class: "add-sheet", id: "add-form", onsubmit: submitAdd }, [
      el("label", { class: "add-label", for: "add-text", text: "New to-do" }),
      el("input", {
        id: "add-text",
        type: "text",
        enterkeyhint: "done",
        autocomplete: "off",
        autocapitalize: "sentences",
        maxlength: "240",
        placeholder: "What needs doing?",
        "aria-label": "To-do",
        value: S.addDraft || "",
        oninput: function (e) { S.addDraft = e.target.value; },
      }),
      el("label", { class: "add-label", for: "add-section", text: "Section" }),
      select,
      el("div", { class: "add-actions" }, [
        el("button", {
          class: "text-btn press",
          type: "button",
          text: "Cancel",
          onclick: function () {
            S.addOpen = false;
            S.addDraft = "";
            render();
          },
        }),
        el("button", { class: "btn press", id: "add-submit", type: "submit", text: "Add" }),
      ]),
    ]);
  }
  function inboxTab() {
    var needs = allInbox().filter(function (i) { return i.needs && !inboxHidden(i); });
    var fyi = allInbox().filter(function (i) { return !i.needs && !inboxHidden(i); });
    var hiddenCount = allInbox().filter(inboxHidden).length;
    var big = el("span", { class: "num inbox-num", id: "inbox-count" });
    mountTween(big, "inbox", needs.length);
    var nodes = [
      el("div", { class: "inbox-top" }, [
        el("div", { class: "big-row" }, [
          big,
          el("span", { class: "big-label", text: needs.length === 0 ? "Inbox zero" : "need a reply" }),
        ]),
        el("div", { class: "subline", text: fyi.length + " FYI · " + (S.data.skipped ? S.data.skipped.count : "") + " skipped" }),
      ]),
    ];
    if (needs.length) {
      nodes.push(section("Needs a reply", String(needs.length)));
      needs.forEach(function (item, n) { nodes.push(inboxCard(item, true, n === 0)); });
    }
    if (fyi.length) {
      nodes.push(section("FYI", String(fyi.length)));
      fyi.forEach(function (item, n) { nodes.push(inboxCard(item, false, n === 0)); });
    }
    var skip = el("div", { class: "skip-block" });
    skip.append(el("button", {
      class: "skip-row press",
      type: "button",
      "aria-expanded": S.showSkipped ? "true" : "false",
      onclick: function () { S.showSkipped = !S.showSkipped; render(); },
    }, [
      el("span", { text: "Skipped" }),
      el("span", { class: "subline", text: S.data.skipped ? S.data.skipped.count : "" }),
      chevron(S.showSkipped),
    ]));
    if (S.showSkipped && S.data.skipped) {
      skip.append(el("div", { class: "skip-detail in", text: S.data.skipped.detail || "" }));
    }
    if (hiddenCount > 0) {
      skip.append(el("button", {
        class: "show-row press",
        type: "button",
        onclick: function () {
          allInbox().forEach(function (item) {
            if (!inboxHidden(item)) return;
            enqueue({
              type: "inbox",
              id: item.id,
              text: splitNext(item.detail).what,
              done: false,
              at: nowIso(),
            });
          });
          noteTapMilestones();
          render();
        },
      }, [
        el("span", { text: hiddenCount + " marked done" }),
        el("span", { class: "show-again", text: "Show again" }),
      ]));
    }
    nodes.push(skip);
    return nodes;
  }
  function replyRaw(item) {
    if (item.lead === "Text") return item.group ? "sms:" : "sms:" + (item.sms || "");
    var g = (S.data.gmail || {})[item.lead];
    if (!g || !g.email) return "";
    return "https://mail.google.com/mail/u/?authuser=" + encodeURIComponent(g.email) + "#inbox";
  }
  function replyLabel(item, needs) {
    if (item.lead === "Text") return needs ? "Reply in Messages" : "Open Messages";
    var g = (S.data.gmail || {})[item.lead];
    return g ? "Open " + g.name + " Gmail" : "Open";
  }
  function inboxCard(item, needs, first) {
    var name = displayName(item.title);
    var parts = splitNext(item.detail);
    var open = S.openInbox === item.id;
    var leaving = S.inboxLeaving === item.id;
    var box = el("div", { class: leaving ? "leave" : "", "data-inbox": item.id });
    if (!first) box.append(el("div", { class: "hair inbox" }));
    box.append(el("button", {
      class: "inbox-row press",
      type: "button",
      "aria-expanded": open ? "true" : "false",
      "aria-label": name + ", " + item.lead + ", " + item.meta,
      onclick: function () { S.openInbox = open ? null : item.id; render(); },
    }, [
      el("span", { class: "avatar", text: initialOf(name) }),
      el("span", { style: "flex:1;min-width:0;display:block" }, [
        el("span", { class: "who" }, [
          el("strong", { text: name }),
          el("span", { class: "when-r", text: item.meta }),
        ]),
        el("span", { class: "lead", text: item.lead }),
        el("span", { class: "summary" + (open ? "" : " clamp"), text: parts.what }),
      ]),
    ]));
    if (open) {
      var actions = el("div", { class: "inbox-actions in" });
      if (parts.next) {
        actions.append(el("div", { class: "next-step" }, [
          el("div", { text: "Next step" }),
          el("strong", { text: parts.next }),
        ]));
      }
      var href = replyRaw(item);
      var row = el("div", { class: "pill-row" });
      if (href) {
        var pill = linkEl(href, replyLabel(item, needs), "pill press grow" + (needs ? "" : " gray"));
        if (pill) row.append(pill);
      }
      row.append(el("button", {
        class: "pill gray press done-pill",
        type: "button",
        "aria-label": "Mark " + name + " done",
        onclick: function () {
          S.inboxLeaving = item.id;
          S.openInbox = null;
          render();
          setTimeout(function () {
            if (S.inboxLeaving === item.id) S.inboxLeaving = null;
            markInbox(item, true);
          }, 360);
        },
      }, [
        checkPath(K.ink),
        document.createTextNode(" Done"),
      ]));
      actions.append(row);
      box.append(actions);
    }
    return box;
  }

  function moneyTab() {
    var spend = S.data.spend || {};
    var purchases = S.data.purchases || [];
    var pending = purchases.filter(function (p) { return p.pending; }).length;
    var accounts = S.data.byAccount || [];
    var max = Math.max.apply(null, accounts.map(function (b) { return b.value; }).concat([1]));
    var nodes = [
      el("div", { class: "money-kicker", text: "Spent this week" }),
      el("div", { class: "money-total", text: spend.total || "" }),
      el("div", { class: "subline", text: spend.period || "" }),
      el("div", { class: "tiles" }, [
        el("div", { class: "tile" }, [
          el("b", { text: spend.count || "" }),
          el("span", { text: pending + " pending" }),
        ]),
        el("div", { class: "tile" }, [
          el("b", { class: "plus", text: "+" + (spend.refunds || "") }),
          el("span", { text: "Refunds: " + (spend.refundsDetail || "") }),
        ]),
      ]),
      section("Where it went"),
    ];
    accounts.forEach(function (b, i) {
      nodes.push(el("div", { class: "acct" }, [
        el("div", { class: "acct-line" }, [
          el("span", { text: b.label }),
          el("b", { text: b.display }),
        ]),
        bar(b.value / max, 6, "a:" + b.label, i === 0 ? K.green : K.soft, i * 70),
      ]));
    });
    nodes.push(section("Transactions", String(purchases.length)));
    var dates = [];
    purchases.forEach(function (p) { if (dates.indexOf(p.lead) < 0) dates.push(p.lead); });
    dates.forEach(function (d) {
      var block = el("div", { style: "margin-top:10px" });
      block.append(el("div", { class: "day-h", text: dayLabel(d) }));
      var rows = [];
      purchases.forEach(function (p, idx) { if (p.lead === d) rows.push({ p: p, idx: idx }); });
      rows.forEach(function (row, i) {
        if (i > 0) block.append(el("div", { class: "hair" }));
        var isOpen = S.openTx === row.idx;
        block.append(el("button", {
          class: "tx press",
          type: "button",
          "aria-expanded": isOpen ? "true" : "false",
          onclick: function () { S.openTx = isOpen ? null : row.idx; render(); },
        }, [
          el("span", { style: "flex:1;min-width:0" }, [
            el("span", { class: "tx-title", text: row.p.title }),
            el("span", { class: "tx-sub", text: row.p.detail + (row.p.pending ? " · Pending" : "") }),
          ]),
          el("span", { class: "tx-amt", text: row.p.meta }),
        ]));
        if (isOpen) {
          block.append(el("div", { class: "tx-detail in" }, [
            el("span", { text: "Date" }), el("b", { text: dayLabel(row.p.lead) }),
            el("span", { text: "Account" }), el("b", { text: row.p.detail }),
            el("span", { text: "Status" }), el("b", { text: row.p.pending ? "Pending" : "Posted" }),
            el("span", { text: "Amount" }), el("b", { text: row.p.meta }),
          ]));
        }
      });
      nodes.push(block);
    });
    if (spend.note) nodes.push(el("div", { class: "note", text: spend.note }));
    var bal = el("div", { class: "bal-wrap" });
    bal.append(el("button", {
      class: "bal-btn press",
      type: "button",
      "aria-expanded": S.showBal ? "true" : "false",
      onclick: function () { S.showBal = !S.showBal; render(); },
    }, [
      el("strong", { text: "Balances" }),
      el("em", { text: S.showBal ? "Hide" : "Show" }),
      chevron(S.showBal),
    ]));
    if (S.showBal) {
      var body = el("div", { class: "in", style: "padding-bottom:8px" });
      body.append(el("div", { class: "bal-h", text: "Cash and investments" }));
      (S.data.cash || []).forEach(function (r, i) { body.append(balanceRow(r, i)); });
      body.append(el("div", { class: "bal-h owed", text: "Owed" }));
      (S.data.owed || []).forEach(function (r, i) { body.append(balanceRow(r, i)); });
      bal.append(body);
    }
    nodes.push(bal);
    if (spend.footnote) nodes.push(el("div", { class: "note", text: spend.footnote }));
    return nodes;
  }
  function balanceRow(r, i) {
    var box = el("div");
    if (i > 0) box.append(el("div", { class: "hair" }));
    var name = el("div", { class: "name", text: r.title });
    var mid = el("div", { style: "flex:1;min-width:0" }, [name]);
    if (r.detail) mid.append(el("div", { class: "detail", text: r.detail }));
    box.append(el("div", { class: "bal-row" }, [mid, el("b", { text: r.meta })]));
    return box;
  }

  function settingsSheet() {
    var face = loadFace();
    var rows = [
      el("div", { class: "grab" }),
      el("h2", { text: "Settings" }),
    ];
    if (!S.demo && (face || faceOk)) {
      var sw = el("button", {
        class: "switch" + (face ? " on" : ""),
        type: "button",
        role: "switch",
        id: "face-toggle",
        "data-face-mode": face ? face.mode : "off",
        "aria-checked": face ? "true" : "false",
        "aria-label": "Use Face ID to unlock",
        onclick: onFaceToggle,
      }, [el("i")]);
      rows.push(el("div", { class: "sheet-row" }, [
        el("span", { text: "Use Face ID to unlock" }),
        sw,
      ]));
      if (face) {
        rows.push(el("p", {
          class: "mode-line",
          id: "face-mode",
          text: face.mode === "prf"
            ? "Your passcode is locked behind Face ID and isn't stored on this phone."
            : "Face ID checks it's you. Your passcode stays saved on this phone.",
        }));
        rows.push(el("button", {
          class: "text-btn press",
          id: "face-reenroll",
          type: "button",
          text: "Set up again",
          onclick: function () {
            S.settingsError = "";
            enrollFace().then(function () { S.settingsError = ""; render(); }).catch(function (err) {
              S.settingsError = err && err.name === "NotAllowedError" ? "Face ID was cancelled." : "Face ID isn't available on this phone.";
              render();
            });
          },
        }));
      }
    }
    if (!S.demo) {
      rows.push(el("button", {
        class: "sheet-row press",
        id: "lock",
        type: "button",
        onclick: lockApp,
      }, [el("span", { text: "Lock" })]));
    }
    rows.push(el("button", {
      class: "text-btn press",
      type: "button",
      text: "Close",
      onclick: function () { S.settings = false; render(); },
    }));
    if (S.settingsError) rows.push(el("p", { class: "err", text: S.settingsError }));
    var sheet = el("div", {
      class: "sheet",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Settings",
      onclick: function (e) { e.stopPropagation(); },
    }, rows);
    return el("div", {
      class: "backdrop",
      onclick: function () { S.settings = false; render(); },
    }, [sheet]);
  }
  function onFaceToggle() {
    if (loadFace()) {
      disableFace();
      S.settingsError = "";
      render();
      return;
    }
    enrollFace().then(function () {
      S.settingsError = "";
      render();
    }).catch(function (err) {
      S.settingsError = err && err.name === "NotAllowedError" ? "Face ID was cancelled." : "Face ID isn't available on this phone.";
      render();
    });
  }
  function celebrate() {
    var box = el("div", { class: "celebrate", "aria-live": "polite" });
    if (!reducedMotion()) {
      var cols = [K.green, K.ink, "#C9CDD2", K.green, K.soft];
      for (var i = 0; i < 34; i++) {
        var bit = el("span", { class: "confetti-bit" });
        bit.style.left = ((i * 37 + 7) % 100) + "%";
        bit.style.width = (i % 3 ? 6 : 8) + "px";
        bit.style.height = (i % 3 ? 10 : 6) + "px";
        bit.style.background = cols[i % cols.length];
        bit.style.animationDuration = (1300 + (i % 5) * 160) + "ms";
        bit.style.animationDelay = ((i % 7) * 45) + "ms";
        bit.style.setProperty("--dx", ((i % 9) - 4) * 14 + "px");
        bit.style.setProperty("--r", (i % 2 ? 1 : -1) * (200 + (i % 4) * 90) + "deg");
        box.append(bit);
      }
    }
    box.append(el("div", { class: "toast" }, [
      el("strong", { text: S.cheer.title }),
      el("span", { text: S.cheer.sub }),
    ]));
    return box;
  }

  /* ---------- boot ---------- */

  function paintPtr() {
    var node = document.querySelector(".ptr");
    if (S.ptr <= 0) {
      if (node) node.remove();
      return;
    }
    if (!node) {
      node = document.createElement("div");
      node.className = "ptr";
      node.append(document.createElement("span"));
      var col = document.querySelector(".col");
      if (!col) return;
      col.insertBefore(node, col.firstChild);
    }
    node.style.height = S.ptr + "px";
    node.querySelector("span").textContent = S.ptr > 64 ? "Release to sync" : "Pull to sync";
  }
  function wirePtr() {
    var pullStart = 0;
    var pulling = false;
    document.addEventListener("touchstart", function (e) {
      if (S.screen !== "app" || S.settings) return;
      if (window.scrollY > 2) return;
      if (!e.touches || e.touches.length !== 1) return;
      pulling = true;
      pullStart = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener("touchmove", function (e) {
      if (!pulling) return;
      var dy = e.touches[0].clientY - pullStart;
      if (dy > 0 && window.scrollY <= 2) {
        if (e.cancelable) e.preventDefault();
        S.ptr = Math.min(88, dy * 0.45);
        paintPtr();
      } else if (dy < 0) {
        S.ptr = 0;
        paintPtr();
      }
    }, { passive: false });
    function end() {
      if (!pulling) return;
      pulling = false;
      var go = S.ptr > 64;
      S.ptr = 0;
      paintPtr();
      if (go) doSync({ refresh: true });
    }
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", end);
  }
  function wireGlobals() {
    document.documentElement.style.background = "#FFFFFF";
    document.documentElement.style.colorScheme = "light";
    document.body.style.background = "#FFFFFF";
    document.body.style.colorScheme = "light";
    document.body.style.margin = "0";
    wirePtr();
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && S.screen === "app") doSync();
    });
    window.addEventListener("online", function () { if (S.passcode) flushQueue(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && S.settings) { S.settings = false; render(); }
      else if (e.key === "Escape" && S.addOpen) { S.addOpen = false; S.addDraft = ""; render(); }
    });
    setInterval(function () {
      if (S.screen !== "app" || !S.data) return;
      var d = new Date();
      var sig = greeting(d) + "|" + d.getHours() + ":" + d.getMinutes() + "|" + localIso(d);
      if (sig === clockSig) return;
      clockSig = sig;
      render();
    }, 15000);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" }).catch(function () {});
    }
  }
  function boot() {
    S.demo = new URLSearchParams(location.search).get("demo") === "1";
    loadState();
    wireGlobals();
    faceAvailable().then(function (ok) { faceOk = ok; });
    if (S.demo) {
      fetchNamed("data.sample.json").then(function (data) {
        adoptData(data);
        prune();
        showApp();
      }).catch(function () {
        S.passError = "Couldn't load the demo.";
        S.screen = "message";
        render();
      });
      return;
    }
    var face = loadFace();
    if (face && face.credentialId) {
      if (face.mode === "prf") localStorage.removeItem(PASS_KEY);
      S.screen = "face";
      S.faceError = "";
      render();
      // A home-screen tap can still be a user gesture this early. Otherwise wait
      // for the Unlock button so a blocked prompt cannot cover it.
      if (navigator.userActivation && navigator.userActivation.isActive) startFaceGet(false);
      return;
    }
    var stored = null;
    try { stored = localStorage.getItem(PASS_KEY); } catch (e) { stored = null; }
    if (stored) {
      S.screen = "opening";
      render();
      unlockWithPasscode(stored, { auto: true });
      return;
    }
    renderPasscode();
  }

  boot();
})();
