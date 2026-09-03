# Decisions

## 1. Product interpretation

I built BEE Consult: a calm, single-screen marketplace for finding a specialist
and booking the next available one-hour conversation. I chose four believable
categories (career, finance, wellness, and technology), search, an available
today filter, and a short booking form because they make the core decision
(“who can help me, and when?”) fast without adding low-value navigation.

## 2. Edge cases

- **Two users booking one slot:** handled with a synchronous check-and-set and a
  `409 SLOT_ALREADY_BOOKED` response. A production database would also enforce a
  unique constraint on `slot_id`.
- **Retry/double tap:** handled with an `Idempotency-Key`; the same request
  returns the original confirmation, while reusing a key for different data is
  rejected.
- **Past slot:** handled by checking the instant again at write time, not only
  when slots were listed.
- **Timezones:** handled by storing and returning UTC ISO instants; the client
  formats them in the device timezone.
- **Invalid input, unknown IDs, malformed JSON, API failure, slow network, empty
  search, and likely offline requests:** handled with validation/status codes,
  consistent error payloads, retry UI, skeleton loading, and empty states.
- **Persistence, payments, authentication, cancellation/refunds, and calendar
  integration:** consciously skipped because this is an in-memory take-home;
  these need product and security decisions before implementation.

## 3. Deliberately not built

There is no account system, payment capture, messaging, reviews, recurring
availability, or push reminders. With two more days I would add persistent
storage with transactional booking/idempotency records, authentication,
payment-provider integration, cancellation rules, and API/integration tests
against a real database.

## 4. Weakest part

The store is intentionally ephemeral, so a process restart loses bookings. The
booking invariant is correct within one Node process, but production would need
database constraints and a distributed idempotency strategy.

## 5. PM pushback

Before shipping I would ask who the customer is, whether consultation prices
include tax/platform fees, what “available” means operationally, who owns
cancellations and refunds, and what privacy/consent requirements apply to
consultation notes. Those decisions change the API and the booking UX.
