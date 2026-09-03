import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { createStore } from '../src/store.js';

function startServer() {
  const server = http.createServer(createApp(createStore()));
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function request(server, path, options = {}) {
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) }
  });
  return { status: response.status, body: await response.json() };
}

test('lists seeded experts and future slots', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const experts = await request(server, '/api/experts?category=Career');
  assert.equal(experts.status, 200);
  assert.equal(experts.body.experts.length, 1);
  const slots = await request(server, `/api/experts/${experts.body.experts[0].id}/slots`);
  assert.equal(slots.status, 200);
  assert.ok(slots.body.slots.every((slot) => new Date(slot.startsAt) > new Date()));
  assert.equal(Number.isInteger(experts.body.experts[0].priceCents), true);
});

test('validates booking input with a consistent error shape', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const result = await request(server, '/api/bookings', {
    method: 'POST',
    body: JSON.stringify({ name: 'A' })
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, 'INVALID_IDEMPOTENCY_KEY');
  const invalid = await request(server, '/api/bookings', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'validation-1' },
    body: JSON.stringify({ expertId: 'x', slotId: 'y', name: 'A', email: 'nope' })
  });
  assert.equal(invalid.status, 422);
  assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(invalid.body.error.details));
});

test('prevents conflicts and returns the same response for duplicate keys', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const experts = await request(server, '/api/experts');
  const expert = experts.body.experts[0];
  const slots = await request(server, `/api/experts/${expert.id}/slots`);
  const payload = { expertId: expert.id, slotId: slots.body.slots[0].id, name: 'Alex Morgan', email: 'alex@example.com' };
  const first = await request(server, '/api/bookings', {
    method: 'POST', headers: { 'Idempotency-Key': 'booking-duplicate-1' }, body: JSON.stringify(payload)
  });
  const duplicate = await request(server, '/api/bookings', {
    method: 'POST', headers: { 'Idempotency-Key': 'booking-duplicate-1' }, body: JSON.stringify(payload)
  });
  assert.equal(first.status, 201);
  assert.deepEqual(duplicate.body, first.body);
  const conflict = await request(server, '/api/bookings', {
    method: 'POST', headers: { 'Idempotency-Key': 'booking-other-1' }, body: JSON.stringify(payload)
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, 'SLOT_ALREADY_BOOKED');
});

test('rejects a slot in the past', async (t) => {
  const store = createStore();
  store.slots[0].startsAt = new Date(Date.now() - 60_000).toISOString();
  const server = http.createServer(createApp(store));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const result = await request(server, '/api/bookings', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'past-slot-1' },
    body: JSON.stringify({
      expertId: store.slots[0].expertId, slotId: store.slots[0].id, name: 'Alex Morgan', email: 'alex@example.com'
    })
  });
  assert.equal(result.status, 409);
  assert.equal(result.body.error.code, 'PAST_SLOT');
});
