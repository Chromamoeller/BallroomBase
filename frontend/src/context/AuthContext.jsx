import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api } from "../api/client.js";

const AuthContext = createContext(null);

const STORAGE_TOKEN = "dancefans_token";
const STORAGE_USER = "dancefans_user";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem(STORAGE_USER);
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem(STORAGE_TOKEN);
    if (!token || !user) return;
    api.me().catch(() => {
      localStorage.removeItem(STORAGE_TOKEN);
      localStorage.removeItem(STORAGE_USER);
      setUser(null);
    });
  }, []);

  const login = useCallback(async (username, password) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.login(username, password);
      localStorage.setItem(STORAGE_TOKEN, data.token);
      localStorage.setItem(STORAGE_USER, JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Token war wahrscheinlich schon ungültig
    }
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_USER);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, error, login, logout, isAdmin: user?.role === "admin" }),
    [user, loading, error, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
