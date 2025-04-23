import { Link, useLocation } from "wouter";
import { Link2, Menu, X } from "lucide-react";
import { FaLink, FaHistory } from "react-icons/fa";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState, useEffect } from "react";

export default function Navbar() {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
      {/* Top navigation bar */}
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center">
          <Link href="/" className="flex items-center">
            <Link2 className="h-5 w-5 text-primary mr-2" />
            <span className="font-bold text-lg">URL Redirector</span>
          </Link>
        </div>
        
        {isMobile ? (
          // Mobile menu button
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        ) : (
          // Desktop navigation
          <nav className="flex border-l h-full">
            <Link 
              href="/campaigns"
              className={cn(
                "flex h-full px-4 items-center border-b-2 font-medium transition-colors",
                location.startsWith("/campaigns") 
                  ? "text-primary border-primary" 
                  : "border-transparent hover:text-foreground/80"
              )}
            >
              <span className="flex gap-1 items-center">
                <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                "flex h-full px-4 items-center border-b-2 font-medium transition-colors",
                location.startsWith("/urls") 
                  ? "text-primary border-primary" 
                  : "border-transparent hover:text-foreground/80"
              )}
            >
              <span className="flex gap-1 items-center">
                <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                URL History
              </span>
            </Link>
          </nav>
        )}
      </div>

      {/* Mobile menu - similar to the screenshot */}
      {isMobile && mobileMenuOpen && (
        <div className="border-t bg-background">
          <nav className="flex flex-col px-2 py-3">
            <Link 
              href="/campaigns"
              className={cn(
                "flex items-center px-4 py-3 rounded-md font-medium transition-colors",
                location.startsWith("/campaigns") 
                  ? "bg-primary/10 text-primary" 
                  : "hover:bg-muted"
              )}
            >
              <FaLink className="mr-3 h-5 w-5" />
              <span>Campaigns</span>
            </Link>
            <Link 
              href="/urls"
              className={cn(
                "flex items-center px-4 py-3 rounded-md font-medium transition-colors",
                location.startsWith("/urls") 
                  ? "bg-primary/10 text-primary" 
                  : "hover:bg-muted"
              )}
            >
              <FaHistory className="mr-3 h-5 w-5" />
              <span>URL History</span>
            </Link>
          </nav>
        </div>
      )}
      
      {/* Mobile top tabs (when menu is closed) */}
      {isMobile && !mobileMenuOpen && (
        <div className="px-2 pb-1 flex space-x-2 overflow-x-auto">
          <Link 
            href="/campaigns"
            className={cn(
              "flex items-center px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap",
              location.startsWith("/campaigns") 
                ? "bg-primary text-white" 
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            )}
          >
            <FaLink className="mr-1.5 h-3.5 w-3.5" />
            Campaigns
          </Link>
          <Link 
            href="/urls"
            className={cn(
              "flex items-center px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap",
              location.startsWith("/urls") 
                ? "bg-primary text-white" 
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            )}
          >
            <FaHistory className="mr-1.5 h-3.5 w-3.5" />
            URL History
          </Link>
        </div>
      )}
    </header>
  );
}