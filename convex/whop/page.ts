const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

const ART = (key: string) => `/pay-art/${key}.webp`;

const shell = (title: string, body: string, head = "") => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#12162A"><meta name="color-scheme" content="dark">
<title>${esc(title)}</title>
<style>
:root{--ink:#F6EBDD;--t2:#CDBFAE;--night:#12162A;--accent:#8EE3A8;--green:#34A160;--line:rgba(246,235,221,.12);--skel:rgba(246,235,221,.08)}
*{box-sizing:border-box}body{margin:0;background:var(--night);color:var(--ink);font:400 17px/1.4 -apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}
main{max-width:440px;margin:0 auto;padding:28px 20px calc(40px + env(safe-area-inset-bottom));text-align:center}
.label{font:700 14px ui-rounded,system-ui;color:var(--accent);margin:0}
h1{font:800 32px/1.12 "New York",ui-serif,Georgia,serif;margin:6px 0 6px}
h2{font:800 26px/1.2 "New York",ui-serif,Georgia,serif;margin:14px 0 6px}
.sub{color:var(--t2);margin:0 0 22px}
.card{border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:4px 2px;text-align:left}
.row{display:flex;justify-content:space-between;align-items:center;min-height:48px;font-weight:600;gap:12px}
.row.fund{color:var(--t2);font-weight:500;font-size:15px;min-height:32px}
.foot{color:var(--t2);font-size:15px;margin:14px 4px 0}
#email,#payment,#branding{margin-top:14px;text-align:left}
#payment{min-height:96px}
.skel{height:16px;border-radius:8px;background:var(--skel);margin:12px 0}
.skel.tall{height:44px}
@keyframes pulse{0%,100%{opacity:.55}50%{opacity:1}}
#payment[data-loading="1"] .skel{animation:pulse 1.4s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){#payment[data-loading="1"] .skel{animation:none}}
button{appearance:none;border:0;border-radius:999px;height:56px;width:100%;margin-top:18px;background:var(--green);color:#fff;font:600 19px ui-rounded,system-ui;cursor:pointer}
button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
button[disabled]{opacity:.4;cursor:default}
.err{color:#FFB4AB;font-size:15px;margin:10px 4px 0;min-height:20px}
.ok{display:flex;gap:12px;align-items:center}
.art{display:block;margin:0 auto 10px;width:min(180px,48vw);height:auto}
.art.small{width:min(150px,42vw)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (prefers-reduced-motion:no-preference){button{transition:opacity .2s}}
</style>${head}</head><body><main>${body}</main></body></html>`;

export function closedPage(message: string, art?: "released"): string {
  const figure = art === "released" ? `<img class="art" src="${ART("whop-deposit-back")}" width="640" height="661" alt="">` : "";
  return shell(
    message,
    `${figure}<p class="label">Frolic</p><h1>${esc(message)}</h1><p class="sub">Open Frolic to see what's on today.</p>`,
  );
}

export function payPage(opts: {
  token: string;
  title: string;
  when: string;
  kind: "deposit" | "chipIn";
  amountCents: number;
  fundCents: number;
  accountId: string;
  sandbox: boolean;
}): string {
  const hold = opts.kind === "deposit";
  const amount = dollars(opts.amountCents);
  const heading = hold ? `Hold ${amount} to lock it in` : `Chip in for ${opts.title}`;
  const rowLabel = hold ? "Your hold" : "Your share";
  const foot = hold ? "You get it back the moment you arrive." : "If it gets called off, you get it back automatically.";
  const done = hold ? `You're in. ${amount} held.` : `You're in. Paid ${amount}.`;
  const fundRow =
    !hold && opts.fundCents > 0
      ? `<div class="row fund"><span>The Frolic Fund</span><span>-${dollars(opts.fundCents)}</span></div>`
      : "";
  const figure =
    !hold && opts.fundCents > 0
      ? `<img class="art small" src="${ART("whop-fund-jar")}" width="640" height="554" alt="">`
      : hold
        ? `<img class="art small" src="${ART("whop-deposit-back")}" width="640" height="661" alt="">`
        : "";
  const cfg = JSON.stringify({ token: opts.token, accountId: opts.accountId, amount: opts.amountCents, sandbox: opts.sandbox, done });
  const skeleton = `<div data-loading="1" aria-hidden="true"><div class="skel tall"></div><div class="skel"></div><div class="skel" style="width:62%"></div></div><p class="sr" role="status">Loading card entry.</p>`;
  const recovery = `
<script>
(function(){
  var err = document.getElementById("error"), btn = document.getElementById("pay"), box = document.getElementById("payment");
  function say(text, action) {
    err.textContent = text;
    if (action) { btn.disabled = false; btn.textContent = action; btn.onclick = function(){ location.reload(); }; }
  }
  function online() { return navigator.onLine !== false; }
  window.__frolic = {
    say: say,
    ready: function(){ window.__frolicReady = true; if (box) box.removeAttribute("data-loading"); },
    live: online
  };
  if (!online()) say("You're offline. Reconnect, then tap Reload.", "Reload");
  window.addEventListener("offline", function(){ say("You're offline. Reconnect, then tap Reload.", "Reload"); });
  setTimeout(function(){
    if (window.__frolicReady) return;
    say(online() ? "Card entry is taking too long. Tap Reload to try again." : "You're offline. Reconnect, then tap Reload.", "Reload");
  }, 12000);
})();
</script>`;
  return shell(
    heading,
    `${figure}<p class="label">It's on</p><h1>${esc(heading)}</h1><p class="sub">${esc(opts.title)}${opts.when ? ` &middot; ${esc(opts.when)}` : ""}</p>
<section id="form"><div class="card"><div class="row"><span>${rowLabel}</span><span>${amount}</span></div>${fundRow}</div>
<div id="email"></div><div id="payment">${skeleton}</div><div id="branding"></div>
<p class="foot">${foot}</p>
<button id="pay" disabled aria-label="${hold ? "Place hold" : "Pay"} ${amount}">${hold ? "Place hold" : "Pay"}</button>
<p id="error" class="err" role="alert"></p></section>
<section id="done" hidden><img class="art" src="${ART("whop-deposit-back")}" width="640" height="661" alt=""><h2 id="doneText"></h2><p class="foot">You can close this and head back to Frolic.</p></section>
<script src="https://cdn.whop.com/elements/amber/elements.js" data-whop-elements onerror="document.getElementById('error').textContent='Card entry could not load. Check your connection, then tap Reload.';var b=document.getElementById('pay');b.disabled=false;b.textContent='Reload';b.onclick=function(){location.reload()}"></script>
${recovery}
<script type="module">
const C = ${cfg.replace(/</g, "\\u003c")};
const err = document.querySelector("#error"), btn = document.querySelector("#pay");
const checking = () => { document.querySelector("#form").hidden = true; document.querySelector("#doneText").textContent = "Your bank is still checking this. Frolic shows it the moment it's in."; document.querySelector("#done img").hidden = true; document.querySelector("#done").hidden = false; };
const finish = () => { document.querySelector("#form").hidden = true; document.querySelector("#doneText").textContent = C.done; document.querySelector("#done").hidden = false; };
const params = new URLSearchParams(location.search);
if (params.get("status") === "succeeded") finish();
if (params.get("status") === "failed" || params.get("status") === "canceled") err.textContent = "That didn't go through. Try again.";
if (!window.__frolic.live()) throw new Error("offline");
try {
  const whop = window.WhopElements({ ...(C.sandbox ? { environment: "sandbox" } : {}), appearance: { theme: { appearance: "dark" } } });
  const payments = whop.payments.create({ accountId: C.accountId, currency: "usd", amount: C.amount, returnUrl: location.origin + location.pathname });
  payments.create("email").mount("#email");
  document.querySelector("#payment").replaceChildren();
  payments.create("payment", { onChange: (e) => (btn.disabled = !e.complete) }).mount("#payment");
  payments.create("branding").mount("#branding");
  window.__frolic.ready();
  btn.addEventListener("click", async () => {
    err.textContent = ""; btn.disabled = true; btn.textContent = "One sec.";
    try {
      const { confirmationToken } = await payments.createConfirmationToken({});
      const res = await fetch("/pay/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: C.token, confirmationToken }) });
      const out = await res.json();
      if (!out.ok) throw new Error(out.message || "That didn't go through. Try again.");
      if (["requires_capture", "succeeded", "authorized", "paid"].includes(out.status)) return finish();
      if (out.clientSecret) {
        const r = await whop.payments.handleNextAction({ clientSecret: out.clientSecret });
        if (r.redirected) return;
        if (["succeeded", "requires_capture"].includes(r.status)) return finish();
        if (r.status === "processing") return checking();
        throw new Error(r.lastPaymentError?.message || "That didn't go through. Try again.");
      }
      if (["pending", "processing"].includes(out.status)) return checking();
      throw new Error("That didn't go through. Try again.");
    } catch (e) {
      if (e && e.code === "payment_request_cancelled") err.textContent = "";
      else err.textContent = window.__frolic.live() ? (e && e.message) || "That didn't go through. Try again." : "You're offline. Reconnect, then tap Try again.";
      btn.disabled = false; btn.textContent = "Try again";
    }
  });
} catch (e) {
  if (e && e.message === "offline") throw e;
  window.__frolic.say("Card entry could not load. Check your connection, then tap Reload.", "Reload");
}
</script>`,
  );
}
