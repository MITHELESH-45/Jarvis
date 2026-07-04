import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  pictureUrl?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  hasSeenIntro: boolean;
  login: (credential: string) => Promise<void>;
  logout: () => void;
  setHasSeenIntro: (value: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('token');
  });

  const [hasSeenIntro, setHasSeenIntroState] = useState<boolean>(() => {
    return localStorage.getItem('hasSeenIntro') === 'true';
  });

  const setHasSeenIntro = (value: boolean) => {
    setHasSeenIntroState(value);
    localStorage.setItem('hasSeenIntro', String(value));
  };

  const login = async (credential: string) => {
    try {
      const backendUrl = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000').replace(/['"]/g, '').replace(/\/+$/, '');
      const response = await fetch(`${backendUrl}/api/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: credential }),
      });

      if (!response.ok) {
        throw new Error(`Authentication failed with status: ${response.status}`);
      }

      const data = await response.json();
      
      setUser(data.user);
      setToken(data.token);
      setHasSeenIntro(false);

      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('token', data.token);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    // Keeping hasSeenIntro strictly as per requirement, or we can clear all.
    // The requirement says "Clear: React State, localStorage". 
    // To preserve the theme, we specifically remove auth items.
  };

  return (
    <AuthContext.Provider value={{ user, token, hasSeenIntro, login, logout, setHasSeenIntro }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
