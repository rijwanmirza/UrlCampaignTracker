import React from 'react';
import { Redirect } from 'wouter';
import LoginForm from '@/components/auth/LoginForm';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();

  // If already authenticated, redirect to home
  if (isAuthenticated && !isLoading) {
    return <Redirect to="/" />;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Administration Panel</h1>
          <p className="text-gray-600 mt-2">Login to access the system</p>
        </div>
        
        <LoginForm />
      </div>
    </div>
  );
}