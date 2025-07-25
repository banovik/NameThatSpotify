import React, { createContext, useContext, useState } from 'react';

const LoggingContext = createContext();

export const useLogging = () => {
  const context = useContext(LoggingContext);
  if (!context) {
    throw new Error('useLogging must be used within a LoggingProvider');
  }
  return context;
};

export const LoggingProvider = ({ children }) => {
  const [consoleLoggingEnabled, setConsoleLoggingEnabled] = useState(false);

  const log = (...args) => {
    if (consoleLoggingEnabled) {
      console.log(...args);
    }
  };

  const logError = (...args) => {
    if (consoleLoggingEnabled) {
      console.error(...args);
    }
  };

  const logWarn = (...args) => {
    if (consoleLoggingEnabled) {
      console.warn(...args);
    }
  };

  const value = {
    consoleLoggingEnabled,
    setConsoleLoggingEnabled,
    log,
    logError,
    logWarn
  };

  return (
    <LoggingContext.Provider value={value}>
      {children}
    </LoggingContext.Provider>
  );
}; 