import { Link, useLocation } from "wouter";
import { Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Navbar() {
  const [location] = useLocation();

  return (
    <header className="w-full bg-white">
      {/* Top bar with logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b">
        <div className="flex items-center">
          <Link href="/" className="flex items-center">
            <Link2 className="h-5 w-5 mr-2" />
            <span className="font-bold text-lg">URL Redirector</span>
          </Link>
        </div>
      </div>
      
      {/* Tab Menu Bar - EXACTLY like in screenshot */}
      <div className="flex border-b overflow-x-auto">
        <Link 
          href="/campaigns"
          className={cn(
            "flex-1 py-3 border-b-2 text-center font-medium transition-colors",
            location.startsWith("/campaigns") 
              ? "border-primary" 
              : "border-transparent"
          )}
        >
          <div className="flex items-center justify-center">
            <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="7" height="7" x="3" y="3" rx="1" />
              <rect width="7" height="7" x="14" y="3" rx="1" />
              <rect width="7" height="7" x="14" y="14" rx="1" />
              <rect width="7" height="7" x="3" y="14" rx="1" />
            </svg>
            Campaigns
          </div>
        </Link>
        
        <Link 
          href="/urls"
          className={cn(
            "flex-1 py-3 border-b-2 text-center font-medium transition-colors",
            location.startsWith("/urls") 
              ? "border-primary" 
              : "border-transparent"
          )}
        >
          <div className="flex items-center justify-center">
            <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            URL History
          </div>
        </Link>
      </div>
    </header>
  );
}