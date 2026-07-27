import clsx from "clsx";
import type { PolicyStatus } from "@/lib/api";

const STYLES: Record<string, string> = {
  CREATED: "bg-outline-variant/30 text-on-surface-variant",
  ACTIVE: "bg-research-teal/15 text-trust-blue",
  CLAIM_SUBMITTED: "bg-alert-amber/15 text-alert-amber",
  EVALUATING: "bg-alert-amber/15 text-alert-amber",
  SETTLED_PASS: "bg-success-green/15 text-success-green",
  SETTLED_PARTIAL: "bg-success-green/10 text-success-green",
  SETTLED_FAIL: "bg-error-crimson/15 text-error-crimson",
  CANCELLED: "bg-outline-variant/30 text-on-surface-variant",
  EXPIRED_UNACCEPTED: "bg-outline-variant/30 text-on-surface-variant",
  EXPIRED_NO_CLAIM: "bg-outline-variant/30 text-on-surface-variant",
};

const LABELS: Record<string, string> = {
  CREATED: "Awaiting Researcher",
  ACTIVE: "Active",
  CLAIM_SUBMITTED: "Claim Filed",
  EVALUATING: "Evaluating",
  SETTLED_PASS: "Coverage Paid",
  SETTLED_PARTIAL: "Partial Payout",
  SETTLED_FAIL: "Claim Denied",
  CANCELLED: "Cancelled",
  EXPIRED_UNACCEPTED: "Expired (Unaccepted)",
  EXPIRED_NO_CLAIM: "Expired (No Claim)",
};

export function StatusChip({ status }: { status: PolicyStatus | string }) {
  return (
    <span
      className={clsx(
        "inline-block px-2 py-0.5 rounded text-label-xs font-medium",
        STYLES[status] ?? STYLES.CREATED
      )}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
