# Fintech Transaction Review Console

A focused proof of concept for reviewing suspicious synthetic financial
transactions. The application demonstrates server-controlled demo identity,
database-backed authorization, explicit transaction-state transitions,
mandatory decision justification, and an append-only prototype audit trail.

This is not a Retool clone, a low-code platform, a real payment system, or a
production authentication implementation.

## Technology

- Next.js App Router
- TypeScript
- Prisma
- SQLite
- Zod
- Vitest

The application is a modular monolith. Browser code never imports Prisma or
accesses SQLite directly; all reads and writes pass through server route
handlers.

## Setup

Requirements:

- Node.js 20 or newer
- npm

```bash
npm install
cp .env.example .env
npm run db:generate
npx prisma migrate dev
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

The seed command resets the prototype database and creates 3 demo users, 25
customers, and 200 deterministic USD-only synthetic transactions.

## Commands

```bash
npm run dev              # development server
npm run lint             # ESLint
npm run typecheck        # TypeScript validation
npm test                 # complete unit/integration suite
npm run test:coverage    # tests and V8 coverage report
npm run build            # production build
npm start                # start the production build
npm run db:seed          # reset deterministic synthetic data
```

## Demo identity and permissions

> **Demo identity switcher — real authentication is not implemented.**

Selecting a demo user calls the server, which validates the seeded identifier
and sets an HttpOnly cookie. Every protected request reads that cookie and
loads the current user and role from the database. Roles supplied in request
JSON, query parameters, or headers do not grant permissions.

| Role | View queue/detail | Decide | View complete audit trail |
|---|---:|---:|---:|
| Support | Yes | No | No |
| Operations | Yes | Yes | No |
| Approver | Yes | No in this session | Yes |

The three seeded identities are:

- Sam Support (`SUPPORT`)
- Olivia Operations (`OPERATIONS`)
- Avery Approver (`APPROVER`)

## Demo walkthrough

All transaction identifiers use the stable `TRX-2026-xxxxxx` format. These
records remain unchanged whenever the database is reseeded:

| Record | ID | Seed state | Purpose |
|---|---|---|---|
| A | `TRX-2026-000041` | `FLAGGED`, $684.25 | Use as Operations for a successful direct decision |
| B | `TRX-2026-000042` | `FLAGGED`, $1,867.50 | Leave unresolved for the later maker-checker session |
| C | `TRX-2026-000043` | `APPROVED` | Demonstrate safe rejection of repeated/invalid transitions |

Suggested flow:

1. Select Sam Support and search for `TRX-2026-000041`.
2. Open the transaction and confirm that account data is masked and decision
   controls are unavailable.
3. Select Olivia Operations, return to record A, enter a written reason, choose
   Approve, and confirm the decision.
4. Open record C to see a terminal transaction. Server tests prove that further
   decisions return a safe conflict even if a request bypasses the UI.
5. Select Avery Approver and open the complete audit trail.
6. Run `npm run db:seed` to restore the stable demonstration state.

## Transaction states

Operations authorization and a non-empty written reason are required in
addition to these state rules.

| Current state | Approve | Reject | Escalate |
|---|---|---|---|
| `FLAGGED` | `APPROVED` | `REJECTED` | `ESCALATED` |
| `APPROVED` | Denied | Denied | Denied |
| `REJECTED` | Denied | Denied | Denied |
| `ESCALATED` | Denied | Denied | Denied |

`APPROVED`, `REJECTED`, and `ESCALATED` are terminal in this prototype.
Repeated and alternate terminal-state decisions are rejected without changing
the persisted state.

## Decision request evaluation

Protected decision requests are evaluated in this order:

1. Load and validate the server-managed demo identity.
2. Enforce role authorization.
3. Load the requested transaction.
4. Validate the decision payload and mandatory reason with Zod.
5. Validate the permitted state transition.
6. Apply the mutation and create the audit event.

Unauthorized users receive `403 DECISION_FORBIDDEN` before transaction lookup,
so the response does not reveal whether a requested ID exists. Authorized
requests for unknown IDs receive `404 TRANSACTION_NOT_FOUND`.

For a successful decision, transaction update and audit creation happen in one
Prisma transaction.

## Audit behavior

The application uses an **Append-only prototype audit trail.**

Successful and denied decision attempts create events containing actor
snapshots, action, resource, previous persisted state, resulting persisted
state, reason, outcome, and timestamp.

- Successful decisions record the state before and after the mutation.
- Denied decisions against an existing transaction record the same current
  state in `previousState` and `newState`.
- Missing reasons are recorded as `null`.
- Unknown transaction IDs create a denied event with null states and reason.
- Denied complete-audit-trail access creates a denied event with a null reason.
- Successful audit reads do not recursively create audit events.
- Ordinary queue and detail reads are not audited in this prototype.

The `AuditOutcome` enum includes `PENDING` for the later maker-checker session,
but Session 1 does not create pending events.

## Synthetic seed guarantees

- Exactly 200 transactions
- At least 40 `FLAGGED` transactions
- At least 15 flagged amounts above $1,000
- At least 15 flagged amounts at or below $1,000
- Flagged records across `LOW`, `MEDIUM`, `HIGH`, and `CRITICAL`
- USD currency for every transaction
- Deterministic IDs, amounts, statuses, risks, timestamps, and relationships
- No real customer data
- Only account last-four values are stored

## Automated controls

The test suite proves:

- Support receives server-side failures for Approve, Reject, and Escalate.
- A browser-supplied role cannot elevate permissions.
- Missing, empty, and whitespace-only reasons are denied and audited.
- A valid Operations decision updates the transaction and creates the expected
  success event.
- Repeated and terminal-state decisions are safely rejected.
- Authorized unknown-transaction decisions return the stable safe 404 contract
  and null-state audit.
- Unauthorized decisions return the same safe 403 contract for existing and
  unknown IDs.
- Support cannot access the complete audit trail.
- Denied audit access is audited; successful Approver reads are not.
- Account values returned to the browser are masked.
- Seed composition and deterministic reseeding satisfy the documented
  invariants.

## Production gaps

- The demo identity selector is not authentication. A production system would
  require an identity provider, secure sessions, lifecycle controls, and
  appropriate assurance mechanisms.
- A production authorization model may require finer-grained entitlements,
  scoped assignments, and policy administration.
- Production escalation would normally route a transaction into a dedicated
  investigation or case-management queue rather than treating escalation as
  the end of the workflow. That queue is deliberately not built here.
- A production implementation would require explicit requirements for logging,
  retention, monitoring, and central export of access to sensitive customer
  data. Ordinary queue and transaction-detail reads are not audited in this
  prototype.
- The prototype uses USD-only synthetic transactions so that the approval
  threshold remains deterministic. A production implementation would require
  currency-aware thresholds or normalization into a common currency.
- The audit trail is not described as immutable, tamper-resistant, compliant,
  or production ready.
- Maker-checker approval, real payment execution, bank integrations,
  production monitoring, and compliance certification are deferred.
