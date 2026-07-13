# Transaction Risk Operations Console

> This prototype evaluates whether Devin can accelerate the development of one representative fintech internal workflow. It reproduces selected application-level capabilities but does not recreate Retool’s managed platform or operational capabilities.

## Prototype overview

This repository contains a synthetic transaction-review console for Support,
Operations, and Approver users.

### Retool-style application capabilities demonstrated

- A searchable and filterable queue of flagged transactions.
- Masked customer and payment context.
- Server-side role authorization.
- Direct low-value transaction decisions.
- Maker-checker approval for high-value Approve and Reject decisions.
- Mandatory written reasons and explicit state transitions.
- Database-backed audit events for successful, pending, and denied actions.
- Focused request-boundary, input-validation, and response-header controls.

The prototype evaluates one workload. It is not a Retool clone, payment
system, authentication implementation, compliance control, or production
service.

## Technology

- Next.js App Router and React
- TypeScript
- Prisma
- SQLite
- Zod
- Vitest with V8 coverage

The application is a modular monolith. Browser code calls Next.js pages and API
routes; server services enforce identity, authorization, workflow, and audit
rules before Prisma accesses SQLite. See
[Architecture](docs/architecture.md) for the concise system design.

## Install and run

Requirements:

- Node.js 20.19 or newer
- npm

From a fresh clone:

```bash
npm ci
cp .env.example .env
npm run db:generate
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

To build and run the production application:

```bash
npm run build
npm start
```

### Reset the database

```bash
npm run db:seed
```

Resetting restores the deterministic synthetic fixtures and deletes local
approval requests and audit events.

## Demo identities

The identity selector stores a seeded user ID in an HttpOnly cookie. The server
validates that ID and reloads the user's current role from SQLite on every
protected request.

| Identity | Role | Capabilities |
|---|---|---|
| Sam Support | `SUPPORT` | View transaction queue and details |
| Olivia Operations | `OPERATIONS` | View transactions, decide eligible transactions, request high-value approval |
| Aaron Approver | `APPROVER` | View transactions, review pending requests, view recent audit events |

This unsigned selector is not authentication. Anyone with prototype access can
choose any seeded identity.

## Stable demonstration transactions

The seed contains 200 deterministic USD transactions. These records are stable
after every reset:

| ID | Initial state | Amount | Purpose |
|---|---|---:|---|
| `TRX-2026-000041` | `FLAGGED` | $684.25 | Direct Operations decision |
| `TRX-2026-000042` | `FLAGGED` | $1,867.50 | Maker-checker approval |
| `TRX-2026-000043` | `APPROVED` | $416.73 | Terminal-state rejection |

## Direct-decision walkthrough

1. Reset the database and select **Sam Support**.
2. Open `TRX-2026-000041` and confirm that transaction context is visible but
   decision controls are unavailable.
3. Select **Olivia Operations**, enter a written reason, and Approve or Reject.
4. Confirm the transaction changes directly from `FLAGGED` to the selected
   terminal state and a success audit event is recorded.

Approve and Reject are direct when `amountMinor <= 100000` ($1,000.00 USD).
Escalate is also direct when no approval request is pending.

## Maker-checker walkthrough

1. Reset the database, select **Olivia Operations**, and open
   `TRX-2026-000042`.
2. Enter a reason and choose Approve or Reject. The transaction remains
   `FLAGGED` and the request becomes `PENDING`.
3. Confirm further decisions are blocked while the request is pending.
4. Select **Aaron Approver**, open **Pending approvals**, and approve or veto
   the request with a review reason.
5. An approved request applies the requested target state; a veto leaves the
   transaction `FLAGGED`. The audit view records the pending request without a
   false state change and the final checker result with the persisted states.

High-value Approve and Reject decisions require a separate checker when
`amountMinor > 100000`. The requester cannot complete their own request.

## Validation

Final validation on the documentation branch:

- Lint: passed
- Type check: passed
- Tests: **98/98 passed across 13 files**
- Coverage: **89.95% statements / 89.18% branches / 97.67% functions / 89.95% lines**
- `npm audit --audit-level=low`: **0 vulnerabilities**
- Production build: passed

## Security boundaries

- Protected routes load identity and role from the database; client-supplied
  actors, roles, states, and approval targets do not grant authority.
- Mutation routes require an exact same-origin `Origin`, JSON content type, and
  a body no larger than 16 KiB.
- Written reasons are normalized, limited to 1,000 characters, and reject
  control, format, and bidirectional characters that could mislead reviewers.
- Only account last-four values are stored; user-entered text is rendered as
  text rather than HTML.
- Transaction and audit writes share Prisma transactions. Maker-checker
  completion uses conditional updates and one active request per transaction.
- The audit page shows the newest 250 events. The trail is append-only only
  during normal application operation between explicit local resets.

## Production limitations

- The demo identity selector provides no real authentication, session
  assurance, or user accountability.
- SQLite demonstrates local single-writer behavior only; it does not establish
  distributed concurrency or production scalability.
- The fixed threshold assumes USD and is not a configurable policy service.
- Local audit data can be changed through database access and is deleted by
  reseeding. It is not immutable, tamper-resistant, or compliance-grade.
- Origin checks depend on a reverse proxy preserving the external host and
  protocol. Application body limits do not replace rate limiting or
  network-layer denial-of-service controls.
- Production identity, deployment, monitoring, retention, incident response,
  integrations, and compliance validation are outside this prototype.
