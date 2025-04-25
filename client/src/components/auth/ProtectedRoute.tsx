import React from 'react';
import { Redirect, Route } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

type ProtectedRouteProps = {
  path: string;
  component: React.ComponentType;
};

export function ProtectedRoute({ path, component: Component }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();

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
          return <Redirect to="/login" />;
        }
        
        return <Component {...params} />;
      }}
    </Route>
  );
}