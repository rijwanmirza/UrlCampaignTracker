import { Link, useLocation } from "wouter";
import { Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Navbar() {
  const [location] = useLocation();
  
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
      <div className="flex h-14 items-center px-4">
        <div className="flex items-center mr-4">
          <Link href="/" className="flex items-center">
            <Link2 className="h-5 w-5 text-primary mr-2" />
            <span className="font-bold text-lg">URL Redirector</span>
          </Link>
        </div>
        
        <nav className="flex border-l h-full ml-2">
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
      </div>
    </header>
  );
}