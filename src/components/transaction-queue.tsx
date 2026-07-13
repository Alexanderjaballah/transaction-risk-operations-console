"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { readErrorMessage } from "@/shared/api";
import type { TransactionSummary } from "@/shared/api-types";
import { formatDateTime, formatMoney } from "@/shared/format";

interface QueueResponse {
  transactions: TransactionSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface QueueQuery {
  page: number;
  risk: string;
  search: string;
  status: string;
}

type QueueLoadResult =
  | { kind: "success"; data: QueueResponse }
  | { kind: "error"; message: string }
  | { kind: "aborted" };

const initialData: QueueResponse = {
  transactions: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
};

export async function loadTransactions(
  query: QueueQuery,
  signal: AbortSignal,
): Promise<QueueLoadResult> {
  const params = new URLSearchParams({ page: String(query.page) });

  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  if (query.risk) params.set("risk", query.risk);

  try {
    const response = await fetch(`/api/transactions?${params}`, { signal });

    if (signal.aborted) {
      return { kind: "aborted" };
    }

    if (!response.ok) {
      return { kind: "error", message: await readErrorMessage(response) };
    }

    const data: QueueResponse = await response.json();
    return signal.aborted
      ? { kind: "aborted" }
      : { kind: "success", data };
  } catch (error) {
    if (
      signal.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      return { kind: "aborted" };
    }

    return { kind: "error", message: "Unable to load transactions." };
  }
}

export function TransactionQueue() {
  const [data, setData] = useState(initialData);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [risk, setRisk] = useState("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function refreshTransactions() {
      setIsLoading(true);
      setError("");
      const result = await loadTransactions(
        { page, risk, search, status },
        controller.signal,
      );

      if (controller.signal.aborted || result.kind === "aborted") {
        return;
      }

      if (result.kind === "error") {
        setError(result.message);
      } else {
        setData(result.data);
      }

      setIsLoading(false);
    }

    void refreshTransactions();
    return () => controller.abort();
  }, [page, risk, search, status]);

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  }

  function resetFilters() {
    setSearchDraft("");
    setSearch("");
    setStatus("");
    setRisk("");
    setPage(1);
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Manual review queue</p>
          <h1>Flagged transactions</h1>
          <p>
            Review synthetic transactions selected for operational assessment.
          </p>
        </div>
        <div className="record-count">
          <strong>{data.total}</strong>
          <span>matching records</span>
        </div>
      </div>

      <form className="filter-panel" onSubmit={applySearch}>
        <div className="search-field">
          <label htmlFor="search">Search</label>
          <div>
            <input
              id="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Transaction ID, customer, or merchant"
            />
            <button className="button button-primary" type="submit">
              Search
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="status">Status</label>
          <select
            id="status"
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
          >
            <option value="">All statuses</option>
            <option value="FLAGGED">Flagged</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="ESCALATED">Escalated</option>
          </select>
        </div>
        <div>
          <label htmlFor="risk">Risk</label>
          <select
            id="risk"
            value={risk}
            onChange={(event) => {
              setPage(1);
              setRisk(event.target.value);
            }}
          >
            <option value="">All risk levels</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>
        <button className="button button-quiet" type="button" onClick={resetFilters}>
          Clear
        </button>
      </form>

      {error ? <div className="feedback feedback-error">{error}</div> : null}

      <div className="table-card" aria-busy={isLoading}>
        {isLoading ? (
          <div className="state-panel">Loading transactions…</div>
        ) : data.transactions.length === 0 ? (
          <div className="state-panel">
            <h2>No matching transactions</h2>
            <p>Adjust the search or filters and try again.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Customer</th>
                  <th>Merchant</th>
                  <th>Amount</th>
                  <th>Risk</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>
                      <Link
                        className="transaction-link"
                        href={`/transactions/${transaction.id}`}
                      >
                        {transaction.id}
                      </Link>
                    </td>
                    <td>{transaction.customer.name}</td>
                    <td>{transaction.merchant}</td>
                    <td>{formatMoney(transaction.amountMinor, transaction.currency)}</td>
                    <td>
                      <StatusBadge value={transaction.riskLevel} kind="risk" />
                    </td>
                    <td>
                      <StatusBadge value={transaction.status} />
                    </td>
                    <td>{formatDateTime(transaction.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="pagination" aria-label="Transaction pages">
        <button
          className="button button-quiet"
          type="button"
          disabled={page <= 1 || isLoading}
          onClick={() => setPage((current) => current - 1)}
        >
          Previous
        </button>
        <span>
          Page {data.page} of {data.totalPages}
        </span>
        <button
          className="button button-quiet"
          type="button"
          disabled={page >= data.totalPages || isLoading}
          onClick={() => setPage((current) => current + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}
