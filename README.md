# BEE Consultation Platform

A small, end-to-end expert consultation booking experience:

- `server/` — Node.js + Express API with deterministic in-memory seed data.
- `mobile/` — Expo React Native single-screen client.

## Run locally

Requires Node 18+ and npm 9+.

```bash
npm install
npm test
npm run seed
npm run server
```

The API listens on `http://localhost:4000`. Start the Expo app in another
terminal:

```bash
npm run mobile
```

`npm run seed` verifies the realistic in-memory seed set. Because the store is
in memory, each server restart starts from the seed data again.

The app defaults to `localhost` on iOS/web and `10.0.2.2` on an Android
emulator. Set `EXPO_PUBLIC_API_URL` when the phone or simulator needs another
address:

```bash
# iOS simulator / Android emulator (Android commonly uses 10.0.2.2)
EXPO_PUBLIC_API_URL=http://localhost:4000/api npm run mobile
# physical device: use your computer's LAN address
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000/api npm run mobile
```

On Windows PowerShell, use `$env:EXPO_PUBLIC_API_URL="http://192.168.1.20:4000/api"`.
The server must bind to a reachable interface; it defaults to `0.0.0.0`.

## API

`GET /api/experts?q=&category=&available=today` lists experts.
`GET /api/experts/:id/slots` lists future, bookable slots.
`POST /api/bookings` creates a booking. Send an `Idempotency-Key` header and
`{ expertId, slotId, name, email, notes? }` as JSON.
`GET /api/bookings/:id` retrieves a booking confirmation.

Errors consistently use `{ "error": { "code": "...", "message": "...", "details": [...] } }`.
Money is represented as integer cents (`priceCents`) and times are ISO 8601 UTC
strings, so clients can safely format them in the user's timezone.

## Quality checks

The backend tests use Node's built-in `node:test` runner and cover validation,
past-slot rejection, conflicts, and idempotency. Run `npm test`.
