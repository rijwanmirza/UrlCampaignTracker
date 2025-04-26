import React, { useEffect, ReactNode } from 'react';
import { useLocation, useNavigate } from 'wouter';
import { useAuth } from '../contexts/AuthContext';
import { Spinner } from './ui/spinner';

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, checkAuthStatus } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    const verifyAuth = async () => {
      const authenticated = await checkAuthStatus();
      if (!authenticated) {
        navigate('/login');
      }
    };

    verifyAuth();
  }, [checkAuthStatus, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner size="lg" />
        <span className="ml-2">Checking authentication...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Don't render children while redirecting
  }

  return <>{children}</>;
}