type StatusPillProps = {
  tone: "available" | "unavailable" | "neutral";
  children: React.ReactNode;
};

export function StatusPill({ tone, children }: StatusPillProps) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}
