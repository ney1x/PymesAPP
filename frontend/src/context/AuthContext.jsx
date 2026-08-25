import { createContext, useContext, useState, useCallback } from 'react';
import { authApi } from '../api';

const AuthContext = createContext(null);

const readUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user')) || null;
  } catch {
    return null;
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readUser);
  const [loading, setLoading] = useState(false);

  const persist = useCallback(({ user: u }) => {
    // El token va en cookie httpOnly (la puso el backend en la respuesta),
    // aca solo guardamos el usuario para UI — no es material de sesion.
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
  }, []);

  const login = useCallback(
    async (data) => {
      setLoading(true);
      try {
        const res = await authApi.login(data);
        persist(res);
        return res.user;
      } finally {
        setLoading(false);
      }
    },
    [persist]
  );

  // No persiste sesión: la cuenta queda sin uso hasta verificar el correo
  // (ver verifyEmail) — register() solo dispara el envío del código.
  const register = useCallback(async (data) => {
    setLoading(true);
    try {
      return await authApi.register(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyEmail = useCallback(
    async (data) => {
      setLoading(true);
      try {
        const res = await authApi.verifyEmail(data);
        persist(res);
        return res.user;
      } finally {
        setLoading(false);
      }
    },
    [persist]
  );

  const logout = useCallback(() => {
    authApi.logout().catch(() => {});
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (data) => {
    const res = await authApi.updateMe(data);
    persist({ user: res.user });
    return res.user;
  }, [persist]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, verifyEmail, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
