import { Link, useLocation } from "wouter";
import { Link2 } from "lucide-react";

export default function Navbar() {
  const [location] = useLocation();

  // Which tab is active
  const campaignsActive = location.startsWith("/campaigns") || location === "/";
  const urlsActive = location.startsWith("/urls");

  return (
    <header className="w-full">
      {/* Top header with logo */}
      <div className="flex h-14 items-center px-4 border-b bg-white">
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5" />
          <span className="font-bold text-lg">URL Redirector</span>
        </div>
      </div>
      
      {/* Tab navigation - EXACT MATCH to screenshot */}
      <div className="flex border-b bg-white">
        <Link href="/campaigns" className="flex-1">
          <div className="flex justify-center items-center py-3">
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="6" height="6" x="4" y="4" rx="1" stroke="currentColor" strokeWidth="2" />
              <rect width="6" height="6" x="14" y="4" rx="1" stroke="currentColor" strokeWidth="2" />
              <rect width="6" height="6" x="4" y="14" rx="1" stroke="currentColor" strokeWidth="2" />
              <rect width="6" height="6" x="14" y="14" rx="1" stroke="currentColor" strokeWidth="2" />
            </svg>
            Campaigns
          </div>
          {campaignsActive && <div className="h-0.5 bg-primary" />}
        </Link>
        
        <Link href="/urls" className="flex-1">
          <div className="flex justify-center items-center py-3">
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            URL History
          </div>
          {urlsActive && <div className="h-0.5 bg-primary" />}
        </Link>
      </div>
    </header>
  );
}