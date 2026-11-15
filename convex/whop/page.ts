const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const shell = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<style>
:root{--ink:#23180F;--t2:#6B5F55;--cream:#FFF8EC;--sun:#FF6A2A;--green:#3DAA5C;--line:rgba(35,24,15,.09)}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font:400 17px/1.4 -apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:440px;margin:0 auto;padding:28px 20px 40px}
.label{font:700 12px ui-rounded,system-ui;letter-spacing:.08em;text-transform:uppercase;color:var(--t2)}
h1{font:800 28px/1.15 ui-rounded,"SF Pro Rounded",system-ui;margin:6px 0 4px}
.sub{color:var(--t2);margin:0 0 18px}
.card{background:#fff;border-radius:20px;padding:16px;box-shadow:0 1px 0 var(--line)}
.row{display:flex;justify-content:space-between;align-items:center;min-height:44px;font-weight:600}
.foot{color:var(--t2);font-size:14px;margin:12px 4px 0}
#email,#payment{margin-top:12px}
button{appearance:none;border:0;border-radius:999px;height:54px;width:100%;margin-top:16px;background:#000;color:#fff;font:600 19px system-ui;cursor:pointer}
button[disabled]{opacity:.35}
.err{color:#B3261E;font-size:15px;min-height:20px;margin:10px 4px 0}
.ok{display:flex;gap:12px;align-items:center}.dot{width:36px;height:36px;border-radius:50%;background:var(--green);flex:none}
@media (prefers-reduced-motion:no-preference){button{transition:opacity .2s}}
</style></head><body><main>${body}</main></body></html>`;

export function closedPage(message: string): string {
  return shell("Frolic", `<p class="label">Frolic</p><h1>${esc(message)}</h1><p class="sub">Open Frolic to see what's on today.</p>`);
}

export function payPage(opts: {
  token: string;
  title: string;
  kind: "deposit" | "chipIn";
  amountCents: number;
  accountId: string;
  sandbox: boolean;
}): string {
  const dollars = (opts.amountCents / 100).toFixed(opts.amountCents % 100 === 0 ? 0 : 2);
  const hold = opts.kind === "deposit";
  const heading = hold ? `Hold $${dollars} to lock it in` : `Chip in for ${opts.title}`;
  const rowLabel = hold ? "Your hold" : "Your share";
  const foot = hold ? "You get it back the moment you arrive." : "If it gets called off, you get it back automatically.";
  const done = hold ? "You're in. Your hold is placed." : `You're in. Paid $${dollars}.`;
  const cfg = JSON.stringify({ token: opts.token, accountId: opts.accountId, amount: opts.amountCents, sandbox: opts.sandbox, done });
  return shell(
    heading,
    `<p class="label">It's on</p><h1>${esc(heading)}</h1><p class="sub">${esc(opts.title)}</p>
<section id="form"><div class="card"><div class="row"><span>${rowLabel}</span><span>$${dollars}</span></div></div>
<div id="email"></div><div id="payment"></div><div id="branding"></div>
<p class="foot">${foot}</p>
<button id="pay" disabled aria-label="${hold ? "Place hold" : "Pay"} $${dollars}">${hold ? "Place hold" : "Pay"}</button>
<p id="error" class="err" role="alert"></p></section>
<section id="done" hidden><div class="card ok"><span class="dot" aria-hidden="true"></span><b id="doneText"></b></div><p class="foot">You can close this and head back to Frolic.</p></section>
<script src="https://cdn.whop.com/elements/amber/elements.js" data-whop-elements></script>
<script type="module">
const C = ${cfg.replace(/</g, "\\u003c")};
const err = document.querySelector("#error"), btn = document.querySelector("#pay");
const finish = () => { document.querySelector("#form").hidden = true; document.querySelector("#doneText").textContent = C.done; document.querySelector("#done").hidden = false; };
const params = new URLSearchParams(location.search);
if (params.get("status") === "succeeded") finish();
if (params.get("status") === "failed" || params.get("status") === "canceled") err.textContent = "That didn't go through. Try again.";
try {
  const whop = window.WhopElements(C.sandbox ? { environment: "sandbox" } : {});
  const payments = whop.payments.create({ accountId: C.accountId, currency: "usd", amount: C.amount, returnUrl: location.origin + location.pathname });
  payments.create("email").mount("#email");
  payments.create("payment", { onChange: (e) => (btn.disabled = !e.complete) }).mount("#payment");
  payments.create("branding").mount("#branding");
  btn.addEventListener("click", async () => {
    err.textContent = ""; btn.disabled = true; btn.textContent = "One sec";
    try {
      const { confirmationToken } = await payments.createConfirmationToken({});
      const res = await fetch("/pay/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: C.token, confirmationToken }) });
      const out = await res.json();
      if (!out.ok) throw new Error(out.message || "That didn't go through. Try again.");
      if (["requires_capture", "succeeded", "authorized", "paid"].includes(out.status)) return finish();
      if (out.clientSecret) {
        const r = await whop.payments.handleNextAction({ clientSecret: out.clientSecret });
        if (r.redirected) return;
        if (["succeeded", "requires_capture", "processing"].includes(r.status)) return finish();
        throw new Error(r.lastPaymentError?.message || "That didn't go through. Try again.");
      }
      finish();
    } catch (e) {
      if (e && e.code === "payment_request_cancelled") err.textContent = "";
      else err.textContent = (e && e.message) || "That didn't go through. Try again.";
      btn.disabled = false; btn.textContent = "Try again";
    }
  });
} catch (e) { err.textContent = "Payments can't load right now. Check your connection and try again."; }
</script>`,
  );
}
