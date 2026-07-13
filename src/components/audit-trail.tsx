"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { readErrorMessage } from "@/shared/api";
import type { AuditEvent } from "@/shared/api-types";
import { formatDateTime } from "@/shared/format";

export function AuditTrail() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadEvents() {
      const response = await fetch("/api/audit-events");

      if (!response.ok) {
        setError(await readErrorMessage(response));
        setIsLoading(false);
        return;
      }

      const data: { events: AuditEvent[] } = await response.json();
      setEvents(data.events);
      setIsLoading(false);
    }

    void loadEvents();
  }, []);

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Approver access</p>
          <h1>Complete audit trail</h1>
          <p>Append-only prototype audit trail.</p>
        </div>
      </div>

      {error ? <div className="feedback feedback-error">{error}</div> : null}

      <div className="table-card">
        {isLoading ? (
          <div className="state-panel">Loading audit events…</div>
        ) : error ? null : events.length === 0 ? (
          <div className="state-panel">
            <h2>No audit events</h2>
            <p>Decision and denied-access events will appear here.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>State</th>
                  <th>Outcome</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDateTime(event.createdAt)}</td>
                    <td>
                      {event.actorName}
                      <small className="table-secondary">{event.actorRole}</small>
                    </td>
                    <td>{event.action}</td>
                    <td>{event.resourceId}</td>
                    <td>
                      {event.previousState ?? "—"} → {event.newState ?? "—"}
                    </td>
                    <td>
                      <StatusBadge value={event.outcome} kind="outcome" />
                    </td>
                    <td>{event.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
