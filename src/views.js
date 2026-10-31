import { PRICE_GBP } from './billing.js';
import { penaltyTable, REMINDER_BUCKETS } from './deadlines.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const DAY = 864e5;
const fmt = (iso, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) => iso
  ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })
  : '';
const minusDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') - n * DAY).toISOString().slice(0, 10);
const price = `£${PRICE_GBP}`;

/* ---------- Design tokens: a desk, white calendar leaves, colour only for urgency ---------- */
const CSS = `
@font-face{font-family:'Shoulders';src:url(/fonts/shoulders-800.woff2) format('woff2');font-weight:800;font-display:swap}
@font-face{font-family:'Shoulders';src:url(/fonts/shoulders-700.woff2) format('woff2');font-weight:700;font-display:swap}
@font-face{font-family:'Atkinson';src:url(/fonts/atkinson-400.woff2) format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:'Atkinson';src:url(/fonts/atkinson-700.woff2) format('woff2');font-weight:700;font-display:swap}
:root{
  --desk:#E8EDF1; --leaf:#FFFFFF; --ink:#16202A; --ink-2:#4A5866; --rule:#CBD4DC;
  --ok:#1F7A55; --soon:#C98A00; --urgent:#D9631E; --overdue:#C8233A; --focus:#2F5BEA;
  --display:'Shoulders','Arial Narrow',sans-serif; --body:'Atkinson',system-ui,sans-serif;
}
*{box-sizing:border-box}
html{background:var(--desk);color:var(--ink);font:400 18px/1.55 var(--body);-webkit-text-size-adjust:100%}
body{margin:0}
a{color:inherit;text-underline-offset:3px}
:focus-visible{outline:3px solid var(--focus);outline-offset:3px;border-radius:4px}
.page{max-width:1080px;margin:0 auto;padding:0 24px}
.top{display:flex;justify-content:space-between;align-items:center;padding:22px 0}
.brand{font:800 26px/1 var(--display);text-decoration:none;letter-spacing:.01em}
.brand b{display:inline-block;width:12px;height:12px;border-radius:2px;background:var(--overdue);margin-right:8px;vertical-align:2px}
.nav a{margin-left:22px;font-size:16px;color:var(--ink-2)}
h1,h2{font-family:var(--display);font-weight:800;letter-spacing:.005em;margin:0}
h1{font-size:clamp(44px,6.2vw,80px);line-height:.95;max-width:15ch}
h2{font-size:clamp(32px,4.4vw,48px);line-height:1}
p{max-width:62ch}
.lede{font-size:21px;color:var(--ink-2);margin:22px 0 30px;max-width:40ch}

/* hero */
.hero{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,.75fr);gap:56px;align-items:center;padding:40px 0 72px}
.lookup{display:flex;gap:10px;max-width:560px}
.lookup input{flex:1;min-width:0;font:inherit;padding:16px 18px;border:2px solid var(--ink);border-radius:10px;background:var(--leaf)}
.btn{font:700 18px/1 var(--body);padding:18px 22px;border:0;border-radius:10px;background:var(--ink);color:#fff;cursor:pointer;text-decoration:none;white-space:nowrap}
.btn:hover{background:#2A3846}
.hint{font-size:15px;color:var(--ink-2);margin-top:12px}

/* the calendar leaf — the one memorable element */
.leaf{--band:var(--ok);position:relative;background:var(--leaf);border-radius:4px 4px 10px 10px;
  box-shadow:6px 6px 0 -1px #F6F8FA,6px 6px 0 0 var(--rule),12px 12px 0 -1px #F6F8FA,12px 12px 0 0 var(--rule);
  width:100%;max-width:300px;text-align:center;overflow:hidden}
.leaf::before{content:'';display:block;height:14px;background:radial-gradient(circle at 10px 7px,var(--desk) 4px,transparent 4.5px) 0 0/20px 14px repeat-x,var(--band)}
.leaf .band{background:var(--band);color:#fff;font:700 17px/1 var(--body);padding:4px 16px 14px}
.leaf .num{font:800 clamp(110px,14vw,150px)/.9 var(--display);padding:18px 10px 0;font-variant-numeric:tabular-nums}
.leaf .unit{font:700 22px/1 var(--display);color:var(--ink-2);padding:6px 0 14px}
.leaf .date{border-top:1px dashed var(--rule);padding:14px 16px 6px;font-weight:700}
.leaf .cost{padding:0 16px 18px;font-size:15px;color:var(--ink-2)}
.leaf.soon{--band:var(--soon)}.leaf.urgent{--band:var(--urgent)}.leaf.overdue{--band:var(--overdue)}.leaf.unknown{--band:var(--ink-2)}
.leaf.overdue .num{font-size:clamp(64px,8vw,84px);padding-top:34px;color:var(--overdue)}
.sample{justify-self:end;position:relative}
.sample figcaption{font-size:14px;color:var(--ink-2);margin-top:26px;text-align:center}

/* sections */
.section{padding:64px 0;border-top:2px solid var(--ink)}
.split{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:56px}
.split p{color:var(--ink-2)}

/* penalty ladder: bar length = the fine */
.ladder{list-style:none;margin:0;padding:0}
.ladder li{display:grid;grid-template-columns:150px 1fr;gap:16px;align-items:center;padding:10px 0}
.ladder .when{font-size:16px;color:var(--ink-2)}
.ladder .bar{height:44px;background:var(--overdue);border-radius:0 6px 6px 0;display:flex;align-items:center;padding:0 14px;
  color:#fff;font:800 26px/1 var(--display);min-width:max-content}
.ladder li:nth-child(1) .bar{opacity:.55}.ladder li:nth-child(2) .bar{opacity:.7}.ladder li:nth-child(3) .bar{opacity:.85}
.note{font-size:15px;color:var(--ink-2);margin-top:14px}

/* reminder timeline: a real sequence, so it is drawn as one */
.line{position:relative;height:120px;margin:12px 0 0}
.line .track{position:absolute;left:0;right:0;top:46px;height:4px;background:var(--ink);border-radius:2px}
.line .tick{position:absolute;top:30px;transform:translateX(-50%);text-align:center;width:90px}
.line .tick i{display:block;width:16px;height:16px;margin:8px auto 10px;border-radius:50%;background:var(--leaf);border:4px solid var(--ink)}
.line .tick b{font:800 24px/1 var(--display)}
.line .tick span{display:block;font-size:14px;color:var(--ink-2)}
.line .tick.due i{background:var(--overdue);border-color:var(--overdue);border-radius:3px}
.line .lab{position:absolute;top:0;font-size:14px;color:var(--ink-2)}

/* pricing */
.plan{background:var(--leaf);border:2px solid var(--ink);border-radius:12px;padding:30px;max-width:520px}
.plan .amount{font:800 84px/1 var(--display)}.plan .amount small{font:700 24px var(--display);color:var(--ink-2)}
.plan ul{padding-left:20px;margin:18px 0 26px}.plan li{margin:6px 0}
.faq dt{font-weight:700;margin-top:22px}.faq dd{margin:6px 0 0;color:var(--ink-2);max-width:62ch}

/* company page */
.co-head{padding:28px 0 8px}
.co-head p{color:var(--ink-2);margin:10px 0 0}
.leaves{display:flex;gap:48px;flex-wrap:wrap;padding:36px 0 56px}
.leaves .leaf{width:280px}
.remind{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px;align-items:start}
.remind form{display:flex;flex-direction:column;gap:12px;max-width:440px}
.remind input{font:inherit;padding:16px 18px;border:2px solid var(--ink);border-radius:10px;background:var(--leaf)}
.sched{list-style:none;padding:0;margin:0;border-left:4px solid var(--ink)}
.sched li{padding:8px 0 8px 18px;position:relative}
.sched li::before{content:'';position:absolute;left:-10px;top:16px;width:12px;height:12px;border-radius:50%;background:var(--leaf);border:3px solid var(--ink)}
.sched li.past{color:var(--ink-2);text-decoration:line-through}
.sched b{font-family:var(--display);font-size:22px;font-weight:800;margin-right:8px}
.flash{background:var(--leaf);border-left:6px solid var(--soon);padding:14px 18px;margin-top:18px;border-radius:0 8px 8px 0}
.results{list-style:none;padding:0;margin:28px 0;max-width:720px}
.results li{border-bottom:1px solid var(--rule)}
.results a{display:block;padding:16px 4px;text-decoration:none}
.results a:hover strong{text-decoration:underline}
.results small{display:block;color:var(--ink-2);font-size:15px}
.msg{padding:56px 0 80px;max-width:640px}.msg .body{font-size:19px;margin:20px 0 28px}
.msg .body p{color:var(--ink-2)}
footer{border-top:2px solid var(--ink);margin-top:40px;padding:26px 0 48px;font-size:15px;color:var(--ink-2)}
footer a{margin-right:18px}

@media (max-width:820px){
  .hero,.split,.remind{grid-template-columns:1fr;gap:36px}
  .sample{justify-self:start}
  .lookup{flex-direction:column}
  .ladder li{grid-template-columns:1fr;gap:6px}
  .line{height:auto;border-left:4px solid var(--ink);margin-left:8px;padding:4px 0}
  .line .track{display:none}
  .line .tick{position:static;transform:none!important;width:auto;display:flex;align-items:center;gap:10px;text-align:left;margin-left:-14px;padding:6px 0}
  .line .tick i{margin:0;flex:none}
  .line .tick span{display:inline}
}
@media (max-width:520px){.nav a:first-child{display:none}.brand{font-size:22px}}
@media (prefers-reduced-motion:no-preference){
  .sample .leaf{animation:drop .7s cubic-bezier(.2,.8,.2,1) .15s both}
  @keyframes drop{from{transform:translateY(-18px) rotate(-3deg);opacity:0}to{transform:none;opacity:1}}
}`;

function layout({ title, description, body, canonical }) {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<link rel="preload" href="/fonts/shoulders-800.woff2" as="font" type="font/woff2" crossorigin>
<style>${CSS}</style></head><body><div class="page">
<header class="top"><a class="brand" href="/"><b aria-hidden="true"></b>Deadline Guard</a>
<nav class="nav"><a href="/#how">How reminders work</a><a href="/pricing">Pricing</a></nav></header>
<main>${body}</main>
<footer><p>Deadline Guard is an independent reminder service. It is not part of, or endorsed by, Companies House or the UK Government. Company data from Companies House under the Open Government Licence.</p>
<a href="/pricing">Pricing</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></footer>
</div></body></html>`;
}

const lookupForm = (q = '') => `<form class="lookup" action="/search" method="get" role="search">
<label class="sr" for="q" style="position:absolute;left:-9999px">Company name or number</label>
<input id="q" name="q" value="${esc(q)}" placeholder="Company name or number" autocomplete="organization" required>
<button class="btn">Check my dates</button></form>`;

/** A filing rendered as a tear-off calendar leaf. */
function leaf(f) {
  const overdue = f.status === 'overdue';
  const num = overdue ? 'Overdue' : f.days === 0 ? 'Today' : String(f.days);
  const unit = overdue ? `since ${fmt(f.due, { day: 'numeric', month: 'short' })}` : f.days === 0 ? 'due today' : f.days === 1 ? 'day left' : 'days left';
  const cost = f.kind === 'accounts'
    ? (overdue ? 'A late filing penalty now applies' : `Late fine starts at £${f.penaltyIfLate}`)
    : 'No fixed fine, but strike-off risk';
  return `<article class="leaf ${esc(f.status)}" aria-label="${esc(f.label)}: ${esc(num)} ${esc(unit)}">
<div class="band">${esc(f.label)}</div><div class="num">${esc(num)}</div><div class="unit">${esc(unit)}</div>
<div class="date">Due ${esc(fmt(f.due))}</div><div class="cost">${esc(cost)}</div></article>`;
}

function penaltyLadder(type = 'ltd') {
  const rows = penaltyTable(type);
  const labels = ['Up to 1 month late', '1 to 3 months', '3 to 6 months', 'More than 6 months'];
  const max = rows.at(-1).gbp;
  return `<ol class="ladder">${rows.map((r, i) => `<li><span class="when">${labels[i]}</span>
<span class="bar" style="width:${Math.max(18, (r.gbp / max) * 100).toFixed(1)}%">£${r.gbp.toLocaleString('en-GB')}</span></li>`).join('')}</ol>`;
}

function reminderLine() {
  const n = REMINDER_BUCKETS.length;
  const pos = (i) => `${(4 + (i / n) * 88).toFixed(2)}%`;
  const ticks = REMINDER_BUCKETS.map((d, i) => `<div class="tick" style="left:${pos(i)}"><i></i><b>${d}</b><span>day${d === 1 ? '' : 's'} before</span></div>`).join('');
  return `<div class="line" aria-label="Reminders arrive 60, 30, 14, 7 and 1 day before the due date">
<div class="track"></div>${ticks}<div class="tick due" style="left:92%"><i></i><b>Due</b><span>and if missed</span></div></div>`;
}

export function homePage() {
  const sample = leaf({ kind: 'accounts', label: 'Annual accounts', status: 'soon', days: 43, due: minusDays(new Date().toISOString().slice(0, 10), -43), penaltyIfLate: 150 });
  return layout({
    title: 'Deadline Guard: Companies House deadlines, counted down to the day',
    description: 'See when your company accounts and confirmation statement are due, and get email reminders before a late filing penalty.',
    body: `<section class="hero">
<div><h1>Every Companies House deadline, counted down to the day.</h1>
<p class="lede">Look up your company to see when your accounts and confirmation statement are due. Turn on email reminders for ${price} a month.</p>
${lookupForm()}<p class="hint">Free to check. Try your 8-character company number, like 09446231.</p></div>
<figure class="sample">${sample}<figcaption>An example. Yours appears after you look up your company.</figcaption></figure>
</section>

<section class="section split"><div><h2>What a late filing costs</h2>
<p>Companies House fines a private company automatically when accounts are late. The fine doubles if the accounts were also late the year before.</p></div>
<div>${penaltyLadder()}<p class="note">Fines for private limited companies. Public companies pay five times more.</p></div></section>

<section class="section" id="how"><h2>Five reminders before every deadline</h2>
<p style="color:var(--ink-2)">We check Companies House every morning. If a date moves, your reminders move with it.</p>
${reminderLine()}</section>

<section class="section split"><div><h2>One price per company</h2>
<p>Most directors look after one company. If you run more, add each one separately.</p></div>
<div class="plan"><div class="amount">${price}<small> a month</small></div>
<ul><li>Accounts and confirmation statement reminders</li><li>Daily checks against Companies House</li><li>An alert the morning anything goes overdue</li><li>Cancel from any email, in one click</li></ul>
<a class="btn" href="#q">Look up my company</a></div></section>`,
  });
}

export function pricingPage() {
  return layout({
    title: `Pricing: ${price} a month per company | Deadline Guard`,
    description: `Deadline Guard costs ${price} a month per company. Cancel any time.`,
    body: `<section class="hero" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
<div><h1>${price} a month. One fine costs £150.</h1>
<p class="lede">That is the whole pricing. One plan, one company, cancel whenever you like.</p>${lookupForm()}</div>
<div class="plan"><div class="amount">${price}<small> a month</small></div>
<ul><li>Reminders at 60, 30, 14, 7 and 1 day before</li><li>Accounts and confirmation statement</li><li>Daily checks, so moved dates are caught</li><li>Overdue alert the same morning</li><li>Card payments handled by Stripe</li></ul></div></section>
<section class="section"><h2>Questions</h2><dl class="faq">
<dt>Do you file anything for me?</dt><dd>No. We remind you; you or your accountant file with Companies House.</dd>
<dt>Where do the dates come from?</dt><dd>Straight from the public Companies House record, checked every morning.</dd>
<dt>How do I cancel?</dt><dd>Every reminder email has a manage link. One click cancels, and you are not charged again.</dd>
<dt>I have an accountant. Do I still need this?</dt><dd>The legal duty to file stays with the directors. Many people use reminders as a second check.</dd>
</dl></section>`,
  });
}

export function searchPage(q, results) {
  const items = results.length
    ? results.map((r) => `<li><a href="/company/${esc(r.number)}"><strong>${esc(r.name)}</strong><small>${esc(r.number)}${r.address ? `, ${esc(r.address)}` : ''}${r.status && r.status !== 'active' ? ` (${esc(r.status)})` : ''}</small></a></li>`).join('')
    : '<li style="padding:16px 4px">No companies match that name. Try the company number from your incorporation certificate.</li>';
  return layout({ title: `Results for “${q}” | Deadline Guard`, description: 'Company search',
    body: `<section class="msg" style="max-width:none"><h2>Choose your company</h2><div style="margin-top:22px">${lookupForm(q)}</div><ul class="results">${items}</ul></section>` });
}

export function companyPage({ company, filings, baseUrl, flash, stripeReady }) {
  const accounts = filings.find((f) => f.kind === 'accounts');
  const next = filings.filter((f) => f.status !== 'overdue').sort((a, b) => a.days - b.days)[0];
  const today = new Date().toISOString().slice(0, 10);
  const sched = next
    ? REMINDER_BUCKETS.map((d) => { const day = minusDays(next.due, d); return `<li class="${day < today ? 'past' : ''}"><b>${d}</b>${day < today ? 'Already passed' : fmt(day)}</li>`; }).join('')
      + `<li><b>Due</b>${fmt(next.due)}</li>`
    : '';
  const title = `${company.name} (${company.number}): accounts and confirmation statement due dates`;
  const desc = accounts ? `${company.name}'s next accounts are due ${fmt(accounts.due)}. See every Companies House deadline and get reminders.` : `Companies House filing deadlines for ${company.name}.`;
  return layout({ title, description: desc, canonical: `${baseUrl}/company/${company.number}`,
    body: `${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
<section class="co-head"><h1 style="max-width:18ch;font-size:clamp(40px,6vw,72px)">${esc(company.name)}</h1>
<p>Company ${esc(company.number)}, ${esc(company.status)}${company.locality ? `, ${esc(company.locality)}` : ''}. Checked against <a href="https://find-and-update.company-information.service.gov.uk/company/${esc(company.number)}">the Companies House record</a> in the last 24 hours.</p></section>
<div class="leaves">${filings.map(leaf).join('') || '<p>There are no filing deadlines on record. The company may be dissolved or exempt.</p>'}</div>
<section class="section remind" id="remind">
<div><h2>Get reminded about ${esc(company.name)}</h2>
<p style="color:var(--ink-2)">${price} a month. We email you on each of these dates${next ? ` for the ${esc(next.label.toLowerCase())}` : ''}, and again if anything goes overdue.</p>
<form method="post" action="/subscribe"><input type="hidden" name="company" value="${esc(company.number)}">
<label for="email" style="font-weight:700">Email for reminders</label>
<input id="email" type="email" name="email" placeholder="you@yourcompany.co.uk" autocomplete="email" required>
<button class="btn">Start reminders for ${price} a month</button>
<span class="hint">${stripeReady ? 'You pay securely on the next page with Stripe.' : 'Payments open soon. Join now and you will not be charged yet.'}</span></form></div>
${sched ? `<ol class="sched" aria-label="Reminder dates">${sched}</ol>` : ''}</section>` });
}

export function messagePage(title, html, { action } = {}) {
  return layout({ title: `${title} | Deadline Guard`, description: title,
    body: `<section class="msg"><h2>${esc(title)}</h2><div class="body">${html}</div>${action || '<a class="btn" href="/">Look up a company</a>'}</section>` });
}

export function sitemap(baseUrl, numbers) {
  const urls = [`${baseUrl}/`, `${baseUrl}/pricing`, ...numbers.map((n) => `${baseUrl}/company/${n}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>`;
}
