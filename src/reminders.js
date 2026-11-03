import { filingsFor, reminderBucket } from './deadlines.js';
import { loadCompany } from './company-service.js';
import { sendEmail } from './email.js';
import { signId } from './tokens.js';
import { track } from './db.js';

function fmtDate(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function reminderEmail({ company, filing, bucket, manageUrl }) {
  const when = bucket === 'overdue'
    ? `is OVERDUE (was due ${fmtDate(filing.due)})`
    : `is due in ${filing.days} day${filing.days === 1 ? '' : 's'} — ${fmtDate(filing.due)}`;
  const penalty = filing.kind === 'accounts'
    ? `<p>Late accounts trigger an automatic penalty starting at <b>£${filing.penaltyIfLate}</b>, rising the later they are.</p>`
    : `<p>There is no fixed fine, but a missing confirmation statement can lead to the company being struck off.</p>`;
  const subject = `${bucket === 'overdue' ? 'OVERDUE: ' : ''}${filing.label} for ${company.name} ${bucket === 'overdue' ? '' : `due in ${filing.days} days`}`.trim();
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px">
    <h2 style="margin:0 0 8px">${filing.label} ${when}</h2>
    <p><b>${company.name}</b> (${company.number})</p>
    ${penalty}
    <p><a href="https://find-and-update.company-information.service.gov.uk/company/${company.number}">Open on Companies House</a></p>
    <hr><p style="color:#666;font-size:13px">Deadline Guard · <a href="${manageUrl}">Manage or cancel</a></p></div>`;
  const text = `${filing.label} ${when}\n${company.name} (${company.number})\nManage: ${manageUrl}`;
  return { subject, html, text };
}

/** Daily job: refresh each active subscriber's company and send any due reminder once per bucket. */
export async function runReminders({ pool, ch, baseUrl, now = new Date() }) {
  const { rows: subs } = await pool.query(
    `SELECT id, email, company_number FROM subscribers WHERE status IN ('active','past_due') ORDER BY id`,
  );
  const stats = { checked: 0, sent: 0, errors: 0 };
  for (const sub of subs) {
    stats.checked++;
    try {
      const company = await loadCompany({ pool, ch }, sub.company_number, { maxAgeHours: 20 });
      if (!company) continue;
      for (const filing of filingsFor(company, now)) {
        const bucket = reminderBucket(filing.days);
        if (!bucket) continue;
        const key = `${filing.kind}:${filing.due}:${bucket}`;
        const ins = await pool.query(
          `INSERT INTO reminders_sent(subscriber_id, reminder_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [sub.id, key],
        );
        if (!ins.rowCount) continue; // already sent this bucket
        const manageUrl = `${baseUrl}/manage/${signId(sub.id)}`;
        try {
          await sendEmail({ to: sub.email, ...reminderEmail({ company, filing, bucket, manageUrl }) });
          await track(pool, 'reminder_sent', key);
          stats.sent++;
        } catch (err) {
          // roll back the marker so tomorrow's run retries
          await pool.query('DELETE FROM reminders_sent WHERE subscriber_id = $1 AND reminder_key = $2', [sub.id, key]);
          throw err;
        }
      }
    } catch (err) {
      stats.errors++;
      console.error(`reminder failed for subscriber ${sub.id}:`, err.message);
    }
  }
  console.log('[reminders]', JSON.stringify(stats));
  return stats;
}
