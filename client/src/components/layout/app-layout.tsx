import React from "react";
import { useLocation } from "wouter";
import Navbar from "./navbar";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  
  // Only show the navbar on specific pages (campaigns and urls)
  const showNavbar = location === "/campaigns" || 
                     location === "/urls" || 
                     location.startsWith("/campaigns/");
  
  return (
    <div className="min-h-screen flex flex-col">
      {showNavbar && <Navbar />}
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}