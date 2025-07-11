import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const LandingPage = () => {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdminLogin = async () => {
    setLoading(true);
    try {
      // Get the Spotify authorization URL from the backend
      const response = await axios.get('/auth/spotify');
      // Redirect to Spotify's authorization page
      window.location.href = response.data.url;
    } catch (error) {
      console.error('Error getting Spotify auth URL:', error);
      alert('Failed to connect to Spotify. Please try again.');
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
            <div className="flex-center">
              <button 
                className="btn" 
                onClick={handleAdminLogin}
                disabled={loading}
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
                <li>Enter your unique player name</li>
                <li>Listen to the music being played</li>
                <li>Guess the artist, song title, or lyrics</li>
                <li>Earn points for correct guesses</li>
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