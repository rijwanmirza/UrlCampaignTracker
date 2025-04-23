import { Link, useLocation } from "wouter";
import { Link2 } from "lucide-react";
import { useEffect } from "react";

export default function Navbar() {
  const [location] = useLocation();
  const campaignsActive = location.startsWith("/campaigns") || location === "/";
  const urlsActive = location.startsWith("/urls");

  // First part - top header with URL Redirector text
  const TopHeader = () => (
    <div className="w-full border-b">
      <div className="py-4 px-4">
        <Link2 className="inline-block align-middle mr-2" />
        <span className="font-bold text-lg align-middle">URL Redirector</span>
      </div>
    </div>
  );

  // Second part - tab menu with two icons
  const TabMenu = () => (
    <div className="flex border-b bg-white">
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
  );
  
  // Third part - Bottom mobile navigation like in your screenshot
  const BottomMobileNav = () => (
    <div className="fixed bottom-0 left-0 right-0 bg-[#121c2e] text-white h-16 flex items-center justify-center">
      <div className="flex space-x-6">
        {/* Screen/Monitor icon */}
        <Link href="/campaigns" className="flex flex-col items-center justify-center">
          <div className={`flex flex-col items-center w-12 ${campaignsActive ? "text-white" : "text-gray-400"}`}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
        </Link>
        
        {/* Grid/Apps icon */}
        <Link href="/urls" className="flex flex-col items-center justify-center">
          <div className={`flex flex-col items-center w-12 ${urlsActive ? "text-white" : "text-gray-400"}`}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="4" height="4" />
              <rect x="10" y="3" width="4" height="4" />
              <rect x="17" y="3" width="4" height="4" />
              <rect x="3" y="10" width="4" height="4" />
              <rect x="10" y="10" width="4" height="4" />
              <rect x="17" y="10" width="4" height="4" />
              <rect x="3" y="17" width="4" height="4" />
              <rect x="10" y="17" width="4" height="4" />
              <rect x="17" y="17" width="4" height="4" />
            </svg>
          </div>
        </Link>
        
        {/* Tree icon */}
        <div className="flex flex-col items-center justify-center cursor-not-allowed">
          <div className="flex flex-col items-center w-12 text-gray-400">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z" />
            </svg>
          </div>
        </div>
        
        {/* Right arrow icon */}
        <div className="flex flex-col items-center justify-center cursor-not-allowed">
          <div className="flex flex-col items-center w-12 text-gray-400">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );

  // Add space at the bottom to account for the fixed bottom nav
  useEffect(() => {
    document.body.style.paddingBottom = '4rem';
    return () => {
      document.body.style.paddingBottom = '0';
    };
  }, []);

  return (
    <>
      <div className="w-full">
        <TopHeader />
        <TabMenu />
      </div>
      <BottomMobileNav />
    </>
  );
}