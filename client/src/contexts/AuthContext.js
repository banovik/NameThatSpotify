import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLogging } from './LoggingContext';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const { log } = useLogging();
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => {
    // Check localStorage on initial load
    const stored = localStorage.getItem('isAdminAuthenticated') === 'true';
    log('AuthContext: Initial auth state from localStorage:', stored);
    return stored;
  });

  // Log authentication state changes
  useEffect(() => {
    log('AuthContext: Authentication state changed to:', isAdminAuthenticated);
  }, [isAdminAuthenticated, log]);

  const loginAdmin = () => {
    log('AuthContext: Logging in admin');
    setIsAdminAuthenticated(true);
    localStorage.setItem('isAdminAuthenticated', 'true');
  };

  const logoutAdmin = () => {
    log('AuthContext: Logging out admin');
    setIsAdminAuthenticated(false);
    localStorage.removeItem('isAdminAuthenticated');
  };

  const value = {
    isAdminAuthenticated,
    loginAdmin,
    logoutAdmin
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 