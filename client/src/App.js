import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { LoggingProvider } from './contexts/LoggingContext';
import LandingPage from './components/LandingPage';
import AdminPage from './components/AdminPage';
import PlayerPage from './components/PlayerPage';
import ProtectedRoute from './components/ProtectedRoute';
import './index.css';

function App() {
  return (
    <LoggingProvider>
      <AuthProvider>
        <Router>
          <div className="App">
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route 
                path="/admin" 
                element={
                  <ProtectedRoute>
                    <AdminPage />
                  </ProtectedRoute>
                } 
              />
              <Route path="/player" element={<PlayerPage />} />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </LoggingProvider>
  );
}

export default App; 