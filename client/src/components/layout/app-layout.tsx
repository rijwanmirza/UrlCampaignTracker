import React from "react";
import NewNavbar from "./new-navbar";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  // Always show navbar - it's the main navigation
  return (
    <div className="min-h-screen flex flex-col">
      <NewNavbar />
      <div className="flex-1 flex flex-col overflow-y-auto">{children}</div>
    </div>
  );
}