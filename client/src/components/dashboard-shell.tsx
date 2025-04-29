import { ReactNode } from "react";

interface DashboardShellProps {
  children: ReactNode;
  className?: string;
}

export function DashboardShell({
  children,
  className,
}: DashboardShellProps) {
  return (
    <div className="flex-1 space-y-6 px-4 py-6 md:px-6 md:py-8">
      {children}
    </div>
  );
}