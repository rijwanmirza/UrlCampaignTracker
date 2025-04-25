import React from 'react';
import { Route, useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import axios from 'axios';

type ProtectedRouteProps = {
  path: string;
  component: React.ComponentType;
};

export function ProtectedRoute({ path, component: Component }: ProtectedRouteProps) {
  const [isLoading, setIsLoading] = React.useState(true);
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [, setLocation] = useLocation();

  React.useEffect(() => {
    async function checkAuth() {
      try {
        const res = await axios.get('/api/auth/me');
        if (res.data && res.data.isAuthenticated) {
          setIsAuthenticated(true);
        } else {
          // Redirect to login if not authenticated
          setLocation('/login');
        }
      } catch (error) {
        // Redirect to login on error
        setLocation('/login');
      } finally {
        setIsLoading(false);
      }
    }
    
    checkAuth();
  }, [setLocation]);

  return (
    <Route path={path}>
      {(params) => {
        if (isLoading) {
          return (
            <div className="flex items-center justify-center h-screen">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          );
        }
        
        if (!isAuthenticated) {
          return null; // Already redirecting in useEffect
        }
        
        return <Component {...params} />;
      }}
    </Route>
  );
}