import Link from "next/link";
import { ApproverNavigation } from "@/components/approver-navigation";
import { DemoIdentitySelector } from "@/components/demo-identity-selector";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-main">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            TR
          </span>
          <span>
            <strong>Transaction Review</strong>
            <small>Risk Operations Console</small>
          </span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/">Transaction queue</Link>
          <ApproverNavigation />
          <Link href="/audit">Audit trail</Link>
        </nav>
      </div>
      <DemoIdentitySelector />
    </header>
  );
}
