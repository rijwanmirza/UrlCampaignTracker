import React, { createContext, useContext, ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

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
  
  // Get current user
  const { 
    data, 
    error, 
    isLoading 
  } = useQuery({
    queryKey: ['auth', 'user'],
    queryFn: async () => {
      try {
        const response = await axios.get('/api/auth/me');
        return response.data;
      } catch (error) {
        // If unauthorized, return null without throwing error
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          return { user: null, isAuthenticated: false };
        }
        throw error;
      }
    },
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
  
  // Login mutation
  const loginMutation = useMutation({
    mutationFn: async (credentials: { username: string, password: string }) => {
      const response = await axios.post('/api/auth/login', credentials);
      return response.data;
    },
    onSuccess: () => {
      // Invalidate and refetch user data
      queryClient.invalidateQueries({ queryKey: ['auth', 'user'] });
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