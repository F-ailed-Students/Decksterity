import { useEffect, useMemo, useState } from 'react';
import { AuthContext } from './AuthContext';

const AUTH_STORAGE_KEY = 'sr_account_profile';

function readStoredUser() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function buildUserAccount({ name, email, role = 'Student' }) {
  const safeName = name?.trim() || email?.split('@')[0] || 'Student';
  return {
    id: email?.toLowerCase() || safeName.toLowerCase(),
    name: safeName,
    email: email?.trim() || '',
    role,
    joinedAt: new Date().toISOString(),
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readStoredUser());

  useEffect(() => {
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, [user]);

  const value = useMemo(() => {
    return {
      user,
      isAuthenticated: Boolean(user),
      signIn: ({ email, password, name }) => {
        const account = buildUserAccount({
          email,
          name,
          role: password ? 'Student' : 'Guest',
        });
        setUser(account);
        return account;
      },
      signUp: ({ name, email }) => {
        const account = buildUserAccount({ name, email, role: 'Member' });
        setUser(account);
        return account;
      },
      updateAccount: (updates) => {
        setUser((current) => (current ? { ...current, ...updates } : current));
      },
      signOut: () => setUser(null),
    };
  }, [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
