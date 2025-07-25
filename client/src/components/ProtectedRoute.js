import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLogging } from '../contexts/LoggingContext';
import axios from 'axios';

const ProtectedRoute = ({ children }) => {
  const { isAdminAuthenticated } = useAuth();
  const { log } = useLogging();
  const [hasActiveGame, setHasActiveGame] = useState(true); // Default to true to avoid blocking initially

  // Check if there's an active game session
  useEffect(() => {
    const checkGameStatus = async () => {
      try {
        const response = await axios.get('/api/game-code-status');
        setHasActiveGame(response.data.hasGameCode || response.data.adminConnected);
      } catch (error) {
        log('Error checking game status:', error);
        setHasActiveGame(false);
      }
    };

    if (isAdminAuthenticated) {
      checkGameStatus();
    }
  }, [isAdminAuthenticated, log]);

  log('ProtectedRoute: Checking authentication state:', isAdminAuthenticated, 'hasActiveGame:', hasActiveGame);

  if (!isAdminAuthenticated) {
    log('ProtectedRoute: Redirecting to landing page - not authenticated');
    return <Navigate to="/" replace />;
  }

  // Allow admin access even if no active game (they can start one)
  log('ProtectedRoute: Rendering protected content - authenticated');
  return children;
};

export default ProtectedRoute; 