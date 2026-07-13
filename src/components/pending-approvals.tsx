"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { readErrorMessage } from "@/shared/api";
import type { ApprovalRequest } from "@/shared/api-types";
import { formatDateTime, formatMoney } from "@/shared/format";

type CompletionAction = "APPROVE" | "VETO";

export function PendingApprovals() {
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>(
    [],
  );
  const [selected, setSelected] = useState<ApprovalRequest | null>(null);
  const [completionAction, setCompletionAction] =
    useState<CompletionAction | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function loadApprovals() {
      const response = await fetch("/api/approvals");

      if (!response.ok) {
        setError(await readErrorMessage(response));
        setIsLoading(false);
        return;
      }

      const data: { approvalRequests: ApprovalRequest[] } =
        await response.json();
      setApprovalRequests(data.approvalRequests);
      setIsLoading(false);
    }

    void loadApprovals();
  }, []);

  async function confirmCompletion() {
    if (!selected || !completionAction) return;

    setIsSubmitting(true);
    setError("");
    setSuccess("");

    const response = await fetch(
      `/api/approvals/${selected.id}/complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: completionAction,
          reason: reviewReason,
        }),
      },
    );

    if (!response.ok) {
      setError(await readErrorMessage(response));
      setCompletionAction(null);
      setIsSubmitting(false);
      return;
    }

    const data: {
      approvalRequest: Pick<
        ApprovalRequest,
        | "id"
        | "status"
        | "activeTransactionId"
        | "reviewedById"
        | "reviewedByName"
        | "reviewedByRole"
        | "reviewReason"
        | "reviewedAt"
      >;
      transaction: {
        status: ApprovalRequest["transaction"]["status"];
        updatedAt: string;
      };
    } = await response.json();

    const completed: ApprovalRequest = {
      ...selected,
      ...data.approvalRequest,
      transaction: {
        ...selected.transaction,
        status: data.transaction.status,
        updatedAt: data.transaction.updatedAt,
      },
    };
    setSelected(completed);
    setApprovalRequests((requests) =>
      requests.filter((request) => request.id !== selected.id),
    );
    setSuccess(
      completionAction === "APPROVE"
        ? `Request approved. ${selected.transactionId} is now ${data.transaction.status}.`
        : `Request vetoed. ${selected.transactionId} remains ${data.transaction.status}.`,
    );
    setReviewReason("");
    setCompletionAction(null);
    setIsSubmitting(false);
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Approver access</p>
          <h1>Pending approvals</h1>
          <p>
            Review high-value transaction decisions using the maker-checker
            control.
          </p>
        </div>
        <div className="record-count">
          <strong>{approvalRequests.length}</strong>
          <span>pending requests</span>
        </div>
      </div>

      {success ? (
        <div className="feedback feedback-success">{success}</div>
      ) : null}
      {error ? <div className="feedback feedback-error">{error}</div> : null}

      <div className="table-card">
        {isLoading ? (
          <div className="state-panel">Loading pending approvals…</div>
        ) : error && approvalRequests.length === 0 ? null : approvalRequests.length ===
          0 ? (
          <div className="state-panel">
            <h2>No pending approvals</h2>
            <p>High-value Operations requests will appear here.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Transaction</th>
                  <th>Customer / merchant</th>
                  <th>Amount</th>
                  <th>Current state</th>
                  <th>Requested</th>
                  <th>Requester</th>
                  <th>Request reason</th>
                  <th>Requested at</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {approvalRequests.map((request) => (
                  <tr key={request.id}>
                    <td>{request.id}</td>
                    <td>
                      <Link
                        className="transaction-link"
                        href={`/transactions/${request.transactionId}`}
                      >
                        {request.transactionId}
                      </Link>
                    </td>
                    <td>
                      {request.transaction.customer.name}
                      <small className="table-secondary">
                        {request.transaction.merchant}
                      </small>
                    </td>
                    <td>
                      {formatMoney(
                        request.transaction.amountMinor,
                        request.transaction.currency,
                      )}
                      <small className="table-secondary">
                        {request.transaction.currency}
                      </small>
                    </td>
                    <td>
                      <StatusBadge value={request.transaction.status} />
                    </td>
                    <td>
                      {request.requestedAction}
                      <small className="table-secondary">
                        Target: {request.requestedTargetState}
                      </small>
                    </td>
                    <td>{request.requestedByName}</td>
                    <td className="reason-cell">{request.requestReason}</td>
                    <td>{formatDateTime(request.createdAt)}</td>
                    <td>
                      <StatusBadge value={request.status} kind="outcome" />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => {
                          setSelected(request);
                          setError("");
                          setSuccess("");
                        }}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected ? (
        <div className="approval-review detail-layout">
          <div className="detail-card">
            <div className="approval-review-heading">
              <div>
                <p className="eyebrow">Approval request</p>
                <h2>{selected.id}</h2>
              </div>
              <StatusBadge value={selected.status} kind="outcome" />
            </div>
            <dl className="detail-grid">
              <div>
                <dt>Transaction</dt>
                <dd>{selected.transactionId}</dd>
              </div>
              <div>
                <dt>Current state</dt>
                <dd>{selected.transaction.status}</dd>
              </div>
              <div>
                <dt>Customer</dt>
                <dd>{selected.transaction.customer.name}</dd>
              </div>
              <div>
                <dt>Account reference</dt>
                <dd>
                  {selected.transaction.customer.maskedAccountReference}
                </dd>
              </div>
              <div>
                <dt>Merchant</dt>
                <dd>{selected.transaction.merchant}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>
                  {formatMoney(
                    selected.transaction.amountMinor,
                    selected.transaction.currency,
                  )}
                </dd>
              </div>
              <div>
                <dt>Requested action</dt>
                <dd>{selected.requestedAction}</dd>
              </div>
              <div>
                <dt>Requested target state</dt>
                <dd>{selected.requestedTargetState}</dd>
              </div>
              <div>
                <dt>Requester</dt>
                <dd>{selected.requestedByName}</dd>
              </div>
              <div>
                <dt>Requested at</dt>
                <dd>{formatDateTime(selected.createdAt)}</dd>
              </div>
              <div className="detail-wide">
                <dt>Request reason</dt>
                <dd>{selected.requestReason}</dd>
              </div>
            </dl>
          </div>

          <aside className="decision-card">
            <p className="eyebrow">Checker decision</p>
            <h2>Complete this request</h2>
            {selected.status !== "PENDING" ? (
              <div className="permission-note">
                This request is {selected.status}. It cannot be processed again.
              </div>
            ) : (
              <>
                <label htmlFor="review-reason">Review reason</label>
                <textarea
                  id="review-reason"
                  rows={5}
                  maxLength={1000}
                  value={reviewReason}
                  onChange={(event) => setReviewReason(event.target.value)}
                  placeholder="Explain the checker decision"
                />
                <p className="field-help">
                  A non-empty reason is mandatory for approval and veto.
                </p>
                <div className="approval-actions">
                  <button
                    type="button"
                    className="button button-approve"
                    onClick={() => setCompletionAction("APPROVE")}
                  >
                    Approve request
                  </button>
                  <button
                    type="button"
                    className="button button-reject"
                    onClick={() => setCompletionAction("VETO")}
                  >
                    Veto request
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      ) : null}

      {completionAction && selected ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-confirm-title"
          >
            <p className="eyebrow">Confirmation required</p>
            <h2 id="approval-confirm-title">
              {completionAction === "APPROVE"
                ? "Approve this request?"
                : "Veto this request?"}
            </h2>
            <p>
              {completionAction === "APPROVE"
                ? `This will change ${selected.transactionId} to ${selected.requestedTargetState}.`
                : `This will leave ${selected.transactionId} FLAGGED.`}
            </p>
            <div className="reason-preview">
              <strong>Review reason</strong>
              <span>{reviewReason.trim() || "No reason provided"}</span>
            </div>
            <div className="dialog-actions">
              <button
                className="button button-quiet"
                type="button"
                disabled={isSubmitting}
                onClick={() => setCompletionAction(null)}
              >
                Cancel
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={isSubmitting}
                onClick={() => void confirmCompletion()}
              >
                {isSubmitting ? "Submitting…" : "Confirm checker decision"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
