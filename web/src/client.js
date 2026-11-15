import {ConvexClient} from "convex/browser";
import {anyApi} from "convex/server";

const boot = JSON.parse(document.getElementById("boot").textContent);
const app = document.getElementById("app");
const COLORS = [["#FF7AB0","#E9508E"],["#4A6FF5","#2C4FD6"],["#46B566","#2E9149"],["#FFBE2E","#F29A00"],["#FF6440","#E2441F"],["#AE86FF","#8B5EF2"]];
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const LOCK = '<svg width="11" height="14" viewBox="0 0 11 14" aria-hidden="true"><rect x=".5" y="6" width="10" height="7.5" rx="2" fill="currentColor"/><path d="M2.6 6V4.2a2.9 2.9 0 0 1 5.8 0V6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
const MARK = '<svg class="mark" viewBox="-12 -14 330 128" role="img" aria-label="Frolic"><g fill="none" stroke="#23180F" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"><path d="M14 100 V34 C14 14 26 4 46 6"/><path d="M0 48 H60"/><path d="M60 48 V100 M60 72 C62 56 74 48 92 49"/><circle cx="138" cy="74" r="26"/><path d="M190 6 V78 C190 94 198 102 210 102 C222 102 228 94 228 82 V50"/><path d="M300 58 C294 51 287 48 279 48 C264 48 253 60 253 75 C253 90 264 101 279 101 C287 101 294 98 300 91"/></g><circle class="sun" cx="228" cy="14" r="11.5" fill="#FF6A2A"/></svg>';

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const colorOf = name => { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };

function bloom(name, R, stem) {
  const [a, b] = colorOf(name), W = R * 2 + 8, cx = W / 2, cy = R + 4, H = stem ? R * 2 + stem + 4 : W;
  let p = "";
  for (let i = 0; i < 8; i++) p += '<ellipse cx="' + cx + '" cy="' + (cy - R * .56) + '" rx="' + R * .34 + '" ry="' + R * .5 + '" fill="' + b + '" transform="rotate(' + (i * 45 + 22.5) + " " + cx + " " + cy + ')"/>';
  for (let i = 0; i < 8; i++) p += '<ellipse cx="' + cx + '" cy="' + (cy - R * .58) + '" rx="' + R * .3 + '" ry="' + R * .46 + '" fill="' + a + '" transform="rotate(' + i * 45 + " " + cx + " " + cy + ')"/>';
  const st = stem ? '<path d="M' + cx + " " + (cy + R * .4) + " C " + (cx - 3) + " " + (cy + R + stem * .4) + ", " + (cx + 4) + " " + (cy + R + stem * .7) + ", " + cx + " " + H + '" fill="none" stroke="#3E9B52" stroke-width="4" stroke-linecap="round"/>' : "";
  const ini = esc(String(name).trim().charAt(0).toUpperCase() || "F");
  const face = '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R * .5 + 3) + '" fill="#FFF8EC"/><text x="' + cx + '" y="' + (cy + R * .18) + '" text-anchor="middle" font-family="ui-rounded,system-ui" font-weight="800" font-size="' + R * .5 + '" fill="' + b + '">' + ini + "</text>";
  return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true">' + st + p + face + "</svg>";
}
function bud(name, R, stem) {
  const [a, b] = colorOf(name), W = R * 2 + 8, cx = W / 2, H = R * 2 + stem + 4, top = R * .5, bot = R * 2 + 4;
  return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true"><path d="M' + cx + " " + (bot - 4) + " C " + (cx - 3) + " " + (bot + stem * .4) + ", " + (cx + 4) + " " + (bot + stem * .7) + ", " + cx + " " + H + '" fill="none" stroke="#3E9B52" stroke-width="4" stroke-linecap="round"/><path d="M' + cx + " " + (bot + stem * .45) + " C " + (cx - 14) + " " + (bot + stem * .2) + ", " + (cx - 24) + " " + (bot + stem * .28) + ", " + (cx - 26) + " " + (bot + stem * .4) + " C " + (cx - 18) + " " + (bot + stem * .52) + ", " + (cx - 8) + " " + (bot + stem * .52) + ", " + cx + " " + (bot + stem * .45) + 'Z" fill="#4CAF5E"/><path d="M' + cx + " " + top + " C " + (cx + R * .75) + " " + (top + R * .5) + ", " + (cx + R * .7) + " " + (bot - R * .3) + ", " + cx + " " + bot + " C " + (cx - R * .7) + " " + (bot - R * .3) + ", " + (cx - R * .75) + " " + (top + R * .5) + ", " + cx + " " + top + 'Z" fill="' + b + '"/><path d="M' + cx + " " + (top + R * .15) + " C " + (cx + R * .45) + " " + (top + R * .6) + ", " + (cx + R * .35) + " " + (bot - R * .4) + ", " + cx + " " + (bot - R * .1) + " C " + (cx - R * .1) + " " + (bot - R * .5) + ", " + (cx - R * .05) + " " + (top + R * .6) + ", " + cx + " " + (top + R * .15) + 'Z" fill="' + a + '"/><path d="M' + (cx - R * .55) + " " + (bot - R * .55) + " C " + (cx - R * .3) + " " + (bot - R * .05) + ", " + (cx + R * .3) + " " + (bot - R * .05) + ", " + (cx + R * .55) + " " + (bot - R * .55) + " C " + (cx + R * .2) + " " + (bot + R * .05) + ", " + (cx - R * .2) + " " + (bot + R * .05) + ", " + (cx - R * .55) + " " + (bot - R * .55) + 'Z" fill="#4CAF5E"/></svg>';
}
function names(list) { return list.length < 2 ? list.join("") : list.slice(0, -1).join(", ") + " and " + list[list.length - 1]; }

function packet(card) {
  if (!card) return '<div class="packet"><div class="band"><span>&nbsp;</span></div><div class="win skel"></div><div class="pk"><div class="skel" style="height:29px;width:70%"></div><div class="skel" style="height:30px;width:90%;margin-top:12px"></div></div></div>';
  return '<div class="packet"><div class="band"><span>' + esc(card.label) + "</span><i>" + esc(card.no) + '</i></div><div class="win">' + (card.imageUrl ? '<img src="' + esc(card.imageUrl) + '" alt="' + esc(card.title) + '" width="410" height="118" decoding="async">' : "") + '</div><div class="pk"><h1>' + esc(card.title) + '</h1><div class="chips">' + (card.chips || []).map(c => '<span class="chip">' + esc(c) + "</span>").join("") + "</div>" + (card.why ? '<p class="why"><b>Why this:</b> ' + esc(card.why) + "</p>" : "") + "</div></div>";
}

const store = {get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }};
let guest = store.get("frolic.guest");
if (!guest) { guest = crypto.randomUUID(); store.set("frolic.guest", guest); }

const ui = {view: null, offline: !navigator.onLine, name: store.get("frolic.name") || "", busy: false, error: "", flipped: false, subError: false};
let offset = 0;

async function syncClock() {
  try {
    const t0 = Date.now();
    const r = await fetch("/web/clock", {cache: "no-store"});
    const t1 = Date.now();
    const {now} = await r.json();
    offset = now - (t0 + t1) / 2;
  } catch (e) {}
}
const serverNow = () => Date.now() + offset;

function banner() { return ui.offline ? '<div class="banner" role="status">You are offline. Reconnect to say you are down.</div>' : ""; }
function head(v) {
  return '<div class="top">' + MARK + "</div>" + (v && v.host ? '<p class="from">' + esc(v.host) + " shared a plan" + (v.group ? " with " + esc(v.group) : "") + "</p>" : "");
}

function body(v) {
  if (!v) return '<div class="below"><div class="skel" style="height:56px"></div><div class="skel" style="height:54px;border-radius:999px;margin-top:12px"></div></div>';
  if (ui.subError) return '<div class="below"><div class="card center" role="alert"><b style="font-size:17px">Something went wrong</b><p class="sub">We could not load this plan. Your yes, if you sent one, is safe.</p></div><button class="btn" id="retry">Try again</button></div>';
  if (v.phase === "on") {
    const who = names(["You"].concat(v.mates || []).map(n => n === "You" ? "You" : n));
    return '<div class="below"><div class="card center bloomin" role="status"><div class="blooms">' + [guestName(v)].concat(v.mates || []).slice(0, 4).map(n => bloom(n, 26, 0)).join("") + '</div><h1 style="margin-top:6px">It\u2019s on.</h1><p class="sub">' + esc(who) + ", " + esc(v.meet || "") + (v.time ? " at " + esc(v.time) : "") + '.</p></div><a class="btn" style="text-decoration:none" href="' + esc(boot.appUrl) + '">Get Frolic for the next one</a></div>';
  }
  if (v.phase === "planted") return '<div class="below"><div class="card"><div class="row" role="status"><div class="fl bud new" style="flex:none">' + bud(guestName(v), 16, 6) + '</div><div><b>You\u2019re down, ' + esc(guestName(v)) + '</b><small>Only you know. Keep this page open: it blooms the moment someone else says yes.</small></div></div></div><span class="cap">Waiting for a friend<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span></span></div>';
  if (v.phase === "drifted") return '<div class="below"><div class="card center" role="status"><div class="blooms" style="opacity:.55">' + bud(guestName(v), 20, 14) + '</div><h1 style="margin-top:6px">Drifted off.</h1><p class="sub">Nobody else said yes in time, so nobody ever knew you did. Nothing was shared.</p></div><a class="btn sec" style="text-decoration:none" href="' + esc(boot.appUrl) + '">Get Frolic for the next one</a></div>';
  return '<form class="below" id="f" novalidate><label class="sr" for="wn">Your first name</label><input id="wn" class="field" autocomplete="given-name" autocapitalize="words" maxlength="24" placeholder="Your first name" value="' + esc(ui.name) + '"' + (ui.busy ? " disabled" : "") + '><button class="btn" type="submit"' + (ui.busy || ui.offline ? " disabled" : "") + ">" + (ui.busy ? "Planting\u2026" : "I\u2019m down") + "</button>" + (ui.error ? '<p class="err" role="alert">' + esc(ui.error) + "</p>" : "") + '<p class="hush">' + LOCK + " Nobody sees you\u2019re down unless someone else is too. No app needed.</p></form>";
}
function guestName(v) { return v.me || ui.name || "You"; }

function dead(title, text) {
  return banner() + '<div class="top">' + MARK + '</div><div class="below" style="padding-top:60px"><div class="card center" role="status"><div class="blooms" style="opacity:.55">' + bud("x", 20, 14) + "</div><h1 style=\"margin-top:6px\">" + esc(title) + '</h1><p class="sub">' + esc(text) + '</p></div><a class="btn" style="text-decoration:none" href="' + esc(boot.appUrl) + '">Get Frolic</a></div>';
}

function render() {
  const v = ui.view;
  if (v && v.phase === "invalid") { app.innerHTML = dead("This link doesn\u2019t go anywhere", "Check the link in the group chat, or ask your friend to send it again."); return; }
  if (v && v.phase === "expired") { app.innerHTML = dead("This plan has wandered off", "The day moved on. Ask your friend for today\u2019s link, or get Frolic to see the next plan."); return; }
  const focused = document.activeElement && document.activeElement.id === "wn";
  const val = focused ? document.activeElement.value : null;
  app.innerHTML = banner() + head(v || {host: boot.host, group: boot.group}) + packet(v ? v.card : boot.card) + body(v);
  const f = document.getElementById("f");
  if (f) {
    const input = document.getElementById("wn");
    if (val !== null) { input.value = val; input.focus(); }
    f.addEventListener("submit", e => { e.preventDefault(); submit(input.value); });
  }
  const r = document.getElementById("retry");
  if (r) r.addEventListener("click", () => { ui.subError = false; subscribe(); render(); });
}

function petals() {
  if (reduce) return;
  for (let i = 0; i < 34; i++) {
    const d = document.createElement("i");
    d.className = "petal";
    d.style.cssText = "background:" + COLORS[i % 6][0] + ";--dx:" + (Math.random() - .5) * 420 + "px;--dy:" + (Math.random() - .3) * 520 + "px;--rt:" + Math.random() * 720 + "deg;animation-delay:" + Math.random() * .15 + "s";
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1900);
  }
}

let client, unsub, flipTimer;
function apply(raw) {
  ui.subError = false;
  if (raw.phase === "on" && !ui.flipped) {
    const wait = raw.revealAt - serverNow();
    if (wait > 0) {
      ui.view = Object.assign({}, raw, {phase: "planted"});
      render();
      clearTimeout(flipTimer);
      flipTimer = setTimeout(() => apply(raw), wait);
      return;
    }
    ui.flipped = true;
    ui.view = raw;
    render();
    petals();
    if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
    return;
  }
  ui.view = raw;
  render();
}
function subscribe() {
  if (unsub) unsub();
  unsub = client.onUpdate(anyApi.web.share.watch, {code: boot.code, guest}, apply, () => { ui.subError = true; render(); });
}
async function submit(name) {
  name = name.trim();
  ui.name = name;
  if (!name) { ui.error = "Add your first name so your friends know it is you."; render(); return; }
  store.set("frolic.name", name);
  ui.busy = true; ui.error = ""; render();
  try {
    await client.mutation(anyApi.web.share.join, {code: boot.code, guest, name});
    ui.busy = false;
  } catch (e) {
    ui.busy = false;
    ui.error = ui.offline ? "You are offline. Reconnect to say you are down." : "That did not go through. Try again in a moment.";
    render();
  }
}

if (boot.phase === "invalid" || boot.phase === "expired") {
  ui.view = {phase: boot.phase};
  render();
} else {
  render();
  syncClock();
  client = new ConvexClient(boot.cloudUrl);
  subscribe();
  addEventListener("offline", () => { ui.offline = true; render(); });
  addEventListener("online", () => { ui.offline = false; syncClock(); render(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) syncClock(); });
}
