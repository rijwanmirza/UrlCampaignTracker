import { createContext, useContext, ReactNode, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Define types for our authentication context
interface User {
  id: string;
  username: string;
  role: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  login: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
}

// Create the authentication context
const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  user: null,
  login: async () => ({ success: false, message: "Not implemented" }),
  logout: async () => {},
});

// Hook to use the auth context
export function useAuth() {
  return useContext(AuthContext);
}

// Provider component to wrap the app
export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const queryClient = useQueryClient();

  // Fetch current user data
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/me"],
    retry: false,
    enabled: true,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    queryFn: async () => {
      try {
        const response = await fetch("/api/auth/me");
        if (!response.ok) {
          throw new Error("Not authenticated");
        }
        const data = await response.json();
        if (data?.user) {
          setIsAuthenticated(true);
        }
        return data;
      } catch (error) {
        setIsAuthenticated(false);
        throw error;
      }
    }
  });

  // Login function
  async function login(username: string, password: string) {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
        setIsAuthenticated(true);
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        return { success: true, message: data.message };
      } else {
        return { success: false, message: data.message || "Login failed" };
      }
    } catch (error) {
      console.error("Login error:", error);
      return { success: false, message: "An unexpected error occurred" };
    }
  }

  // Logout function
  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setIsAuthenticated(false);
      queryClient.setQueryData(["/api/auth/me"], null);
    } catch (error) {
      console.error("Logout error:", error);
    }
  }

  const value = {
    isAuthenticated,
    isLoading,
    user: user?.user || null,
    login,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}