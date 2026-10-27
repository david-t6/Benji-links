/* Benji's Day. Vanilla UI port of the day canvas, plus passcode, local ticks, and ntfy sync. */
"use strict";

var PASS_KEY = "benjis-day:passcode";
var TABS = [
  { value: "todo", label: "To-do" },
  { value: "inbox", label: "Inbox" },
  { value: "money", label: "Finances" },
];

var state = {
  demo: false,
  data: null,
  passcode: null,
  topic: null,
  tab: "todo",
  events: {},
  sync: "Saved on this device",
  animating: 0,
  ui: {
    openGroups: {},
    showDone: {},
    expanded: {},
    leaving: {},
    openInbox: null,
    showSkipped: false,
    showBal: false,
    openPurchase: null,
  },
};

var pending = [];
var outbox = [];
var pubChain = Promise.resolve();
var pumping = false;
var flushing = false;
var polling = false;
var retryTimer = 0;
var retryN = 0;
var animGen = 0;
var tweens = {};
var tweenRafs = {};
var tweenToken = {};
var nativeTimer = 0;
var busyIds = {};

function el(tag, attrs, kids) {
  var node = document.createElement(tag);
  attrs = attrs || {};
  Object.keys(attrs).forEach(function (key) {
    var value = attrs[key];
    if (value == null || value === false) return;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "hidden") node.hidden = true;
    else node.setAttribute(key, value === true ? "" : String(value));
  });
  (kids || []).forEach(function (child) {
    if (child == null || child === false) return;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  });
  if (tag === "button" && !node.hasAttribute("type")) node.type = "button";
  return node;
}

function cssEscape(value) {
  if (window.CSS && CSS.escape) return CSS.escape(String(value));
  return String(value).replace(/["\\]/g, "\\$&");
}

function reducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (err) {
    return false;
  }
}

function readJSON(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    /* storage unavailable */
  }
}

function eventsKey() {
  return state.demo ? "benjis-day:demo:events" : "benjis-day:events";
}

function pendingKey() {
  return "benjis-day:pending";
}

function outboxKey() {
  return "benjis-day:outbox";
}

function loadEvents() {
  var obj = readJSON(eventsKey(), {});
  state.events = {};
  if (!obj || typeof obj !== "object") return;
  Object.keys(obj).forEach(function (id) {
    var ev = obj[id];
    if (!ev || (ev.type !== "todo" && ev.type !== "inbox") || typeof ev.at !== "string") return;
    state.events[id] = { type: ev.type, id: id, text: ev.text || "", done: !!ev.done, at: ev.at };
  });
}

function saveEvents() {
  writeJSON(eventsKey(), state.events);
}

function loadPending() {
  var list = readJSON(pendingKey(), []);
  pending = Array.isArray(list) ? list : [];
}

function savePending() {
  writeJSON(pendingKey(), pending);
}

function loadOutbox() {
  var list = readJSON(outboxKey(), []);
  outbox = Array.isArray(list) ? list : [];
}

function saveOutbox() {
  writeJSON(outboxKey(), outbox);
}

function readPass() {
  try {
    return localStorage.getItem(PASS_KEY) || "";
  } catch (err) {
    return "";
  }
}

function remember(ev) {
  if (!ev || (ev.type !== "todo" && ev.type !== "inbox") || typeof ev.id !== "string" || !ev.id || typeof ev.at !== "string") {
    return false;
  }
  var prev = state.events[ev.id];
  if (prev && String(prev.at) >= String(ev.at)) return false;
  state.events[ev.id] = {
    type: ev.type,
    id: ev.id,
    text: ev.text || (prev && prev.text) || "",
    done: !!ev.done,
    at: ev.at,
  };
  saveEvents();
  return true;
}

function queueEvent(ev) {
  if (state.demo || !state.passcode || !state.topic) return;
  pending.push({
    type: ev.type,
    id: ev.id,
    text: ev.text || "",
    done: !!ev.done,
    at: ev.at,
    topic: state.topic,
  });
  savePending();
  setSync(pending.length + outbox.length ? "Waiting to sync " + (pending.length + outbox.length) : "Saved on this device");
  pump();
}

function pump() {
  if (pumping || state.demo || !state.passcode || !state.topic) return;
  pumping = true;
  function step() {
    if (!pending.length) {
      pumping = false;
      flushOutbox();
      return;
    }
    var ev = pending[0];
    if (!ev.topic || ev.topic !== state.topic) {
      pending.shift();
      savePending();
      step();
      return;
    }
    BenjiCrypto.encryptJSON(state.passcode, {
      type: ev.type,
      id: ev.id,
      text: ev.text || "",
      done: !!ev.done,
      at: ev.at,
    })
      .then(function (env) {
        if (!pending.length || pending[0] !== ev) {
          step();
          return;
        }
        pending.shift();
        savePending();
        outbox.push({ topic: ev.topic, body: JSON.stringify(env) });
        saveOutbox();
        step();
      })
      .catch(function () {
        pumping = false;
        setSync("Will retry when online");
        scheduleRetry();
      });
  }
  step();
}

function flushOutbox() {
  if (flushing || !outbox.length) return;
  flushing = true;
  var item = outbox[0];
  fetch("https://ntfy.sh/" + item.topic, {
    method: "POST",
    body: item.body,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    cache: "no-store",
  })
    .then(function (res) {
      if (!res.ok) throw new Error("ntfy " + res.status);
      outbox.shift();
      saveOutbox();
      flushing = false;
      retryN = 0;
      setSync(outbox.length || pending.length ? "Waiting to sync " + (outbox.length + pending.length) : "Synced");
      if (outbox.length) flushOutbox();
    })
    .catch(function () {
      flushing = false;
      setSync("Offline. Will retry.");
      scheduleRetry();
    });
}

function scheduleRetry() {
  if (retryTimer) return;
  var wait = [2000, 5000, 15000, 30000][Math.min(retryN, 3)];
  retryN += 1;
  retryTimer = window.setTimeout(function () {
    retryTimer = 0;
    pump();
    flushOutbox();
  }, wait);
}

function pollNtfy() {
  if (polling || state.demo || !state.topic || !state.passcode) return;
  polling = true;
  var topic = state.topic;
  var pass = state.passcode;
  fetch("https://ntfy.sh/" + topic + "/json?poll=1&since=12h", { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("poll " + res.status);
      return res.text();
    })
    .then(function (text) {
      var lines = String(text || "").split("\n");
      var chain = Promise.resolve(false);
      lines.forEach(function (line) {
        chain = chain.then(function (changed) {
          line = line.trim();
          if (!line) return changed;
          var msg;
          try {
            msg = JSON.parse(line);
          } catch (err) {
            return changed;
          }
          if (!msg || msg.event !== "message" || typeof msg.message !== "string") return changed;
          var env;
          try {
            env = JSON.parse(msg.message);
          } catch (err) {
            return changed;
          }
          if (!env || env.v !== 1 || !env.salt || !env.iv || !env.ct) return changed;
          return BenjiCrypto.decryptJSON(pass, env)
            .then(function (ev) {
              return remember(ev) || changed;
            })
            .catch(function () {
              return changed;
            });
        });
      });
      return chain;
    })
    .then(function (changed) {
      polling = false;
      if (state.passcode !== pass) return;
      if (changed) requestRender();
      else if (!outbox.length && !pending.length) setSync("Synced");
    })
    .catch(function () {
      polling = false;
    });
}

function setSync(text) {
  state.sync = text;
  var note = document.getElementById("sync-note");
  if (note) note.textContent = text;
}

function loadJSON(url) {
  return fetch(url, { cache: "no-store" }).then(function (res) {
    if (!res.ok) {
      var error = new Error("http " + res.status);
      error.status = res.status;
      throw error;
    }
    return res.json();
  });
}

function normalize(data) {
  if (!data || typeof data !== "object" || data.v !== 1) throw new Error("shape");
  if (!Array.isArray(data.groups) || !Array.isArray(data.schedule)) throw new Error("shape");
  ["needsReply", "fyi", "purchases", "byAccount", "cash", "owed"].forEach(function (key) {
    if (!Array.isArray(data[key])) data[key] = [];
  });
  if (!data.gmail || typeof data.gmail !== "object") data.gmail = {};
  if (!data.spend || typeof data.spend !== "object") data.spend = {};
  if (!data.skipped || typeof data.skipped !== "object") data.skipped = { count: "", detail: "" };
  return data;
}

function explain(err) {
  if (!err) return "Couldn't load the data file. Try again.";
  if (err.name === "OperationError" || err.message === "bad envelope") return "";
  if (err.status === 404 || err.message === "http 404") return "The data file isn't on the server yet.";
  if (err instanceof TypeError || (err.message && err.message.indexOf("http ") === 0)) return "Couldn't load the data file. Try again.";
  if (err.message === "shape" || err.name === "SyntaxError") return "The data file isn't readable.";
  return "Couldn't load the data file. Try again.";
}

function allItems() {
  return (state.data.groups || []).map(function (group) {
    var waiting = (group.waiting || []).map(function (task) {
      return {
        text: task.text,
        meta: task.meta,
        done: task.done,
        src: task.src,
        id: group.name + "|w|" + task.text,
        waiting: true,
      };
    });
    var todo = (group.todo || []).map(function (task) {
      return {
        text: task.text,
        meta: task.meta,
        done: task.done,
        src: task.src,
        id: group.name + "|t|" + task.text,
        waiting: false,
      };
    });
    return { name: group.name, items: waiting.concat(todo) };
  });
}

function isTodoDone(item) {
  var ev = state.events[item.id];
  if (ev && ev.type === "todo") return !!ev.done;
  return !!item.done;
}

function inboxId(item) {
  return item.title + "|" + item.meta;
}

function isInboxDone(id) {
  var ev = state.events[id];
  if (ev && ev.type === "inbox") return !!ev.done;
  return false;
}

function progress() {
  var total = 0;
  var done = 0;
  allItems().forEach(function (group) {
    group.items.forEach(function (item) {
      total += 1;
      if (isTodoDone(item)) done += 1;
    });
  });
  return { total: total, done: done };
}

function openReplies() {
  return (state.data.needsReply || []).filter(function (item) {
    return !isInboxDone(inboxId(item));
  }).length;
}

function visibleNeeds() {
  return (state.data.needsReply || []).filter(function (item) {
    return !isInboxDone(inboxId(item));
  });
}

function visibleFyi() {
  return (state.data.fyi || []).filter(function (item) {
    return !isInboxDone(inboxId(item));
  });
}

function hiddenCount() {
  return (state.data.needsReply || []).concat(state.data.fyi || []).filter(function (item) {
    return isInboxDone(inboxId(item));
  }).length;
}

function greeting() {
  var hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

function fmtHour(h) {
  var hh = Math.floor(h);
  var mm = Math.round((h - hh) * 60);
  var ap = hh >= 12 ? "PM" : "AM";
  var h12 = hh % 12 === 0 ? 12 : hh % 12;
  return { t: h12 + ":" + (mm < 10 ? "0" : "") + mm, ap: ap };
}

function fmtRange(start, end) {
  var a = fmtHour(start);
  var b = fmtHour(end);
  return a.t + (a.ap === b.ap ? "" : " " + a.ap) + "-" + b.t + " " + b.ap;
}

function localIso(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function displayName(title) {
  return String(title || "").replace(/^\(\d{3}\) \d{3}-\d{4} \((.+)\)$/, "$1");
}

function splitNext(detail) {
  var text = String(detail || "");
  var index = text.indexOf("Next:");
  if (index < 0) return { what: text, next: "" };
  return { what: text.slice(0, index).trim(), next: text.slice(index + 5).trim() };
}

function dayLabel(mmdd) {
  var parts = String(mmdd || "").split("/").map(Number);
  var month = parts[0];
  var day = parts[1];
  var year = Number(String(state.data.DAY_ISO || "").slice(0, 4));
  var date = new Date(year, month - 1, day);
  var weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
  var monthName = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1];
  var today = String(state.data.DAY_ISO || "").slice(5).replace("-", "/").replace(/^0/, "");
  return mmdd === today ? "Today, " + monthName + " " + day : weekday + ", " + monthName + " " + day;
}

function initialOf(name) {
  var ch = String(name || "").replace(/[^A-Za-z0-9]/g, "").charAt(0);
  return (ch || "?").toUpperCase();
}

function tweenNum(node, target, key) {
  target = Math.round(Number(target) || 0);
  if (!node) return;
  var token = (tweenToken[key] || 0) + 1;
  tweenToken[key] = token;
  if (tweenRafs[key]) cancelAnimationFrame(tweenRafs[key]);
  if (reducedMotion() || tweens[key] == null || tweens[key] === target) {
    tweens[key] = target;
    node.textContent = String(target);
    return;
  }
  var from = tweens[key];
  var start = Date.now();
  function step() {
    if (tweenToken[key] !== token) return;
    var p = Math.min(1, (Date.now() - start) / 550);
    var eased = 1 - Math.pow(1 - p, 3);
    var raw = from + (target - from) * eased;
    tweens[key] = raw;
    node.textContent = String(Math.round(raw));
    if (p < 1) tweenRafs[key] = requestAnimationFrame(step);
    else tweens[key] = target;
  }
  tweenRafs[key] = requestAnimationFrame(step);
}

function setBar(fill, pct, delay) {
  if (!fill) return;
  var target = Math.max(0, Math.min(1, pct)) * 100 + "%";
  fill.style.transitionDelay = (delay || 0) + "ms";
  if (!fill.dataset.grew) {
    fill.style.width = "0%";
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        fill.style.width = target;
      });
    });
    fill.dataset.grew = "1";
  } else {
    fill.style.width = target;
  }
}

function chevron(open) {
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "chev" + (open ? " open" : ""));
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 14 14");
  svg.setAttribute("aria-hidden", "true");
  var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M5 2.5 L9.5 7 L5 11.5");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#A2A7AD");
  path.setAttribute("stroke-width", "1.8");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  return svg;
}

function checkSvg(draw) {
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 14 14");
  svg.setAttribute("aria-hidden", "true");
  var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M3 7.4 L5.8 10 L11 4.2");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#ffffff");
  path.setAttribute("stroke-width", "2.2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  if (draw) path.setAttribute("class", "draw");
  svg.appendChild(path);
  return svg;
}

function circleEl(on, pop) {
  var span = el("span", { class: "circle" + (on ? " on" : "") + (pop ? " pop" : "") });
  if (on) span.appendChild(checkSvg(!!pop));
  return span;
}

function burstEl() {
  var root = el("span", { class: "burst", "aria-hidden": "true" });
  root.appendChild(el("span", { class: "ring" }));
  for (var i = 0; i < 8; i++) {
    var angle = (i / 8) * Math.PI * 2;
    var dot = el("i");
    dot.style.background = i % 2 ? "#00C805" : "#7BE07F";
    dot.style.setProperty("--dx", Math.cos(angle) * 24 + "px");
    dot.style.setProperty("--dy", Math.sin(angle) * 24 + "px");
    root.appendChild(dot);
  }
  return root;
}

function barEl(pct, heightClass, color, delay) {
  var wrap = el("div", { class: "bar " + heightClass });
  var fill = el("div", { class: "bar-fill" });
  if (color) fill.style.background = color;
  wrap.appendChild(fill);
  setBar(fill, pct, delay);
  return wrap;
}

function sectionHead(title, right, rightId) {
  var row = el("div", { class: "section-head" });
  row.appendChild(el("h2", { text: title }));
  if (right != null) {
    var side = el("div", { class: "section-right num", text: String(right) });
    if (rightId) side.id = rightId;
    row.appendChild(side);
  }
  return row;
}

function anchor(href, label, className) {
  var plan = BenjiLinks.plan(href);
  var link = el("a", { class: className, href: plan.kind === "sms" ? plan.href : plan.web || plan.href });
  link.appendChild(document.createTextNode(label));
  if (plan.kind !== "sms") {
    link.target = "_blank";
    link.rel = "noopener";
  }
  return link;
}

function sourceLink(src) {
  var wrap = el("div", { class: "src-row" });
  var link = anchor(src.href, src.label, "pill");
  link.appendChild(el("span", { "aria-hidden": "true", text: "›" }));
  wrap.appendChild(link);
  return wrap;
}

function openNativeThenWeb(native, web) {
  var cancelled = false;
  function cancel() {
    cancelled = true;
  }
  function onVis() {
    if (document.hidden) cancel();
  }
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pagehide", cancel, { once: true });
  try {
    window.location.href = native;
  } catch (err) {
    /* fall through to the web link */
  }
  window.clearTimeout(nativeTimer);
  nativeTimer = window.setTimeout(function () {
    document.removeEventListener("visibilitychange", onVis);
    if (cancelled || document.hidden) return;
    window.location.href = web;
  }, 1200);
}

function record(ev) {
  if (!remember(ev)) return false;
  queueEvent(ev);
  return true;
}

function maybeCheerTodo(before, after) {
  if (!before.total) return;
  var prev = before.done / before.total;
  var next = after.total ? after.done / after.total : 0;
  if (next >= 1 && prev < 1) celebrate("All done", "Every to-do checked off.");
  else if (next >= 0.5 && prev < 0.5) celebrate("Halfway there", after.done + " of " + after.total + " done");
}

function celebrate(title, sub) {
  var root = document.getElementById("cheer");
  root.textContent = "";
  root.hidden = false;
  var layer = el("div", { class: "cheer", "aria-live": "polite" });
  if (!reducedMotion()) {
    var colors = ["#00C805", "#111214", "#C9CDD2", "#00C805", "#7BE07F"];
    for (var i = 0; i < 34; i++) {
      var piece = el("span", { class: "confetti" });
      piece.style.left = ((i * 37 + 7) % 100) + "%";
      piece.style.width = (i % 3 ? 6 : 8) + "px";
      piece.style.height = (i % 3 ? 10 : 6) + "px";
      piece.style.background = colors[i % colors.length];
      piece.style.animationDuration = 1300 + (i % 5) * 160 + "ms";
      piece.style.animationDelay = (i % 7) * 45 + "ms";
      piece.style.setProperty("--dx", ((i % 9) - 4) * 14 + "px");
      piece.style.setProperty("--r", (i % 2 ? 1 : -1) * (200 + (i % 4) * 90) + "deg");
      layer.appendChild(piece);
    }
  }
  var toast = el("div", { class: "toast" });
  toast.appendChild(el("div", { class: "toast-title", text: title }));
  toast.appendChild(el("div", { class: "toast-sub", text: sub }));
  layer.appendChild(toast);
  root.appendChild(layer);
  window.clearTimeout(celebrate.timer);
  celebrate.timer = window.setTimeout(function () {
    root.textContent = "";
    root.hidden = true;
  }, 2500);
}

function requestRender() {
  patchChrome();
  if (state.animating > 0) return;
  renderPanel();
}

function patchChrome() {
  if (!state.data) return;
  renderHero();
  renderTabs();
  patchLists();
}

function patchLists() {
  var counts = progress();
  var open = counts.total - counts.done;
  var openNode = document.getElementById("open-count");
  if (openNode) openNode.textContent = open + " open";
  allItems().forEach(function (group) {
    var sec = document.querySelector('[data-group="' + cssEscape(group.name) + '"]');
    if (!sec) return;
    var done = group.items.filter(isTodoDone).length;
    var count = sec.querySelector(".group-count");
    if (count) count.textContent = done + "/" + group.items.length;
    var all = sec.querySelector(".all-done");
    if (all) all.hidden = !(group.items.length && done === group.items.length);
    setBar(sec.querySelector(".bar-fill"), group.items.length ? done / group.items.length : 0);
  });
  var replies = openReplies();
  var inboxNum = document.getElementById("inbox-num");
  if (inboxNum) tweenNum(inboxNum, replies, "inbox");
  var inboxLabel = document.getElementById("inbox-label");
  if (inboxLabel) inboxLabel.textContent = replies === 0 ? "Inbox zero" : "need a reply";
  var inboxSub = document.getElementById("inbox-sub");
  if (inboxSub) inboxSub.textContent = visibleFyi().length + " FYI · " + (state.data.skipped.count || "") + " skipped";
  var needsCount = document.getElementById("needs-count");
  if (needsCount) needsCount.textContent = String(visibleNeeds().length);
  var fyiCount = document.getElementById("fyi-count");
  if (fyiCount) fyiCount.textContent = String(visibleFyi().length);
}

function renderHero() {
  var hero = document.getElementById("hero");
  if (!hero.dataset.built) {
    hero.dataset.built = "1";
    hero.appendChild(el("div", { class: "greet", id: "greet" }));
    var line = el("div", { class: "hero-line" });
    line.appendChild(el("span", { class: "hero-num num", id: "hero-num" }));
    line.appendChild(el("span", { class: "hero-unit", text: "to-dos left" }));
    hero.appendChild(line);
    hero.appendChild(el("div", { class: "hero-pct num", id: "hero-pct" }));
    var bar = el("div", { class: "bar h5", id: "hero-bar" });
    bar.appendChild(el("div", { class: "bar-fill", id: "hero-bar-fill" }));
    hero.appendChild(bar);
    var stats = el("div", { class: "stats" });
    stats.appendChild(statButton("stat-replies", "need a reply", "inbox"));
    stats.appendChild(statButton("stat-cal", "on the calendar", "todo"));
    stats.appendChild(statButton("stat-spend", "spent this week", "money"));
    hero.appendChild(stats);
    hero.appendChild(el("div", { class: "updated", id: "updated" }));
  }
  var counts = progress();
  var replies = openReplies();
  var pct = counts.total ? counts.done / counts.total : 0;
  document.getElementById("greet").textContent = greeting() + ", Benji";
  tweenNum(document.getElementById("hero-num"), counts.total - counts.done, "hero");
  document.getElementById("hero-pct").textContent = counts.done + " of " + counts.total + " done · " + Math.round(pct * 100) + "%";
  setBar(document.getElementById("hero-bar-fill"), pct);
  document.getElementById("stat-replies").textContent = String(replies);
  document.getElementById("stat-cal").textContent = String((state.data.schedule || []).length);
  document.getElementById("stat-spend").textContent = (state.data.spend && state.data.spend.total) || "";
  document.getElementById("stat-btn-replies").setAttribute("aria-label", replies + " need a reply");
  document.getElementById("stat-btn-cal").setAttribute("aria-label", (state.data.schedule || []).length + " on the calendar");
  document.getElementById("stat-btn-spend").setAttribute("aria-label", ((state.data.spend && state.data.spend.total) || "") + " spent this week");
  document.getElementById("updated").textContent = (state.data.DATE_LABEL || "") + " · Updated " + (state.data.UPDATED || "");
}

function statButton(id, label, tab) {
  var button = el("button", { class: "stat", id: "stat-btn-" + id.replace("stat-", "") });
  button.appendChild(el("b", { class: "num", id: id }));
  button.appendChild(el("span", { text: label }));
  button.addEventListener("click", function () {
    setTab(tab);
  });
  return button;
}

function renderTabs() {
  var nav = document.getElementById("tabs");
  var counts = progress();
  var replies = openReplies();
  var countFor = { todo: counts.total - counts.done, inbox: replies, money: null };
  if (!nav.dataset.built) {
    nav.dataset.built = "1";
    var bar = el("div", { class: "tabbar", role: "tablist" });
    TABS.forEach(function (tab) {
      var button = el("button", {
        class: "tab",
        role: "tab",
        id: "tab-" + tab.value,
        "aria-controls": "panel",
      });
      button.appendChild(document.createTextNode(tab.label));
      button.appendChild(el("span", { class: "count num", id: "tab-count-" + tab.value }));
      button.addEventListener("click", function () {
        setTab(tab.value);
      });
      bar.appendChild(button);
    });
    var indicator = el("div", { class: "indicator", id: "tab-indicator" });
    indicator.appendChild(el("i"));
    bar.appendChild(indicator);
    nav.appendChild(bar);
  }
  TABS.forEach(function (tab, index) {
    var button = document.getElementById("tab-" + tab.value);
    var on = state.tab === tab.value;
    button.setAttribute("aria-selected", on ? "true" : "false");
    var count = document.getElementById("tab-count-" + tab.value);
    if (countFor[tab.value] == null) count.hidden = true;
    else {
      count.hidden = false;
      count.textContent = String(countFor[tab.value]);
    }
    if (on) document.getElementById("tab-indicator").style.left = (index * 100) / TABS.length + "%";
  });
}

function setTab(tab) {
  animGen += 1;
  state.animating = 0;
  state.ui.leaving = {};
  busyIds = {};
  state.tab = tab;
  renderTabs();
  renderPanel();
  var panel = document.getElementById("panel");
  panel.classList.remove("rise");
  void panel.offsetWidth;
  panel.classList.add("rise");
}

function renderPanel() {
  var panel = document.getElementById("panel");
  panel.textContent = "";
  if (!state.data) return;
  if (state.tab === "todo") renderTodo(panel);
  else if (state.tab === "inbox") renderInbox(panel);
  else renderMoney(panel);
}

function renderTimeline(host) {
  host.textContent = "";
  var schedule = state.data.schedule || [];
  if (!schedule.length) return;
  host.appendChild(sectionHead("Today", schedule.length + " events"));
  var nowDate = new Date();
  var iso = localIso(nowDate);
  var day = state.data.DAY_ISO || "";
  var rel = iso < day ? -1 : iso > day ? 1 : 0;
  var now = nowDate.getHours() + nowDate.getMinutes() / 60;
  var hi = rel < 0 ? 0 : rel > 0 ? -1 : schedule.findIndex(function (slot) { return slot.end > now; });
  var liveIdx = rel === 0 ? schedule.findIndex(function (slot) { return now >= slot.start && now < slot.end; }) : -1;
  schedule.forEach(function (slot, index) {
    var time = fmtHour(slot.start);
    var past = rel > 0 || (rel === 0 && now >= slot.end);
    var isHi = index === hi;
    var live = index === liveIdx;
    if (index > 0) {
      var hair = el("div", { class: "hair" });
      hair.style.marginLeft = "76px";
      host.appendChild(hair);
    }
    var row = el("div", { class: "slot" + (past ? " past" : "") + (isHi ? " hi" : "") });
    var clock = el("div", { class: "slot-time num" });
    clock.appendChild(el("b", { text: time.t }));
    clock.appendChild(el("span", { text: time.ap }));
    var copy = el("div", { style: "flex:1;min-width:0" });
    copy.appendChild(el("div", { class: "slot-title", text: slot.title }));
    copy.appendChild(el("div", { class: "slot-range", text: fmtRange(slot.start, slot.end) }));
    row.appendChild(clock);
    row.appendChild(copy);
    if (isHi) {
      var badge = el("span", { class: "badge" });
      badge.appendChild(el("span", { class: "dot" + (live ? " live" : "") }));
      badge.appendChild(document.createTextNode(live ? "Now" : "Up next"));
      row.appendChild(badge);
    }
    host.appendChild(row);
  });
}

function renderTodo(panel) {
  var timeline = el("div", { id: "timeline" });
  panel.appendChild(timeline);
  renderTimeline(timeline);
  var counts = progress();
  panel.appendChild(sectionHead("To-dos", counts.total - counts.done + " open", "open-count"));
  panel.appendChild(el("p", { class: "hint", text: "Tap the circle to check one off. Finished items move to Done at the bottom of each group." }));
  var index = 0;
  allItems().forEach(function (group) {
    if (!group.items.length) return;
    panel.appendChild(groupCard(group, index));
    index += 1;
  });
}

function groupCard(group, index) {
  var open = state.ui.openGroups[group.name] !== false;
  var doneItems = group.items.filter(function (item) {
    return isTodoDone(item) && !state.ui.leaving[item.id];
  });
  var openItems = group.items.filter(function (item) {
    return !isTodoDone(item) || state.ui.leaving[item.id];
  });
  var done = group.items.filter(isTodoDone).length;
  var all = group.items.length > 0 && done === group.items.length;
  var sec = el("section", { class: "group", "data-group": group.name });
  sec.style.animationDelay = index * 50 + "ms";
  var head = el("button", { class: "group-head", "aria-expanded": open ? "true" : "false" });
  var top = el("span", { class: "group-top" });
  top.appendChild(el("span", { class: "group-name", text: group.name }));
  var allDone = el("span", { class: "all-done", text: "All done" });
  allDone.hidden = !all;
  top.appendChild(allDone);
  top.appendChild(el("span", { class: "group-count num", text: done + "/" + group.items.length }));
  top.appendChild(chevron(open));
  head.appendChild(top);
  var barHost = el("span", { class: "group-bar" });
  barHost.appendChild(barEl(group.items.length ? done / group.items.length : 0, "h3", "", index * 60));
  head.appendChild(barHost);
  head.addEventListener("click", function () {
    state.ui.openGroups[group.name] = !open;
    renderPanel();
  });
  sec.appendChild(head);
  if (!open) return sec;
  var body = el("div", { class: "rise-in" });
  openItems.forEach(function (item, itemIndex) {
    body.appendChild(todoRow(item, isTodoDone(item), itemIndex === 0));
  });
  if (doneItems.length) {
    if (openItems.length) body.appendChild(el("div", { class: "hair" }));
    var show = !!state.ui.showDone[group.name];
    var toggle = el("button", {
      class: "done-toggle",
      "aria-expanded": show ? "true" : "false",
      "aria-label": (show ? "Hide " : "Show ") + doneItems.length + " done in " + group.name,
    });
    toggle.appendChild(el("span", { text: "Done (" + doneItems.length + ")" }));
    toggle.appendChild(chevron(show));
    toggle.addEventListener("click", function () {
      state.ui.showDone[group.name] = !show;
      renderPanel();
    });
    body.appendChild(toggle);
    if (show) {
      doneItems.forEach(function (item) {
        var wrap = todoRow(item, true, false);
        wrap.classList.add("rise-in");
        body.appendChild(wrap);
      });
    }
  }
  sec.appendChild(body);
  return sec;
}

function todoRow(item, on, first) {
  var wrap = el("div", { class: "todo-wrap", "data-id": item.id });
  if (!first) wrap.appendChild(el("div", { class: "hair indent" }));
  var row = el("div", { class: "todo" + (on ? " is-done" : "") });
  var line = el("div", { class: "todo-line" });
  var check = el("button", {
    class: "check",
    "aria-label": (on ? "Uncheck " : "Check ") + item.text,
    "aria-pressed": on ? "true" : "false",
  });
  var slot = el("span", { class: "check-slot" });
  slot.appendChild(circleEl(on, false));
  check.appendChild(slot);
  check.addEventListener("click", function () {
    toggleTodo(item, on);
  });
  var main = el("button", {
    class: "todo-main",
    "aria-expanded": item.src ? (state.ui.expanded[item.id] ? "true" : "false") : null,
    "aria-label": item.src ? item.text + ", show source" : (on ? "Uncheck " : "Check ") + item.text,
  });
  var copy = el("span", { class: "todo-copy" });
  copy.appendChild(el("span", { class: "todo-text", text: item.text }));
  if (item.waiting || item.meta) {
    var meta = el("span", { class: "todo-meta" });
    if (item.waiting) meta.appendChild(el("span", { class: "wait", text: "Waiting on you" }));
    if (item.waiting && item.meta) meta.appendChild(el("span", { "aria-hidden": "true", text: "·" }));
    if (item.meta) meta.appendChild(el("span", { text: item.meta }));
    copy.appendChild(meta);
  }
  main.appendChild(copy);
  if (item.src) main.appendChild(chevron(!!state.ui.expanded[item.id]));
  main.addEventListener("click", function () {
    if (item.src) {
      state.ui.expanded[item.id] = !state.ui.expanded[item.id];
      renderPanel();
    } else {
      toggleTodo(item, on);
    }
  });
  line.appendChild(check);
  line.appendChild(main);
  row.appendChild(line);
  if (item.src && state.ui.expanded[item.id]) row.appendChild(sourceLink(item.src));
  wrap.appendChild(row);
  return wrap;
}

function markRowDone(id) {
  var wrap = document.querySelector('[data-id="' + cssEscape(id) + '"]');
  if (!wrap) return null;
  wrap.style.pointerEvents = "none";
  var todo = wrap.querySelector(".todo");
  if (todo) todo.classList.add("is-done");
  var slot = wrap.querySelector(".check-slot");
  if (slot) {
    slot.textContent = "";
    slot.appendChild(circleEl(true, true));
    slot.appendChild(burstEl());
  }
  var check = wrap.querySelector(".check");
  if (check) check.setAttribute("aria-pressed", "true");
  return wrap;
}

function toggleTodo(item, currentlyOn) {
  if (busyIds[item.id]) return;
  var next = !currentlyOn;
  var before = progress();
  var ev = { type: "todo", id: item.id, text: item.text, done: next, at: new Date().toISOString() };
  if (!record(ev)) {
    requestRender();
    return;
  }
  var after = progress();
  maybeCheerTodo(before, after);
  if (next) {
    busyIds[item.id] = true;
    state.ui.leaving[item.id] = true;
    var row = markRowDone(item.id);
    patchChrome();
    var gen = animGen;
    state.animating += 1;
    window.setTimeout(function () {
      if (gen !== animGen) return;
      if (row) row.classList.add("is-out");
    }, reducedMotion() ? 0 : 200);
    window.setTimeout(function () {
      if (gen !== animGen) return;
      delete state.ui.leaving[item.id];
      delete busyIds[item.id];
      state.animating = Math.max(0, state.animating - 1);
      renderPanel();
      patchChrome();
    }, reducedMotion() ? 0 : 620);
  } else {
    delete state.ui.leaving[item.id];
    renderPanel();
    patchChrome();
  }
}

function replyHref(item) {
  if (item.lead === "Text") {
    if (item.group) return "sms:";
    return item.sms ? "sms:" + item.sms : "";
  }
  var account = (state.data.gmail || {})[item.lead];
  if (!account || !account.email) return "";
  return "https://mail.google.com/mail/u/?authuser=" + encodeURIComponent(account.email) + "#inbox";
}

function replyLabel(item, needs) {
  if (item.lead === "Text") return needs ? "Reply in Messages" : "Open Messages";
  var account = (state.data.gmail || {})[item.lead];
  return account ? "Open " + account.name + " Gmail" : "Open";
}

function renderInbox(panel) {
  var needs = visibleNeeds();
  var fyi = visibleFyi();
  var hero = el("div", { class: "inbox-hero" });
  var row = el("div", { class: "big-row" });
  row.appendChild(el("span", { class: "big num", id: "inbox-num" }));
  row.appendChild(el("span", { class: "unit", id: "inbox-label", text: needs.length === 0 ? "Inbox zero" : "need a reply" }));
  hero.appendChild(row);
  hero.appendChild(el("div", {
    class: "subline",
    id: "inbox-sub",
    text: fyi.length + " FYI · " + (state.data.skipped.count || "") + " skipped",
  }));
  panel.appendChild(hero);
  window.requestAnimationFrame(function () {
    tweenNum(document.getElementById("inbox-num"), needs.length, "inbox");
  });
  if (needs.length) {
    panel.appendChild(sectionHead("Needs a reply", String(needs.length), "needs-count"));
    needs.forEach(function (item, index) {
      panel.appendChild(inboxCard(item, true, index === 0));
    });
  }
  if (fyi.length) {
    panel.appendChild(sectionHead("FYI", String(fyi.length), "fyi-count"));
    fyi.forEach(function (item, index) {
      panel.appendChild(inboxCard(item, false, index === 0));
    });
  }
  var block = el("div", { class: "block" });
  var skipped = el("button", {
    class: "block-row",
    "aria-expanded": state.ui.showSkipped ? "true" : "false",
  });
  skipped.appendChild(el("span", { class: "label", text: "Skipped" }));
  skipped.appendChild(el("span", { class: "num", text: state.data.skipped.count || "" }));
  skipped.appendChild(chevron(state.ui.showSkipped));
  skipped.addEventListener("click", function () {
    state.ui.showSkipped = !state.ui.showSkipped;
    renderPanel();
  });
  block.appendChild(skipped);
  if (state.ui.showSkipped) block.appendChild(el("div", { class: "skipped-detail", text: state.data.skipped.detail || "" }));
  var hidden = hiddenCount();
  if (hidden) {
    var again = el("button", { class: "show-again" });
    again.appendChild(el("span", { class: "label", text: hidden + " marked done" }));
    again.appendChild(el("span", { class: "go", text: "Show again" }));
    again.addEventListener("click", unhideAll);
    block.appendChild(again);
  }
  panel.appendChild(block);
}

function inboxCard(item, needs, first) {
  var id = inboxId(item);
  var open = state.ui.openInbox === id;
  var name = displayName(item.title);
  var parts = splitNext(item.detail);
  var card = el("div", { class: "inbox-card", "data-inbox": id });
  if (!first) card.appendChild(el("div", { class: "hair inbox" }));
  var button = el("button", {
    class: "person" + (open ? " open" : ""),
    "aria-expanded": open ? "true" : "false",
    "aria-label": name + ", " + item.lead + ", " + item.meta,
  });
  button.appendChild(el("span", { class: "avatar", text: initialOf(name) }));
  var copy = el("span", { class: "person-copy" });
  var top = el("span", { class: "person-top" });
  top.appendChild(el("span", { class: "person-name", text: name }));
  top.appendChild(el("span", { class: "when", text: item.meta }));
  copy.appendChild(top);
  copy.appendChild(el("span", { class: "lead", text: item.lead }));
  copy.appendChild(el("span", { class: "what", text: parts.what }));
  button.appendChild(copy);
  button.addEventListener("click", function () {
    state.ui.openInbox = open ? null : id;
    renderPanel();
  });
  card.appendChild(button);
  if (open) {
    var extra = el("div", { class: "expand" });
    if (parts.next) {
      var next = el("div", { class: "next" });
      next.appendChild(el("div", { class: "next-k", text: "Next step" }));
      next.appendChild(el("div", { class: "next-v", text: parts.next }));
      extra.appendChild(next);
    }
    var actions = el("div", { class: "actions" });
    var href = replyHref(item);
    if (href) actions.appendChild(anchor(href, replyLabel(item, needs), "pill" + (needs ? " grow" : " gray grow")));
    var done = el("button", { class: "press gray small", "aria-label": "Mark " + name + " done" });
    done.appendChild(miniCheck());
    done.appendChild(document.createTextNode("Done"));
    done.addEventListener("click", function () {
      markInboxDone(item, card);
    });
    actions.appendChild(done);
    extra.appendChild(actions);
    card.appendChild(extra);
  }
  return card;
}

function miniCheck() {
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 14 14");
  svg.setAttribute("aria-hidden", "true");
  var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M3 7.4 L5.8 10 L11 4.2");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#111214");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  return svg;
}

function markInboxDone(item, card) {
  var before = openReplies();
  var ev = { type: "inbox", id: inboxId(item), text: item.title, done: true, at: new Date().toISOString() };
  if (!record(ev)) {
    requestRender();
    return;
  }
  if (before > 0 && openReplies() === 0 && (state.data.needsReply || []).some(function (row) { return inboxId(row) === ev.id; })) {
    celebrate("Inbox zero", "Nothing waiting on a reply.");
  }
  state.ui.openInbox = null;
  if (card) {
    card.classList.add("is-out");
    card.style.pointerEvents = "none";
  }
  patchChrome();
  var gen = animGen;
  state.animating += 1;
  window.setTimeout(function () {
    if (gen !== animGen) return;
    state.animating = Math.max(0, state.animating - 1);
    renderPanel();
    patchChrome();
  }, reducedMotion() ? 0 : 360);
}

function unhideAll() {
  (state.data.needsReply || []).concat(state.data.fyi || []).forEach(function (item) {
    var id = inboxId(item);
    if (!isInboxDone(id)) return;
    record({ type: "inbox", id: id, text: item.title, done: false, at: new Date().toISOString() });
  });
  requestRender();
}

function renderMoney(panel) {
  var spend = state.data.spend || {};
  var purchases = state.data.purchases || [];
  var pendingCount = purchases.filter(function (row) { return row.pending; }).length;
  var hero = el("div", { class: "money-hero" });
  hero.appendChild(el("div", { class: "label", text: "Spent this week" }));
  hero.appendChild(el("div", { class: "big num", text: spend.total || "" }));
  hero.appendChild(el("div", { class: "period", text: spend.period || "" }));
  var tiles = el("div", { class: "stats" });
  var purchasesTile = el("div", { class: "stat" });
  purchasesTile.appendChild(el("b", { text: spend.count || "" }));
  purchasesTile.appendChild(el("span", { text: pendingCount + " pending" }));
  var refunds = el("div", { class: "stat" });
  refunds.appendChild(el("b", { class: "num plus", text: "+" + (spend.refunds || "") }));
  refunds.appendChild(el("span", { text: "Refunds: " + (spend.refundsDetail || "") }));
  tiles.appendChild(purchasesTile);
  tiles.appendChild(refunds);
  hero.appendChild(tiles);
  panel.appendChild(hero);

  panel.appendChild(sectionHead("Where it went"));
  var accounts = state.data.byAccount || [];
  var max = 1;
  accounts.forEach(function (account) {
    if (Number(account.value) > max) max = Number(account.value);
  });
  accounts.forEach(function (account, index) {
    var row = el("div", { class: "account" });
    var top = el("div", { class: "account-top" });
    top.appendChild(el("span", { text: account.label }));
    top.appendChild(el("b", { class: "num", text: account.display }));
    row.appendChild(top);
    row.appendChild(barEl(Number(account.value) / max, "h6", index === 0 ? "#00C805" : "#7BE07F", index * 70));
    panel.appendChild(row);
  });

  panel.appendChild(sectionHead("Transactions", String(purchases.length)));
  var dates = [];
  purchases.forEach(function (purchase) {
    if (dates.indexOf(purchase.lead) < 0) dates.push(purchase.lead);
  });
  dates.forEach(function (date) {
    var group = el("div", { class: "day-group" });
    group.appendChild(el("div", { class: "date-h", text: dayLabel(date) }));
    var rows = [];
    purchases.forEach(function (purchase, index) {
      if (purchase.lead === date) rows.push({ purchase: purchase, index: index });
    });
    rows.forEach(function (entry, index) {
      if (index > 0) group.appendChild(el("div", { class: "hair" }));
      var key = entry.index + "|" + entry.purchase.lead + "|" + entry.purchase.title + "|" + entry.purchase.meta;
      var isOpen = state.ui.openPurchase === key;
      var button = el("button", { class: "tx", "aria-expanded": isOpen ? "true" : "false" });
      var copy = el("span", { class: "tx-copy" });
      copy.appendChild(el("span", { class: "tx-title", text: entry.purchase.title }));
      copy.appendChild(el("span", {
        class: "tx-meta",
        text: entry.purchase.detail + (entry.purchase.pending ? " · Pending" : ""),
      }));
      button.appendChild(copy);
      button.appendChild(el("span", { class: "tx-amt num", text: entry.purchase.meta }));
      button.addEventListener("click", function () {
        state.ui.openPurchase = isOpen ? null : key;
        renderPanel();
      });
      group.appendChild(button);
      if (isOpen) {
        var detail = el("div", { class: "detail" });
        [
          ["Date", dayLabel(entry.purchase.lead)],
          ["Account", entry.purchase.detail],
          ["Status", entry.purchase.pending ? "Pending" : "Posted"],
          ["Amount", entry.purchase.meta],
        ].forEach(function (pair) {
          detail.appendChild(el("span", { class: "k", text: pair[0] }));
          detail.appendChild(el("span", { text: pair[1] }));
        });
        group.appendChild(detail);
      }
    });
    panel.appendChild(group);
  });
  if (spend.note) panel.appendChild(el("div", { class: "note", text: spend.note }));

  var openBal = !!state.ui.showBal;
  var balances = el("div", { class: "balances" });
  var balBtn = el("button", { class: "balances-btn", "aria-expanded": openBal ? "true" : "false" });
  balBtn.appendChild(el("span", { class: "label", text: "Balances" }));
  balBtn.appendChild(el("span", { class: "side", text: openBal ? "Hide" : "Show" }));
  balBtn.appendChild(chevron(openBal));
  balBtn.addEventListener("click", function () {
    state.ui.showBal = !openBal;
    renderPanel();
  });
  balances.appendChild(balBtn);
  if (openBal) {
    var body = el("div", { class: "rise-in" });
    body.appendChild(el("div", { class: "bal-k", text: "Cash and investments" }));
    balanceRows(state.data.cash || []).forEach(function (row) { body.appendChild(row); });
    body.appendChild(el("div", { class: "bal-k owed", text: "Owed" }));
    balanceRows(state.data.owed || []).forEach(function (row) { body.appendChild(row); });
    balances.appendChild(body);
  }
  panel.appendChild(balances);
  if (spend.footnote) panel.appendChild(el("div", { class: "note pad", text: spend.footnote }));
}

function balanceRows(rows) {
  var nodes = [];
  rows.forEach(function (row, index) {
    if (index > 0) nodes.push(el("div", { class: "hair" }));
    var line = el("div", { class: "bal" });
    var copy = el("div", { class: "copy" });
    copy.appendChild(el("div", { class: "t", text: row.title }));
    if (row.detail) copy.appendChild(el("div", { class: "d", text: row.detail }));
    line.appendChild(copy);
    line.appendChild(el("span", { class: "m num", text: row.meta }));
    nodes.push(line);
  });
  return nodes;
}

function setBusy(busy) {
  var button = document.getElementById("unlock");
  var input = document.getElementById("pass");
  button.disabled = busy;
  input.disabled = busy;
  button.textContent = busy ? "Checking…" : "Continue";
}

function showGate(message) {
  document.documentElement.classList.remove("demo-boot");
  document.getElementById("main").hidden = true;
  document.getElementById("gate").hidden = false;
  document.getElementById("sheet").hidden = true;
  document.getElementById("gate-error").textContent = message || "";
  setBusy(false);
}

function showApp() {
  document.getElementById("gate").hidden = true;
  document.getElementById("main").hidden = false;
  document.getElementById("demo-note").hidden = !state.demo;
  var lockBtn = document.getElementById("lock-btn");
  lockBtn.textContent = state.demo ? "Leave demo" : "Lock";
  if (state.demo) setSync("Sample data stays on this device. Sync is off.");
  else setSync(state.sync || "Saved on this device");
  patchChrome();
  renderPanel();
  document.getElementById("panel").classList.add("rise");
  if (!state.demo) {
    pump();
    pollNtfy();
  }
}

function resetChrome() {
  var hero = document.getElementById("hero");
  var tabs = document.getElementById("tabs");
  hero.textContent = "";
  delete hero.dataset.built;
  tabs.textContent = "";
  delete tabs.dataset.built;
  document.getElementById("panel").textContent = "";
  tweens = {};
}

function lockApp() {
  animGen += 1;
  state.animating = 0;
  busyIds = {};
  state.passcode = null;
  state.topic = null;
  state.data = null;
  try {
    localStorage.removeItem(PASS_KEY);
  } catch (err) {
    /* ignore */
  }
  closeSheet();
  resetChrome();
  showGate("");
  document.getElementById("pass").value = "";
  document.getElementById("pass").focus();
}

function openSheet() {
  document.getElementById("sync-note").textContent = state.sync;
  document.getElementById("sheet").hidden = false;
  document.getElementById("lock-btn").focus();
}

function closeSheet() {
  document.getElementById("sheet").hidden = true;
}

function unlock(pass) {
  setBusy(true);
  document.getElementById("gate-error").textContent = "";
  return loadJSON("data.enc.json")
    .then(function (env) {
      return BenjiCrypto.decryptJSON(pass, env);
    })
    .then(function (data) {
      state.data = normalize(data);
      state.passcode = pass;
      try {
        localStorage.setItem(PASS_KEY, pass);
      } catch (err) {
        /* the session still unlocks */
      }
      return BenjiCrypto.topicFromPasscode(pass);
    })
    .then(function (topic) {
      state.topic = topic;
      document.getElementById("pass").value = "";
      showApp();
    })
    .catch(function (err) {
      var message = explain(err);
      if (!message) {
        state.passcode = null;
        try {
          localStorage.removeItem(PASS_KEY);
        } catch (ignore) {
          /* ignore */
        }
        showGate("That passcode didn't work.");
        return;
      }
      showGate(message);
    });
}

function refreshData() {
  if (state.demo || !state.passcode) return;
  var pass = state.passcode;
  loadJSON("data.enc.json")
    .then(function (env) {
      return BenjiCrypto.decryptJSON(pass, env);
    })
    .then(function (data) {
      if (state.passcode !== pass) return;
      state.data = normalize(data);
      requestRender();
    })
    .catch(function () {
      /* keep the day that's already on screen */
    });
}

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch(function () {});
}

function bind() {
  document.getElementById("gate-form").addEventListener("submit", function (event) {
    event.preventDefault();
    if (state.demo) return;
    var pass = document.getElementById("pass").value;
    if (!pass) {
      document.getElementById("gate-error").textContent = "Enter your passcode";
      return;
    }
    if (!window.isSecureContext) {
      document.getElementById("gate-error").textContent = "Open this page over https to unlock.";
      return;
    }
    unlock(pass);
  });
  document.getElementById("pass").addEventListener("input", function () {
    document.getElementById("gate-error").textContent = "";
  });
  document.getElementById("settings-btn").addEventListener("click", openSheet);
  document.getElementById("sheet-close").addEventListener("click", closeSheet);
  document.getElementById("sheet-backdrop").addEventListener("click", closeSheet);
  document.getElementById("lock-btn").addEventListener("click", function () {
    if (state.demo) location.href = location.pathname;
    else lockApp();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeSheet();
  });
  document.addEventListener("click", function (event) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = event.target && event.target.closest ? event.target.closest("a") : null;
    if (!link) return;
    var plan = BenjiLinks.plan(link.getAttribute("href") || "");
    if (plan.kind !== "gmail") return;
    event.preventDefault();
    openNativeThenWeb(plan.native, plan.web);
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden || !state.data || state.demo) return;
    refreshData();
    pollNtfy();
    flushOutbox();
  });
  window.addEventListener("online", function () {
    pump();
    flushOutbox();
    pollNtfy();
  });
  window.setInterval(function () {
    var greet = document.getElementById("greet");
    if (greet && state.data) greet.textContent = greeting() + ", Benji";
    var timeline = document.getElementById("timeline");
    if (timeline && state.tab === "todo" && state.data) renderTimeline(timeline);
  }, 60000);
}

function boot() {
  state.demo = new URLSearchParams(location.search).get("demo") === "1";
  loadEvents();
  if (!state.demo) {
    loadPending();
    loadOutbox();
  }
  bind();
  registerSW();
  try {
    document.documentElement.style.background = "#ffffff";
    document.documentElement.style.colorScheme = "light";
    document.body.style.background = "#ffffff";
    document.body.style.colorScheme = "light";
    document.body.style.margin = "0";
  } catch (err) {
    /* ignore */
  }
  if (state.demo) {
    loadJSON("data.sample.json")
      .then(function (data) {
        state.data = normalize(data);
        showApp();
      })
      .catch(function () {
        showGate("Couldn't load the sample data.");
      });
    return;
  }
  if (!window.isSecureContext) {
    showGate("Open this page over https to unlock.");
    return;
  }
  var saved = readPass();
  if (saved) {
    showGate("");
    setBusy(true);
    unlock(saved);
    return;
  }
  showGate("");
}

boot();
