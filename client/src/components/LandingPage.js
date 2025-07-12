import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const LandingPage = () => {
  const navigate = useNavigate();
  const { loginAdmin } = useAuth();
  const [playerName, setPlayerName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [adminError, setAdminError] = useState('');

  const handleAdminLogin = async () => {
    if (!adminPassword.trim()) {
      setAdminError('Please enter the admin password');
      return;
    }

    setLoading(true);
    setAdminError('');
    
    try {
      // First verify admin password
      const verifyResponse = await axios.post('/api/verify-admin', {
        password: adminPassword
      });
      
      if (verifyResponse.data.success) {
        // Password is correct, set admin as authenticated
        loginAdmin();
        // Navigate directly to admin page
        navigate('/admin');
      }
    } catch (error) {
      console.error('Error during admin login:', error);
      if (error.response?.status === 401) {
        setAdminError('Invalid admin password');
      } else {
        setAdminError('Failed to connect to server. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePlayerJoin = (e) => {
    e.preventDefault();
    if (playerName.trim()) {
      navigate('/player', { state: { playerName: playerName.trim() } });
    }
  };

  return (
    <div className="container">
      <h1 className="title">🎵 Spotify Music Game 🎵</h1>
      
      <div className="card">
        <h2 className="subtitle text-center">Welcome to the Music Guessing Game!</h2>
        <p className="text-center mb-20">
          Test your music knowledge by guessing songs, artists, and lyrics while competing with other players!
        </p>
        
        <div className="grid">
          {/* Admin Section */}
          <div className="card">
            <h3 className="subtitle text-center">🎮 Admin Panel</h3>
            <p className="text-center mb-20">
              Control the game, manage playlists, and track player scores.
            </p>
            <input
              type="password"
              className="input"
              placeholder="Enter admin password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
            />
            {adminError && (
              <p className="error-text text-center mb-10">{adminError}</p>
            )}
            <div className="flex-center">
              <button 
                className="btn" 
                onClick={handleAdminLogin}
                disabled={loading || !adminPassword.trim()}
              >
                {loading ? 'Connecting...' : 'Login as Admin'}
              </button>
            </div>
          </div>

          {/* Player Section */}
          <div className="card">
            <h3 className="subtitle text-center">🎯 Join as Player</h3>
            <p className="text-center mb-20">
              Enter your name and start guessing songs!
            </p>
            <form onSubmit={handlePlayerJoin}>
              <input
                type="text"
                className="input"
                placeholder="Enter your player name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                required
              />
              <div className="flex-center">
                <button 
                  type="submit" 
                  className="btn"
                  disabled={!playerName.trim()}
                >
                  Join Game
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="card mt-20">
          <h3 className="subtitle text-center">How to Play</h3>
          <div className="grid">
            <div>
              <h4>🎵 For Admins:</h4>
              <ul>
                <li>Connect your Spotify account</li>
                <li>Select a playlist to play from</li>
                <li>Control playback and track scores</li>
                <li>Monitor all connected players</li>
              </ul>
            </div>
            <div>
                          <h4>🎯 For Players:</h4>
            <ul>
              <li>Enter your unique player name (no duplicates allowed)</li>
              <li>Listen to the music being played</li>
              <li>Guess the artist, song title, or lyrics</li>
              <li>Earn points for correct guesses</li>
              <li>Your score persists even if you disconnect and reconnect</li>
              <li>Compete with other players in real-time</li>
            </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage; 