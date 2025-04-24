import { useState, useEffect } from "react";

/**
 * Hook to reliably detect mobile devices with improved support for 
 * small-screen devices that might not be correctly identified by media queries.
 */
export function useIsMobile() {
  // Start with a direct screen width check for SSR support
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 800
  );

  useEffect(() => {
    // Function to handle changes to screen size
    const handleResize = () => {
      const mobileView = window.innerWidth < 800;
      setIsMobile(mobileView);
    };

    // Listen for window resize events
    window.addEventListener('resize', handleResize);
    
    // Initial check in case window.innerWidth wasn't available during initial render
    handleResize();

    // Clean up event listener on unmount
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
}