import express from 'express';
import crypto from 'node:crypto';
import { createStore, publicExpert } from './store.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const idempotencyPattern = /^[\w:.\\/-]{8,100}$/;

function errorPayload(code, message, details = []) {
  return { error: { code, message, details } };
}

function sendError(res, status, code, message, details) {
  return res.status(status).json(errorPayload(code, message, details));
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function futureSlots(store, expertId) {
  const now = Date.now();
  return store.slots
    .filter((slot) => slot.expertId === expertId && new Date(slot.startsAt).getTime() > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function slotResponse(store, slot) {
  const booking = [...store.bookings.values()].find((item) => item.slotId === slot.id);
  return { ...slot, isBooked: Boolean(booking) };
}

function requestFingerprint(body) {
  return crypto.createHash('sha256').update(JSON.stringify({
    expertId: body.expertId,
    slotId: body.slotId,
    name: body.name,
    email: body.email,
    notes: body.notes ?? ''
  })).digest('hex');
}

export function createApp(store = createStore()) {
  const app = express();
  app.use(express.json({ limit: '20kb' }));
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.get('/api/categories', (_req, res) => res.json({ categories: store.categories }));

  app.get('/api/experts', (req, res) => {
    const query = cleanText(req.query.q, 80).toLowerCase();
    const category = cleanText(req.query.category, 40);
    const availableToday = req.query.available === 'today';
    const today = new Date().toISOString().slice(0, 10);
    const experts = store.experts
      .map((expert) => ({ expert, slots: futureSlots(store, expert.id) }))
      .filter(({ expert, slots }) => {
        const searchable = `${expert.name} ${expert.title} ${expert.bio} ${expert.category}`.toLowerCase();
        return (!query || searchable.includes(query))
          && (!category || category === 'All' || expert.category === category)
          && (!availableToday || slots.some((slot) => slot.startsAt.slice(0, 10) === today));
      })
      .map(({ expert, slots }) => publicExpert(expert, slots));
    return res.json({ experts, total: experts.length });
  });

  app.get('/api/experts/:expertId', (req, res) => {
    const expert = store.experts.find((item) => item.id === req.params.expertId);
    if (!expert) return sendError(res, 404, 'EXPERT_NOT_FOUND', 'That expert does not exist.');
    return res.json({ expert: publicExpert(expert, futureSlots(store, expert.id)) });
  });

  app.get('/api/experts/:expertId/slots', (req, res) => {
    const expert = store.experts.find((item) => item.id === req.params.expertId);
    if (!expert) return sendError(res, 404, 'EXPERT_NOT_FOUND', 'That expert does not exist.');
    return res.json({ slots: futureSlots(store, expert.id).map((slot) => slotResponse(store, slot)) });
  });

  app.get('/api/bookings/:bookingId', (req, res) => {
    const booking = store.bookings.get(req.params.bookingId);
    if (!booking) return sendError(res, 404, 'BOOKING_NOT_FOUND', 'That booking does not exist.');
    return res.json({ booking });
  });

  app.post('/api/bookings', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const key = req.get('Idempotency-Key');
    if (!key || !idempotencyPattern.test(key)) {
      return sendError(res, 400, 'INVALID_IDEMPOTENCY_KEY', 'Provide an Idempotency-Key between 8 and 100 safe characters.');
    }

    const validation = [];
    const expertId = cleanText(body.expertId, 80);
    const slotId = cleanText(body.slotId, 80);
    const name = cleanText(body.name, 100);
    const email = cleanText(body.email, 160).toLowerCase();
    const notes = cleanText(body.notes, 500);
    if (!expertId) validation.push({ field: 'expertId', message: 'Expert is required.' });
    if (!slotId) validation.push({ field: 'slotId', message: 'Time slot is required.' });
    if (name.length < 2) validation.push({ field: 'name', message: 'Name must be at least 2 characters.' });
    if (!emailPattern.test(email)) validation.push({ field: 'email', message: 'Enter a valid email address.' });
    if (validation.length) return sendError(res, 422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', validation);

    const fingerprint = requestFingerprint({ expertId, slotId, name, email, notes });
    const previous = store.idempotency.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        return sendError(res, 409, 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used for a different booking.');
      }
      return res.status(previous.status).json(previous.body);
    }

    const expert = store.experts.find((item) => item.id === expertId);
    if (!expert) return sendError(res, 404, 'EXPERT_NOT_FOUND', 'That expert does not exist.');
    const slot = store.slots.find((item) => item.id === slotId && item.expertId === expertId);
    if (!slot) return sendError(res, 404, 'SLOT_NOT_FOUND', 'That time slot is not available for this expert.');
    if (new Date(slot.startsAt).getTime() <= Date.now()) {
      return sendError(res, 409, 'PAST_SLOT', 'That time slot has already passed. Choose another time.');
    }
    if ([...store.bookings.values()].some((booking) => booking.slotId === slotId)) {
      return sendError(res, 409, 'SLOT_ALREADY_BOOKED', 'That time slot was just booked. Choose another time.');
    }

    const booking = {
      id: `booking-${crypto.randomUUID()}`,
      status: 'confirmed',
      expertId,
      expertName: expert.name,
      slotId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      name,
      email,
      notes,
      priceCents: Number(slot.priceCents),
      createdAt: new Date().toISOString()
    };
    const responseBody = { booking };
    store.bookings.set(booking.id, booking);
    store.idempotency.set(key, { fingerprint, status: 201, body: responseBody });
    return res.status(201).json(responseBody);
  });

  app.use((_req, res) => sendError(res, 404, 'NOT_FOUND', 'The requested resource was not found.'));
  app.use((err, _req, res, _next) => {
    if (err instanceof SyntaxError && 'body' in err) {
      return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
    }
    return sendError(res, 500, 'INTERNAL_ERROR', 'Something unexpected happened.');
  });

  return app;
}

export { errorPayload };
