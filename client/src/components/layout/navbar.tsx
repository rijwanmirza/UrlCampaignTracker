import { Link, useLocation } from "wouter";
import { Link2, List, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Navbar() {
  const [location] = useLocation();
  
  const navItems = [
    {
      name: "Campaigns",
      path: "/campaigns",
      icon: <LayoutGrid className="h-5 w-5" />,
      active: location.startsWith("/campaigns")
    },
    {
      name: "URL History",
      path: "/urls",
      icon: <Link2 className="h-5 w-5" />,
      active: location.startsWith("/urls")
    }
  ];
  
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background">
      <div className="container flex h-16 items-center px-4 md:px-6">
        <div className="flex items-center mr-8">
          <Link href="/" className="flex items-center">
            <Link2 className="h-6 w-6 text-primary mr-2" />
            <span className="text-xl font-bold">URL Redirector</span>
          </Link>
        </div>
        
        <nav className="flex flex-1 items-center space-x-1 md:space-x-2">
          {navItems.map((item) => (
            <Link 
              key={item.path} 
              href={item.path}
              className={cn(
                "flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                item.active 
                  ? "bg-primary text-primary-foreground" 
                  : "hover:bg-muted hover:text-foreground"
              )}
            >
              {item.icon}
              {item.name}
            </Link>
          ))}
        </nav>
        
        {/* Right side content can be added here if needed */}
        <div className="ml-auto flex items-center gap-2"></div>
      </div>
    </header>
  );
}