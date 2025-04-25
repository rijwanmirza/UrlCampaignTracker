import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useLocation } from 'wouter';

// Types
type User = {
  id: number;
  username: string;
  role: string;
};

type AuthContextType = {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: Error | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

// Create context
const AuthContext = createContext<AuthContextType | null>(null);

// Provider component
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  
  // Get current user
  const { 
    data, 
    error, 
    isLoading,
    refetch 
  } = useQuery({
    queryKey: ['auth', 'user'],
    queryFn: async () => {
      try {
        console.log('Checking auth status...');
        const response = await axios.get('/api/auth/me');
        console.log('Auth response:', response.data);
        return response.data;
      } catch (error) {
        // If unauthorized, return null without throwing error
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          console.log('User is not authenticated');
          return { user: null, isAuthenticated: false };
        }
        console.error('Auth check error:', error);
        throw error;
      }
    },
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: true,
  });
  
  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (credentials: { username: string, password: string }) => {
      console.log('Attempting login with credentials:', credentials.username);
      const response = await axios.post('/api/auth/login', credentials);
      console.log('Login response:', response.data);
      return response.data;
    },
    onSuccess: (data) => {
      console.log('Login successful, user:', data.user);
      // Set the user data directly
      queryClient.setQueryData(['auth', 'user'], { 
        user: data.user, 
        isAuthenticated: true 
      });
      
      // Also trigger a refetch to ensure we have fresh data
      refetch();
      
      // We don't need navigation here anymore since LoginForm handles it with a hard redirect
    },
  });
  
  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await axios.post('/api/auth/logout');
      return response.data;
    },
    onSuccess: () => {
      // Clear user data
      queryClient.setQueryData(['auth', 'user'], { user: null, isAuthenticated: false });
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });
      // Redirect to login
      setLocation('/login');
    },
  });
  
  // Login function
  const login = async (username: string, password: string) => {
    await loginMutation.mutateAsync({ username, password });
  };
  
  // Logout function
  const logout = async () => {
    await logoutMutation.mutateAsync();
  };
  
  // Extract user data or default to null
  const userData = data?.user || null;
  const isAuthenticated = data?.isAuthenticated || false;
  
  // Context value
  const value = {
    user: userData,
    isAuthenticated,
    isLoading,
    error: error as Error | null,
    login,
    logout,
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook for using the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};