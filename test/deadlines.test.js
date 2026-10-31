import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil, accountsPenalty, reminderBucket, urgency, filingsFor } from '../src/deadlines.js';
import { normaliseNumber } from '../src/companies-house.js';
import { signId, verifyToken } from '../src/tokens.js';

const NOW = new Date('2026-11-01T09:00:00Z');

test('daysUntil counts whole UTC days', () => {
  assert.equal(daysUntil('2026-11-01', NOW), 0);
  assert.equal(daysUntil('2026-11-08', NOW), 7);
  assert.equal(daysUntil('2026-10-31', NOW), -1);
  assert.equal(daysUntil(null, NOW), null);
});

test('accounts penalties follow GOV.UK bands', () => {
  assert.equal(accountsPenalty(0), 0);
  assert.equal(accountsPenalty(10), 150);
  assert.equal(accountsPenalty(60), 375);
  assert.equal(accountsPenalty(120), 750);
  assert.equal(accountsPenalty(400), 1500);
  assert.equal(accountsPenalty(10, 'ltd', true), 300);
  assert.equal(accountsPenalty(10, 'plc'), 750);
});

test('reminder buckets pick the tightest window', () => {
  assert.equal(reminderBucket(90), null);
  assert.equal(reminderBucket(60), '60');
  assert.equal(reminderBucket(45), '60');
  assert.equal(reminderBucket(30), '30');
  assert.equal(reminderBucket(8), '14');
  assert.equal(reminderBucket(7), '7');
  assert.equal(reminderBucket(1), '1');
  assert.equal(reminderBucket(0), '1');
  assert.equal(reminderBucket(-3), 'overdue');
});

test('urgency labels', () => {
  assert.equal(urgency(-1), 'overdue');
  assert.equal(urgency(5), 'urgent');
  assert.equal(urgency(40), 'soon');
  assert.equal(urgency(200), 'ok');
});

test('filingsFor builds both filings and honours overdue flags', () => {
  const f = filingsFor({ accountsDue: '2026-11-20', csDue: '2026-10-01', csOverdue: true, type: 'ltd' }, NOW);
  assert.equal(f.length, 2);
  assert.equal(f[0].days, 19);
  assert.equal(f[0].status, 'soon');
  assert.equal(f[1].status, 'overdue');
});

test('company numbers are normalised', () => {
  assert.equal(normaliseNumber('9446231'), '09446231');
  assert.equal(normaliseNumber(' sc123456 '), 'SC123456');
  assert.equal(normaliseNumber('SC1234'), 'SC001234');
  assert.equal(normaliseNumber('bad!'), null);
  assert.equal(normaliseNumber('123456789'), null);
});

test('manage tokens verify and reject tampering', () => {
  const t = signId(42);
  assert.equal(verifyToken(t), 42);
  assert.equal(verifyToken('43.' + t.split('.')[1]), null);
  assert.equal(verifyToken('junk'), null);
});
