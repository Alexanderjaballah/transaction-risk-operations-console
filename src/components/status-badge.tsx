interface StatusBadgeProps {
  value: string;
  kind?: "status" | "risk" | "outcome";
}

export function StatusBadge({ value, kind = "status" }: StatusBadgeProps) {
  return (
    <span className={`badge badge-${kind} badge-${value.toLowerCase()}`}>
      {value}
    </span>
  );
}
