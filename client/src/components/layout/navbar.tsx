import { Link, useLocation } from "wouter";
import { Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

export default function Navbar() {
  const [location] = useLocation();
  const isMobile = useIsMobile();

  return (
    <header className="w-full bg-[#121c2e] text-white">
      {/* Top bar with logo */}
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center">
          <Link href="/" className="flex items-center">
            <Link2 className="h-5 w-5 mr-2" />
            <span className="font-bold text-lg">URL Redirector</span>
          </Link>
        </div>
      </div>
      
      {/* Main Menu Bar - exactly like in screenshot */}
      <div className="bg-white text-black flex justify-center border-b">
        <div className="container flex justify-between max-w-screen-md">
          <Link 
            href="/campaigns"
            className={cn(
              "flex items-center justify-center px-6 py-3 border-b-2 font-medium transition-colors flex-1",
              location.startsWith("/campaigns") 
                ? "text-primary border-primary" 
                : "border-transparent text-gray-600"
            )}
          >
            <span className="flex flex-col items-center gap-1">
              <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="7" height="7" x="3" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="14" rx="1" />
                <rect width="7" height="7" x="3" y="14" rx="1" />
              </svg>
              Campaigns
            </span>
          </Link>
          
          <Link 
            href="/urls"
            className={cn(
              "flex items-center justify-center px-6 py-3 border-b-2 font-medium transition-colors flex-1",
              location.startsWith("/urls") 
                ? "text-primary border-primary" 
                : "border-transparent text-gray-600"
            )}
          >
            <span className="flex flex-col items-center gap-1">
              <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              URL History
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}