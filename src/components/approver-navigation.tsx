"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DemoUser } from "@/shared/api-types";

export function ApproverNavigation() {
  const [isApprover, setIsApprover] = useState(false);

  useEffect(() => {
    async function loadRole() {
      const response = await fetch("/api/me");

      if (!response.ok) return;

      const data: { user: DemoUser } = await response.json();
      setIsApprover(data.user.role === "APPROVER");
    }

    void loadRole();
  }, []);

  return isApprover ? <Link href="/approvals">Pending approvals</Link> : null;
}
