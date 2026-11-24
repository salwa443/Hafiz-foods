import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthContext } from './AuthContextCore.js';
import {
  getCurrentStaffUser,
  loginStaff,
  logoutStaff,
} from '../services/authService.js';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('staffToken'));
  const [isLoading, setIsLoading] = useState(Boolean(token));

  useEffect(() => {
    async function loadCurrentUser() {
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const currentUser = await getCurrentStaffUser();
        setUser(currentUser);
      } catch {
        localStorage.removeItem('staffToken');
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadCurrentUser();
  }, [token]);

  const login = useCallback(async (credentials) => {
    const result = await loginStaff(credentials);
    localStorage.setItem('staffToken', result.token);
    setToken(result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      if (token) {
        await logoutStaff();
      }
    } finally {
      localStorage.removeItem('staffToken');
      setToken(null);
      setUser(null);
    }
  }, [token]);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user && token),
      isLoading,
      login,
      logout,
    }),
    [user, token, isLoading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
