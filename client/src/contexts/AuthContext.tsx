import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  verifyApiKey: (apiKey: string) => Promise<void>;
  logout: () => Promise<void>;
}

const defaultContextValue: AuthContextType = {
  isAuthenticated: false,
  isLoading: true,
  verifyApiKey: async () => {},
  logout: async () => {}
};

const AuthContext = createContext<AuthContextType>(defaultContextValue);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Check authentication status on mount
  useEffect(() => {
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

  // Logout function - clears the API key cookie
  const logout = async () => {
    setIsLoading(true);
    try {
      await axios.post('/api/auth/logout');
      setIsAuthenticated(false);
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