"use client";

import { useEffect, useState } from "react";
import type { DemoUser } from "@/shared/api-types";

export function DemoIdentitySelector() {
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [currentUser, setCurrentUser] = useState<DemoUser | null>(null);
  const [message, setMessage] = useState("");
  const [isChanging, setIsChanging] = useState(false);

  useEffect(() => {
    async function loadIdentityData() {
      const [usersResponse, meResponse] = await Promise.all([
        fetch("/api/demo-session"),
        fetch("/api/me"),
      ]);

      if (usersResponse.ok) {
        const data: { users: DemoUser[] } = await usersResponse.json();
        setUsers(data.users);
      }

      if (meResponse.ok) {
        const data: { user: DemoUser } = await meResponse.json();
        setCurrentUser(data.user);
      }
    }

    void loadIdentityData();
  }, []);

  async function changeIdentity(userId: string) {
    setIsChanging(true);
    setMessage("");

    const response = await fetch("/api/demo-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      setMessage("The demo identity could not be changed.");
      setIsChanging(false);
      return;
    }

    window.location.reload();
  }

  return (
    <section className="identity-panel" aria-labelledby="identity-heading">
      <div>
        <p className="eyebrow" id="identity-heading">
          Demo identity
        </p>
        <p className="identity-warning">
          Unsigned, server-validated demo identity selector. Anyone with access
          can choose any seeded identity; this is not authentication.
        </p>
      </div>
      <div className="identity-control">
        <label htmlFor="demo-user">Acting as</label>
        <select
          id="demo-user"
          value={currentUser?.id ?? ""}
          disabled={isChanging}
          onChange={(event) => void changeIdentity(event.target.value)}
        >
          <option value="" disabled>
            Select a demo user
          </option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} — {user.role}
            </option>
          ))}
        </select>
        {message ? <p className="inline-error">{message}</p> : null}
      </div>
    </section>
  );
}
