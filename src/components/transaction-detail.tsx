"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { readErrorMessage } from "@/shared/api";
import type { DemoUser, TransactionSummary } from "@/shared/api-types";
import { formatDateTime, formatMoney } from "@/shared/format";

type DecisionAction = "APPROVE" | "REJECT" | "ESCALATE";

const actionLabels: Record<DecisionAction, string> = {
  APPROVE: "Approve",
  REJECT: "Reject",
  ESCALATE: "Escalate",
};

export function TransactionDetail({
  transactionId,
}: {
  transactionId: string;
}) {
  const [transaction, setTransaction] = useState<TransactionSummary | null>(null);
  const [currentUser, setCurrentUser] = useState<DemoUser | null>(null);
  const [reason, setReason] = useState("");
  const [selectedAction, setSelectedAction] = useState<DecisionAction | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadTransaction = useCallback(async () => {
    setIsLoading(true);
    setError("");

    const [transactionResponse, meResponse] = await Promise.all([
      fetch(`/api/transactions/${transactionId}`),
      fetch("/api/me"),
    ]);

    if (!transactionResponse.ok) {
      setError(await readErrorMessage(transactionResponse));
      setIsLoading(false);
      return;
    }

    const transactionData: { transaction: TransactionSummary } =
      await transactionResponse.json();
    setTransaction(transactionData.transaction);

    if (meResponse.ok) {
      const meData: { user: DemoUser } = await meResponse.json();
      setCurrentUser(meData.user);
    }

    setIsLoading(false);
  }, [transactionId]);

  useEffect(() => {
    void loadTransaction();
  }, [loadTransaction]);

  async function confirmDecision() {
    if (!selectedAction) return;

    setIsSubmitting(true);
    setError("");
    setSuccess("");

    const response = await fetch(
      `/api/transactions/${transactionId}/decision`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: selectedAction, reason }),
      },
    );

    if (!response.ok) {
      setError(await readErrorMessage(response));
      setSelectedAction(null);
      setIsSubmitting(false);
      await loadTransaction();
      return;
    }

    setSuccess(
      `${actionLabels[selectedAction]} decision recorded with an audit event.`,
    );
    setReason("");
    setSelectedAction(null);
    setIsSubmitting(false);
    await loadTransaction();
  }

  if (isLoading) {
    return <div className="state-panel">Loading transaction details…</div>;
  }

  if (!transaction) {
    return (
      <div className="state-panel">
        <h1>Transaction unavailable</h1>
        <p>{error || "The requested transaction could not be loaded."}</p>
        <Link href="/" className="button button-primary">
          Return to queue
        </Link>
      </div>
    );
  }

  const canDecide =
    currentUser?.role === "OPERATIONS" && transaction.status === "FLAGGED";

  return (
    <section>
      <Link href="/" className="back-link">
        ← Back to transaction queue
      </Link>
      <div className="page-heading detail-heading">
        <div>
          <p className="eyebrow">Transaction review</p>
          <h1>{transaction.id}</h1>
          <p>Review the flagged payment and record an operational decision.</p>
        </div>
        <StatusBadge value={transaction.status} />
      </div>

      {success ? (
        <div className="feedback feedback-success">{success}</div>
      ) : null}
      {error ? <div className="feedback feedback-error">{error}</div> : null}

      <div className="detail-layout">
        <div className="detail-card">
          <h2>Transaction details</h2>
          <dl className="detail-grid">
            <div>
              <dt>Customer</dt>
              <dd>{transaction.customer.name}</dd>
            </div>
            <div>
              <dt>Account reference</dt>
              <dd>{transaction.customer.maskedAccountReference}</dd>
            </div>
            <div>
              <dt>Merchant</dt>
              <dd>{transaction.merchant}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{formatMoney(transaction.amountMinor, transaction.currency)}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>{transaction.currency}</dd>
            </div>
            <div>
              <dt>Payment method</dt>
              <dd>{transaction.paymentMethod}</dd>
            </div>
            <div>
              <dt>Risk level</dt>
              <dd>
                <StatusBadge value={transaction.riskLevel} kind="risk" />
              </dd>
            </div>
            <div>
              <dt>Transaction date</dt>
              <dd>{formatDateTime(transaction.createdAt)}</dd>
            </div>
            <div className="detail-wide">
              <dt>Flag reason</dt>
              <dd>{transaction.flagReason}</dd>
            </div>
          </dl>
        </div>

        <aside className="decision-card">
          <p className="eyebrow">Decision controls</p>
          <h2>Record a decision</h2>
          {currentUser?.role !== "OPERATIONS" ? (
            <div className="permission-note">
              Your {currentUser?.role ?? "current"} role can view this
              transaction but cannot make decisions.
            </div>
          ) : transaction.status !== "FLAGGED" ? (
            <div className="permission-note">
              This transaction is terminal. Further decisions will be rejected
              by the server.
            </div>
          ) : (
            <>
              <label htmlFor="decision-reason">Written reason</label>
              <textarea
                id="decision-reason"
                rows={5}
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain the evidence supporting this decision"
              />
              <p className="field-help">
                A non-empty reason is mandatory for every decision.
              </p>
              <div className="decision-actions">
                {(
                  ["APPROVE", "REJECT", "ESCALATE"] as DecisionAction[]
                ).map((action) => (
                  <button
                    key={action}
                    className={`button button-${action.toLowerCase()}`}
                    type="button"
                    disabled={!canDecide}
                    onClick={() => setSelectedAction(action)}
                  >
                    {actionLabels[action]}
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>

      {selectedAction ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <p className="eyebrow">Confirmation required</p>
            <h2 id="confirm-title">
              {actionLabels[selectedAction]} this transaction?
            </h2>
            <p>
              This changes the transaction to a terminal state and creates an
              audit event.
            </p>
            <div className="reason-preview">
              <strong>Reason</strong>
              <span>{reason.trim() || "No reason provided"}</span>
            </div>
            <div className="dialog-actions">
              <button
                className="button button-quiet"
                type="button"
                disabled={isSubmitting}
                onClick={() => setSelectedAction(null)}
              >
                Cancel
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={isSubmitting}
                onClick={() => void confirmDecision()}
              >
                {isSubmitting ? "Submitting…" : "Confirm decision"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
