import { Link, useLocation } from "wouter";
import { Link2 } from "lucide-react";

export default function Navbar() {
  const [location] = useLocation();
  const campaignsActive = location.startsWith("/campaigns");
  const urlsActive = location.startsWith("/urls");

  return (
    <div className="w-full">
      {/* Header with logo */}
      <div className="border-b">
        <div className="py-4 px-4">
          <Link2 className="inline-block align-middle mr-2" />
          <span className="font-bold text-lg align-middle">URL Redirector</span>
        </div>
      </div>
      
      {/* Tab navigation exactly like image */}
      <div className="flex border-b">
        <Link href="/campaigns" className="w-1/2 text-center">
          <div className={`py-3 ${campaignsActive ? "border-b-2 border-primary" : ""}`}>
            <div className="inline-flex items-center">
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="7" height="7" x="3" y="3" rx="1" stroke="currentColor" strokeWidth="2" />
                <rect width="7" height="7" x="14" y="3" rx="1" stroke="currentColor" strokeWidth="2" />
                <rect width="7" height="7" x="14" y="14" rx="1" stroke="currentColor" strokeWidth="2" />
                <rect width="7" height="7" x="3" y="14" rx="1" stroke="currentColor" strokeWidth="2" />
              </svg>
              Campaigns
            </div>
          </div>
        </Link>
        
        <Link href="/urls" className="w-1/2 text-center">
          <div className={`py-3 ${urlsActive ? "border-b-2 border-primary" : ""}`}>
            <div className="inline-flex items-center">
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              URL History
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}