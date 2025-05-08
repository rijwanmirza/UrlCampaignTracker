import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

// Authentication is now enabled - set to false to require login
const BYPASS_AUTH = false;

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  verifyApiKey: (apiKey: string) => Promise<void>;
  logout: () => Promise<void>;
}

const defaultContextValue: AuthContextType = {
  isAuthenticated: BYPASS_AUTH, // Auto-authenticate in dev mode
  isLoading: false, // Skip loading in dev mode
  verifyApiKey: async () => {},
  logout: async () => {}
};

const AuthContext = createContext<AuthContextType>(defaultContextValue);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // In development mode, always set authenticated to true
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(BYPASS_AUTH);
  const [isLoading, setIsLoading] = useState<boolean>(!BYPASS_AUTH);

  // Check authentication status on mount
  useEffect(() => {
    // Skip auth check if in development mode
    if (BYPASS_AUTH) {
      console.log('🔓 DEVELOPMENT MODE: Authentication bypassed on client');
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }
    
    const checkAuthStatus = async () => {
      try {
        const response = await axios.get('/api/auth/status');
        setIsAuthenticated(response.data.authenticated);
      } catch (error) {
        console.error('Error checking authentication status:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  // Verify API key function
  const verifyApiKey = async (apiKey: string) => {
    // In development mode, always succeed with verification
    if (BYPASS_AUTH) {
      console.log('🔓 DEVELOPMENT MODE: API key verification bypassed');
      setIsAuthenticated(true);
      return;
    }
    
    setIsLoading(true);
    try {
      const response = await axios.post('/api/auth/verify-key', { apiKey });
      setIsAuthenticated(response.data.authenticated);
    } catch (error) {
      console.error('API key verification error:', error);
      setIsAuthenticated(false);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Logout function - clears the API key cookie and session
  const logout = async () => {
    // In development mode, logout is a no-op
    if (BYPASS_AUTH) {
      console.log('🔓 DEVELOPMENT MODE: Logout bypassed');
      return;
    }
    
    setIsLoading(true);
    try {
      await axios.post('/api/auth/logout');
      setIsAuthenticated(false);
      
      // Redirect to login page (will hit access control) after logout
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const value = {
    isAuthenticated,
    isLoading,
    verifyApiKey,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}