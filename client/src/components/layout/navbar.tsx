import { Link, useLocation } from "wouter";
import { Link2, Menu, ChevronDown, ChevronUp, LogOut } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function Navbar() {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { logout } = useAuth();
  const [, navigate] = useLocation();
  
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

  // State for scrolling
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  
  // References for menu container
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Check if scroll buttons should be shown
  useEffect(() => {
    if (menuOpen && menuRef.current) {
      const checkScrollNeeded = () => {
        if (!menuRef.current) return;
        const containerHeight = menuRef.current.clientHeight;
        const scrollHeight = menuRef.current.scrollHeight;
        setShowScrollButtons(scrollHeight > containerHeight);
      };
      
      // Initial check
      checkScrollNeeded();
      
      // Check again after a slight delay to ensure all content is rendered
      setTimeout(checkScrollNeeded, 100);
      
      // Add window resize listener
      window.addEventListener('resize', checkScrollNeeded);
      return () => window.removeEventListener('resize', checkScrollNeeded);
    }
  }, [menuOpen]);
  
  // Scroll up
  const scrollUp = () => {
    if (menuRef.current) {
      // Scroll up by 200px at a time
      menuRef.current.scrollBy({
        top: -200,
        behavior: 'auto'
      });
    }
  };
  
  // Scroll down
  const scrollDown = () => {
    if (menuRef.current) {
      // Scroll down by 200px at a time
      menuRef.current.scrollBy({
        top: 200,
        behavior: 'auto'
      });
    }
  };

  // Hamburger menu dropdown
  const HamburgerMenu = () => (
    <div className={`absolute top-[60px] left-0 right-0 bg-white z-50 shadow-md transition-all duration-300 ${menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      {/* Scroll up button */}
      {showScrollButtons && (
        <div 
          className="sticky top-0 w-full bg-white py-2 border-b text-center cursor-pointer z-10 shadow-sm hover:bg-gray-100 transition-colors"
          onClick={scrollUp}
        >
          <div className="flex items-center justify-center">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              className="inline-block text-primary"
            >
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
            <span className="ml-1 text-xs text-gray-500">Scroll up</span>
          </div>
        </div>
      )}
      
      <div 
        ref={menuRef} 
        className="py-2 px-4 max-h-[70vh] overflow-y-auto"
      >
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
          href="/original-url-records" 
          className="block py-3 border-b"
          onClick={() => setMenuOpen(false)}
        >
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 16V8.00002C20.9996 7.6493 20.9071 7.30483 20.7315 7.00119C20.556 6.69754 20.3037 6.44539 20 6.27002L13 2.27002C12.696 2.09449 12.3511 2.00208 12 2.00208C11.6489 2.00208 11.304 2.09449 11 2.27002L4 6.27002C3.69626 6.44539 3.44398 6.69754 3.26846 7.00119C3.09294 7.30483 3.00036 7.6493 3 8.00002V16C3.00036 16.3508 3.09294 16.6952 3.26846 16.9989C3.44398 17.3025 3.69626 17.5547 4 17.73L11 21.73C11.304 21.9056 11.6489 21.998 12 21.998C12.3511 21.998 12.696 21.9056 13 21.73L20 17.73C20.3037 17.5547 20.556 17.3025 20.7315 16.9989C20.9071 16.6952 20.9996 16.3508 21 16Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3.27002 6.96002L12 12.01L20.73 6.96002" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 22.08V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="font-medium">Original Click Values</span>
          </div>
        </Link>
        
        <Link 
          href="/campaign-click-records" 
          className="block py-3 border-b"
          onClick={() => setMenuOpen(false)}
        >
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="19" cy="6" r="3" fill="currentColor"/>
            </svg>
            <span className="font-medium">Campaign Click Records</span>
          </div>
        </Link>
        
        <Link 
          href="/url-click-records" 
          className="block py-3 border-b"
          onClick={() => setMenuOpen(false)}
        >
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="font-medium">URL Click Records</span>
          </div>
        </Link>
        
        <Link 
          href="/url-budget-logs" 
          className="block py-3 border-b"
          onClick={() => setMenuOpen(false)}
        >
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 8c-2.68 0-4.83.58-6.04 1.5C4.73 10.42 4 11.53 4 12.5s.73 2.08 1.96 3c1.21.92 3.36 1.5 6.04 1.5 2.68 0 4.83-.58 6.04-1.5 1.23-.92 1.96-2.03 1.96-3s-.73-2.08-1.96-3C16.83 8.58 14.68 8 12 8z" stroke="currentColor" strokeWidth="2" />
              <path d="M4 12.5v5c0 .97.73 2.08 1.96 3 1.21.92 3.36 1.5 6.04 1.5 2.68 0 4.83-.58 6.04-1.5 1.23-.92 1.96-2.03 1.96-3v-5" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span className="font-medium">URL Budget Logs</span>
          </div>
        </Link>
        
        <Link 
          href="/youtube-url-records" 
          className="block py-3 border-b"
          onClick={() => setMenuOpen(false)}
        >
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" stroke="currentColor" strokeWidth="2" />
              <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="currentColor" />
            </svg>
            <span className="font-medium">YouTube URL Records</span>
          </div>
        </Link>

        <Link 
          href="/youtube-api-logs" 
          className="block py-3 border-b"
          onClick={() => setMenuOpen(false)}
        >
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="12" y1="5" x2="12" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="12" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="font-medium">YouTube API Logs</span>
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
        
        {/* Logout button - added as the last item */}
        <button 
          className="block w-full py-3 border-b text-red-600 hover:bg-red-50 transition-colors"
          onClick={() => {
            logout().then(() => {
              setMenuOpen(false);
              navigate('/login');
            });
          }}
        >
          <div className="flex items-center">
            <LogOut className="w-5 h-5 mr-3" />
            <span className="font-medium">Logout</span>
          </div>
        </button>
      </div>
      
      {/* Scroll down button */}
      {showScrollButtons && (
        <div 
          className="sticky bottom-0 w-full bg-white py-2 border-t text-center cursor-pointer z-10 shadow-sm hover:bg-gray-100 transition-colors"
          onClick={scrollDown}
        >
          <div className="flex items-center justify-center">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              className="inline-block text-primary"
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
            <span className="ml-1 text-xs text-gray-500">Scroll down</span>
          </div>
        </div>
      )}
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