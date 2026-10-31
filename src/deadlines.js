// Pure deadline logic — no I/O, fully unit-tested.

const DAY_MS = 24 * 60 * 60 * 1000;

// Reminder buckets, in days before a due date. One email per bucket per due date.
export const REMINDER_BUCKETS = [60, 30, 14, 7, 1];

// Late filing penalties for annual accounts (GOV.UK: "Late filing penalties").
// Months late -> penalty in GBP. Doubled if accounts were also late the previous year.
const PRIVATE_PENALTIES = [
  { upToMonths: 1, gbp: 150 },
  { upToMonths: 3, gbp: 375 },
  { upToMonths: 6, gbp: 750 },
  { upToMonths: Infinity, gbp: 1500 },
];
const PLC_PENALTIES = [
  { upToMonths: 1, gbp: 750 },
  { upToMonths: 3, gbp: 1500 },
  { upToMonths: 6, gbp: 3000 },
  { upToMonths: Infinity, gbp: 7500 },
];

function toUtcDay(d) {
  const date = typeof d === 'string' ? new Date(d + 'T00:00:00Z') : d;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Whole days from `now` until `dueDate` (YYYY-MM-DD). Negative = overdue. */
export function daysUntil(dueDate, now = new Date()) {
  if (!dueDate) return null;
  return Math.round((toUtcDay(dueDate) - toUtcDay(now)) / DAY_MS);
}

export function penaltyTable(companyType) {
  return companyType === 'plc' ? PLC_PENALTIES : PRIVATE_PENALTIES;
}

/** Penalty if accounts were filed `daysLate` days late (approximating months as 30.44 days). */
export function accountsPenalty(daysLate, companyType = 'ltd', lateLastYear = false) {
  if (daysLate == null || daysLate <= 0) return 0;
  const months = daysLate / 30.44;
  const row = penaltyTable(companyType).find((r) => months <= r.upToMonths);
  return lateLastYear ? row.gbp * 2 : row.gbp;
}

/** Status label for UI. */
export function urgency(days) {
  if (days == null) return 'unknown';
  if (days < 0) return 'overdue';
  if (days <= 14) return 'urgent';
  if (days <= 60) return 'soon';
  return 'ok';
}

/**
 * Which reminder bucket applies today, or null if none.
 * Returns 'overdue' for past-due dates, else the smallest bucket >= days.
 */
export function reminderBucket(days) {
  if (days == null) return null;
  if (days < 0) return 'overdue';
  const fitting = REMINDER_BUCKETS.filter((b) => days <= b);
  return fitting.length ? String(Math.min(...fitting)) : null;
}

/** Build the list of filings for a normalised company record. */
export function filingsFor(company, now = new Date()) {
  const out = [];
  if (company.accountsDue) {
    const days = daysUntil(company.accountsDue, now);
    out.push({
      kind: 'accounts',
      label: 'Annual accounts',
      due: company.accountsDue,
      days,
      status: company.accountsOverdue ? 'overdue' : urgency(days),
      penaltyIfLate: accountsPenalty(1, company.type),
    });
  }
  if (company.csDue) {
    const days = daysUntil(company.csDue, now);
    out.push({
      kind: 'confirmation_statement',
      label: 'Confirmation statement',
      due: company.csDue,
      days,
      status: company.csOverdue ? 'overdue' : urgency(days),
      penaltyIfLate: 0, // no fixed fine, but non-filing can lead to strike-off and prosecution
    });
  }
  return out;
}
