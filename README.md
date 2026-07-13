# Fintech Transaction Review Console

A focused proof of concept for reviewing suspicious synthetic financial
transactions. The application demonstrates server-controlled demo identity,
database-backed authorization, explicit transaction-state transitions,
mandatory decision justification, and an append-only prototype audit trail.
High-value Approve and Reject decisions use a maker-checker control so one
Operations user requests the change and an Approver completes or vetoes it.

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
npm ci
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

| Role | View queue/detail | Direct decide | Create high-value request | View/complete pending approvals | View complete audit trail |
|---|---:|---:|---:|---:|---:|
| Support | Yes | No | No | No | No |
| Operations | Yes | Yes, when eligible | Yes | No | No |
| Approver | Yes | No | No | Yes | Yes |

The three seeded identities are:

- Sam Support (`SUPPORT`)
- Olivia Operations (`OPERATIONS`)
- Aaron Approver (`APPROVER`)

## Demo walkthrough

All transaction identifiers use the stable `TRX-2026-xxxxxx` format. These
records remain unchanged whenever the database is reseeded:

| Record | ID | Seed state | Purpose |
|---|---|---|---|
| A | `TRX-2026-000041` | `FLAGGED`, $684.25 | Use as Operations for a successful direct decision |
| B | `TRX-2026-000042` | `FLAGGED`, $1,867.50 | Maker-checker approval demonstration |
| C | `TRX-2026-000043` | `APPROVED` | Demonstrate safe rejection of repeated/invalid transitions |

Suggested flow:

1. Run `npm run db:seed` to restore the stable unresolved state.
2. Select Olivia Operations and open `TRX-2026-000042`.
3. Choose Reject, enter a request reason, and confirm. The response is
   `PENDING_APPROVAL`; the transaction remains `FLAGGED`.
4. Open Pending approvals as Operations to see the authorization failure.
   API tests also prove Operations cannot approve or veto.
5. Select Aaron Approver, open Pending approvals, and review the request.
6. Enter a mandatory checker reason, choose Approve request, and confirm.
7. Verify the request is `APPROVED`, its active transaction ownership is
   cleared, and `TRX-2026-000042` is `REJECTED`.
8. Open the audit trail and verify the `PENDING` request event followed by the
   `SUCCESS` completion event with actual persisted states.
9. Server tests prove repeat completion is safely denied.
10. Run `npm run db:seed` again and confirm record B returns to `FLAGGED`.

For the Session 1 direct-decision flow, use Olivia Operations with
`TRX-2026-000041`; its $684.25 amount remains eligible for a direct decision.
Use Sam Support to verify masked account data and server-side decision denial,
and record C to demonstrate terminal-state rejection.

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

## Maker-checker workflow

The fixed high-value threshold is `100000` minor units ($1,000.00 USD):

- `APPROVE` and `REJECT` at or below the threshold remain direct Operations
  decisions.
- `APPROVE` and `REJECT` above the threshold create a pending approval request
  and leave the transaction `FLAGGED`.
- `ESCALATE` remains direct regardless of amount.
- While any request is `PENDING`, every further transaction decision,
  including Escalate, is blocked to prevent a stale checker review.
- Only `APPROVER` may approve or veto. The persisted requester user ID cannot
  equal the current server-loaded user ID.

`requestedAction` is the typed `ApprovalAction` enum (`APPROVE` or `REJECT`).
The requested target state is derived on the server; browser-supplied target,
status, requester, reviewer, actor, and role values are ignored.

| Approval state | Approve | Veto |
|---|---|---|
| `PENDING` | `APPROVED`; transaction becomes requested target | `VETOED`; transaction stays `FLAGGED` |
| `APPROVED` | Denied | Denied |
| `VETOED` | Denied | Denied |

`activeTransactionId` equals the transaction ID only while the request is
`PENDING`. Approval or veto atomically changes the terminal request status and
clears `activeTransactionId`, so a vetoed `FLAGGED` transaction can receive a
later valid request.

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

For a successful direct decision, transaction update and audit creation happen
in one Prisma transaction. The existing request body remains compatible.
Successful responses add a backward-compatible discriminator:

- `kind = "DECIDED"` for a direct decision.
- `kind = "PENDING_APPROVAL"` for a high-value request.

High-value request validation, request creation, and the `PENDING` audit event
share the existing decision-service transaction; no nested Prisma transaction
is opened.

## Stable error codes

| Code | Meaning |
|---|---|
| `DECISION_FORBIDDEN` | Current server-loaded role cannot decide |
| `TRANSACTION_NOT_FOUND` | Authorized decision references an unknown transaction |
| `DECISION_INVALID_PAYLOAD` | Decision action or payload is invalid |
| `DECISION_REASON_REQUIRED` | Operations reason is empty |
| `DECISION_INVALID_TRANSITION` | Transaction is terminal |
| `APPROVAL_FORBIDDEN` | Current role cannot view or complete approvals |
| `SELF_APPROVAL_FORBIDDEN` | Current user ID equals persisted requester ID |
| `APPROVAL_NOT_FOUND` | Approval request does not exist |
| `APPROVAL_ALREADY_PENDING` | Transaction already has an active request |
| `APPROVAL_ALREADY_COMPLETED` | Request is already approved or vetoed |
| `APPROVAL_INVALID_PAYLOAD` | Completion action or payload is invalid |
| `REVIEW_REASON_REQUIRED` | Checker reason is empty |
| `TRANSACTION_STATE_CONFLICT` | Pending ownership or transaction state conflicts |

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
- Denied access to the privileged Pending Approvals area creates a `DENIED`
  audit event.
- Successful Pending Approvals reads are not audited.
- Successful complete-audit-trail reads are not audited.
- Ordinary queue and detail reads are not audited in this prototype.

Maker-checker request creation records `PENDING` with `FLAGGED → FLAGGED`.
Approval records `SUCCESS` with `FLAGGED → APPROVED` or
`FLAGGED → REJECTED`. Veto records `SUCCESS` with `FLAGGED → FLAGGED`.
Duplicate, forbidden, self-approval, repeated-completion, and state-conflict
attempts record `DENIED` where the database remains available.
This remains an append-only prototype audit trail, not a tamper-resistant or
compliance-grade audit system.

## Concurrency and atomicity

- SQLite serializes database writes.
- Prisma provides the transaction boundary.
- A nullable unique `activeTransactionId` is the final integrity guard against
  two active requests; an in-transaction check provides the clear domain error.
- Conditional `updateMany` operations provide compare-and-set behavior at the
  application/database boundary.
- Completion atomically changes `PENDING` to `APPROVED`/`VETOED`, clears
  `activeTransactionId`, conditionally changes the `FLAGGED` transaction when
  approved, and writes the success audit event.
- The prototype demonstrates exactly-one completion under the tested SQLite
  setup. It does not claim distributed or multi-database concurrency
  guarantees.
- A compare-and-set loser returns `APPROVAL_ALREADY_COMPLETED`. Its denied
  event is written separately where possible so it cannot roll back the
  winner; an unavailable database may prevent that secondary audit write.

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
- High-value Approve/Reject create typed pending requests and preserve
  `FLAGGED`; direct low-value decisions and eligible Escalate remain compatible.
- Active ownership is set while pending, cleared on approval/veto, and permits
  a later request after veto.
- Support cannot create or view approval requests; Operations cannot complete
  them.
- Self-approval remains blocked after the requester's persisted role changes
  to Approver because the control compares user IDs.
- Approver approval applies the server-derived target; veto leaves the
  transaction unchanged.
- Duplicate requests, decisions while pending, and repeated completion are
  denied and audited.
- Two concurrent completion attempts produce exactly one success in SQLite.
- Client-supplied approval actors, roles, statuses, and target states cannot
  override server-derived values.
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
- The maker-checker threshold is fixed in source for this focused prototype.
  Production rules would normally be centrally managed, versioned, and tested
  across products and jurisdictions.
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
- Real payment execution, bank integrations, notifications, multi-level
  approvals, production monitoring, and compliance certification are deferred.
