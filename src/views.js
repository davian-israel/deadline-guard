import { PRICE_GBP } from './billing.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtDate = (iso) => iso
  ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  : '—';

const CSS = `
:root{--ink:#14161a;--muted:#5b6170;--line:#e4e6eb;--bg:#fafaf8;--accent:#1f5eff;--ok:#127a45;--soon:#9a6700;--urgent:#c2410c;--overdue:#b42318}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--bg)}
a{color:var(--accent)}.wrap{max-width:760px;margin:0 auto;padding:24px 20px 64px}
header{display:flex;justify-content:space-between;align-items:center;padding:8px 0 28px}
.logo{font-weight:700;letter-spacing:-.02em;text-decoration:none;color:var(--ink)}.logo span{color:var(--accent)}
h1{font-size:clamp(28px,5vw,40px);line-height:1.15;letter-spacing:-.03em;margin:0 0 12px}
.lede{color:var(--muted);font-size:18px;margin:0 0 24px}
form.search{display:flex;gap:8px;flex-wrap:wrap}
input{flex:1;min-width:220px;padding:13px 14px;border:1px solid var(--line);border-radius:10px;font:inherit;background:#fff}
button,.btn{padding:13px 18px;border:0;border-radius:10px;background:var(--accent);color:#fff;font:inherit;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px;margin:16px 0}
.row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--line)}.row:first-of-type{border-top:0}
.pill{font-size:13px;font-weight:600;padding:4px 10px;border-radius:999px;white-space:nowrap}
.ok{background:#e7f6ee;color:var(--ok)}.soon{background:#fff4d6;color:var(--soon)}.urgent{background:#ffeadd;color:var(--urgent)}.overdue{background:#fde8e7;color:var(--overdue)}.unknown{background:#eee;color:#555}
.muted{color:var(--muted)}small{color:var(--muted)}ul.results{list-style:none;padding:0}ul.results li{padding:12px 0;border-top:1px solid var(--line)}
footer{margin-top:48px;color:var(--muted);font-size:14px}`;

function layout({ title, description, body, canonical }) {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<style>${CSS}</style></head><body><div class="wrap">
<header><a class="logo" href="/">Deadline<span>Guard</span></a><a href="/#how">How it works</a></header>
${body}
<footer>Data from Companies House under the Open Government Licence. Not affiliated with Companies House.
· <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></footer>
</div></body></html>`;
}

const searchForm = (q = '') => `<form class="search" action="/search" method="get">
<input name="q" value="${esc(q)}" placeholder="Company name or number, e.g. 09446231" aria-label="Company name or number" required>
<button>Check deadlines</button></form>`;

export function homePage() {
  return layout({
    title: 'Deadline Guard — never miss a Companies House filing deadline',
    description: 'Check when your company accounts and confirmation statement are due, and get reminders before late filing penalties hit.',
    body: `<h1>Never pay a Companies House late filing penalty again.</h1>
<p class="lede">Check your accounts and confirmation statement due dates in seconds. Get email reminders at 60, 30, 14, 7 and 1 day before — for £${PRICE_GBP}/month.</p>
${searchForm()}
<div class="card" id="how"><b>How it works</b>
<div class="row"><span>1. Look up your company</span><small>free</small></div>
<div class="row"><span>2. See every upcoming deadline and the penalty if you're late</span><small>free</small></div>
<div class="row"><span>3. Turn on reminders — we re-check Companies House daily</span><small>£${PRICE_GBP}/mo, cancel any time</small></div></div>
<p class="muted">Late accounts for a private company cost £150 if up to a month late, rising to £1,500 — and double if you were late last year too.</p>`,
  });
}

export function searchPage(q, results) {
  const items = results.length
    ? results.map((r) => `<li><a href="/company/${esc(r.number)}"><b>${esc(r.name)}</b></a> <small>${esc(r.number)} · ${esc(r.status || '')}</small><br><small>${esc(r.address || '')}</small></li>`).join('')
    : '<li>No companies found. Try the 8-character company number.</li>';
  return layout({ title: `Search: ${q} — Deadline Guard`, description: 'Company search', body: `${searchForm(q)}<ul class="results">${items}</ul>` });
}

export function companyPage({ company, filings, baseUrl, flash, stripeReady }) {
  const rows = filings.map((f) => {
    const label = f.status === 'overdue' ? 'Overdue' : f.days != null ? `${f.days} days left` : 'Unknown';
    return `<div class="row"><div><b>${esc(f.label)}</b><br><small>Due ${fmtDate(f.due)}</small></div><span class="pill ${f.status}">${label}</span></div>`;
  }).join('') || '<p class="muted">No filing deadlines on record (the company may be dissolved or exempt).</p>';
  const accounts = filings.find((f) => f.kind === 'accounts');
  const title = `${company.name} (${company.number}) — accounts & confirmation statement due dates`;
  const desc = accounts
    ? `${company.name}'s next accounts are due ${fmtDate(accounts.due)}. Check every Companies House deadline and get reminders.`
    : `Companies House filing deadlines for ${company.name}.`;
  return layout({
    title, description: desc, canonical: `${baseUrl}/company/${company.number}`,
    body: `${flash ? `<div class="card">${esc(flash)}</div>` : ''}
<h1>${esc(company.name)}</h1>
<p class="lede">Company ${esc(company.number)} · ${esc(company.status)}${company.locality ? ` · ${esc(company.locality)}` : ''}</p>
<div class="card">${rows}</div>
<div class="card"><b>Get reminders for ${esc(company.name)}</b>
<p class="muted">Email at 60, 30, 14, 7 and 1 day before each deadline, plus an alert if anything goes overdue. £${PRICE_GBP}/month, cancel any time.</p>
<form method="post" action="/subscribe" class="search">
<input type="hidden" name="company" value="${esc(company.number)}">
<input type="email" name="email" placeholder="you@company.co.uk" required aria-label="Email">
<button>Turn on reminders</button></form>
${stripeReady ? '' : '<p><small>Payments are in test setup — you won\'t be charged yet.</small></p>'}</div>
<p><small>Source: <a href="https://find-and-update.company-information.service.gov.uk/company/${esc(company.number)}">Companies House record</a>. Checked within the last 24 hours.</small></p>`,
  });
}

export function messagePage(title, html) {
  return layout({ title: `${title} — Deadline Guard`, description: title, body: `<h1>${esc(title)}</h1><div class="card">${html}</div><p><a href="/">← Back</a></p>` });
}

export function sitemap(baseUrl, numbers) {
  const urls = [`${baseUrl}/`, ...numbers.map((n) => `${baseUrl}/company/${n}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>`;
}
