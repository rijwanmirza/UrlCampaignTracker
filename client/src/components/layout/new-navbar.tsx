import { Link, useLocation } from "wouter";
import { Link2, Menu } from "lucide-react";
import { useEffect, useState } from "react";

export default function Navbar() {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  
  // Toggle hamburger menu
  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  // Header with hamburger menu button
  const TopHeader = () => (
    <div className="w-full border-b bg-white">
      <div className="py-4 px-4 flex justify-between items-center">
        <div className="flex items-center">
          <Link2 className="inline-block align-middle mr-2" />
          <span className="font-bold text-lg align-middle">URL Redirector</span>
        </div>
        
        {/* Hamburger Menu Button */}
        <button 
          onClick={toggleMenu}
          className="p-2 focus:outline-none"
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>
    </div>
  );

  // Hamburger menu dropdown
  const HamburgerMenu = () => (
    <div className={`absolute top-[60px] left-0 right-0 bg-white z-50 shadow-md transition-all duration-300 ${menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="py-2 px-4">
        <Link 
          href="/campaigns" 
          className="block py-3 border-b"
          onClick={() => setMenuOpen(false)}
        >
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="7" height="7" x="3" y="3" rx="1" stroke="currentColor" strokeWidth="2" />
              <rect width="7" height="7" x="14" y="3" rx="1" stroke="currentColor" strokeWidth="2" />
              <rect width="7" height="7" x="14" y="14" rx="1" stroke="currentColor" strokeWidth="2" />
              <rect width="7" height="7" x="3" y="14" rx="1" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span className="font-medium">Campaigns</span>
          </div>
        </Link>
        
        <Link 
          href="/urls" 
          className="block py-3 border-b"
          onClick={() => setMenuOpen(false)}
        >
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-medium">URL History</span>
          </div>
        </Link>
        
        <Link 
          href="/original-clicks" 
          className="block py-3 border-b"
          onClick={() => setMenuOpen(false)}
        >
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="14" cy="10" r="2" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span className="font-medium">Original Click Values</span>
          </div>
        </Link>
        
        {/* Add more menu items here as needed */}
        <Link 
          href="/gmail-settings" 
          className="block py-3 border-b"
          onClick={() => setMenuOpen(false)}
        >
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M22 6l-10 7L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="font-medium">Gmail Settings</span>
          </div>
        </Link>
        
        <Link 
          href="/system-settings" 
          className="block py-3 border-b"
          onClick={() => setMenuOpen(false)}
        >
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="font-medium">System Settings</span>
          </div>
        </Link>
        
        <Link 
          href="/trafficstar" 
          className="block py-3 border-b"
          onClick={() => setMenuOpen(false)}
        >
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 3v3m0 15v-3M9 12H3m18 0h-3M5.636 5.636l2.12 2.12m8.486 8.486l2.12 2.12M5.636 18.364l2.12-2.12m8.486-8.486l2.12-2.12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span className="font-medium">TrafficStar API</span>
          </div>
        </Link>
        
        <Link 
          href="/redirect-test" 
          className="block py-3 border-b"
          onClick={() => setMenuOpen(false)}
        >
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M17 8l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="font-medium">Redirect Test</span>
          </div>
        </Link>
        
        <Link 
          href="/test-spent-value" 
          className="block py-3 border-b"
          onClick={() => setMenuOpen(false)}
        >
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5l6.74-6.76z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="16" y1="8" x2="2" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="17.5" y1="15" x2="9" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="font-medium">Auto-Management Test</span>
          </div>
        </Link>
        
        <div className="block py-3 border-b text-gray-400 cursor-not-allowed">
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="font-medium">Help & Support</span>
          </div>
        </div>
      </div>
    </div>
  );

  // Background overlay for when menu is open
  const MenuOverlay = () => (
    <div 
      className={`fixed inset-0 bg-black transition-opacity duration-300 ${menuOpen ? 'opacity-30' : 'opacity-0 pointer-events-none'}`}
      onClick={() => setMenuOpen(false)}
    />
  );

  // Add/remove body scroll when menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);
  
  return (
    <>
      <div className="w-full relative">
        <TopHeader />
        <HamburgerMenu />
        <MenuOverlay />
      </div>
    </>
  );
}