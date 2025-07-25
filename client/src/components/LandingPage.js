import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useLogging } from '../contexts/LoggingContext';
import leoProfanity from 'leo-profanity';

// Utility to replace common leetspeak and symbol substitutions
function normalizeLeetSpeak(str) {
  return str
    .replace(/[@]/gi, 'a')
    .replace(/[4]/g, 'a')
    .replace(/[$]/g, 's')
    .replace(/5/g, 's')
    .replace(/3/g, 'e')
    .replace(/1/g, 'i')
    .replace(/[!|]/g, 'i')
    .replace(/0/g, 'o')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/9/g, 'g')
    .replace(/2/g, 'z')
    .replace(/6/g, 'g');
}

const LandingPage = () => {
  const navigate = useNavigate();
  const { loginAdmin } = useAuth();
  const { logError } = useLogging();
  const [playerName, setPlayerName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  // Game code state
  const [gameCode, setGameCode] = useState('');
  const [gameCodeVerified, setGameCodeVerified] = useState(false);
  const [gameCodeError, setGameCodeError] = useState('');

  // Handle player name input with character limit and validation
  const handlePlayerNameChange = (e) => {
    const value = e.target.value;
    // Limit input to 32 characters and remove invalid characters
    const sanitized = value
      .replace(/[<>'"`;{}[\]()&|$\\]/g, '') // Remove dangerous characters
      .replace(/script|javascript|vbscript|onload|onerror|onclick/gi, '') // Remove script keywords
      .substring(0, 32); // Limit length
    
    setPlayerName(sanitized);
  };

  // Handle game code input
  const handleGameCodeChange = (e) => {
    const value = e.target.value;
    // Limit to 6 digits only
    if (value.length <= 6 && /^\d*$/.test(value)) {
      setGameCode(value);
      setGameCodeError(''); // Clear error when user types
    }
  };

  // Verify game code
  const handleGameCodeSubmit = async (e) => {
    e.preventDefault();
    if (!gameCode.trim()) {
      setGameCodeError('Please enter a game code');
      return;
    }
    
    setLoading(true);
    setGameCodeError('');
    
    try {
      const response = await axios.post('/api/verify-game-code', { gameCode: gameCode.trim() });
      if (response.data.success) {
        setGameCodeVerified(true);
        setGameCodeError('');
      }
    } catch (error) {
      logError('Game code verification error:', error);
      if (error.response?.status === 429) {
        setGameCodeError(error.response.data.error || 'Too many failed attempts. Please wait before trying again.');
      } else if (error.response?.status === 403) {
        setGameCodeError(error.response.data.error || 'Access denied. You are blocked from joining the game.');
      } else {
        setGameCodeError(error.response?.data?.error || 'Invalid game code');
      }
    } finally {
      setLoading(false);
    }
  };

  // Reset game code verification
  const handleBackToGameCode = () => {
    setGameCodeVerified(false);
    setGameCode('');
    setPlayerName('');
    setGameCodeError('');
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    if (!adminPassword.trim()) {
      setAdminError('Please enter the admin password');
      return;
    }

    setLoading(true);
    setAdminError('');
    
    try {
      // First verify admin password
      const response = await axios.post('/api/verify-admin', { password: adminPassword });
      
      if (response.data.success) {
        // Password is correct, set admin as authenticated
        loginAdmin();
        // Navigate directly to admin page
        navigate('/admin');
      } else {
        alert('Invalid admin password');
      }
    } catch (error) {
      logError('Error during admin login:', error);
      if (error.response?.status === 401) {
        setAdminError('Invalid admin password');
      } else if (error.response?.status === 429) {
        setAdminError(error.response.data.error || 'Too many failed attempts. Please wait before trying again.');
      } else {
        setAdminError('Failed to connect to server. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePlayerJoin = (e) => {
    e.preventDefault();
    const trimmedName = playerName.trim();
    if (trimmedName) {
      leoProfanity.loadDictionary();
      const lowerName = trimmedName.toLowerCase();
      const cleanedName = leoProfanity.clean(trimmedName).toLowerCase();
      const joinedName = trimmedName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const leetName = normalizeLeetSpeak(lowerName);
      const leetJoined = normalizeLeetSpeak(joinedName);
      const badWords = leoProfanity.list();
      const containsBadWord = badWords.some(word =>
        lowerName.includes(word) ||
        cleanedName.includes(word) ||
        joinedName.includes(word) ||
        leetName.includes(word) ||
        leetJoined.includes(word)
      );
      if (
        leoProfanity.check(trimmedName) ||
        leoProfanity.check(cleanedName) ||
        leoProfanity.check(joinedName) ||
        leoProfanity.check(leetName) ||
        leoProfanity.check(leetJoined) ||
        containsBadWord
      ) {
        logError('Please choose a different username. Offensive or inappropriate words are not allowed.');
        alert('Please choose a different username. Offensive or inappropriate words are not allowed.');
        return;
      }
      navigate('/player', { 
        state: { 
          playerName: trimmedName,
          gameCode: gameCode 
        } 
      });
    }
  };

  return (
    <div className="container">
      <h1 className="title">Name That Spotify Tune</h1>
      
      <div className="card">
        <h2 className="subtitle text-center">Welcome to this incredible vibecoded mess of a trivia game!</h2>
        <p className="text-center mb-20">
          Test your music knowledge by guessing songs, artists, and lyrics while competing with other players!
        </p>
        
        <div className="grid">
          {/* Admin Section */}
          <div className="card">
            <h3 className="subtitle text-center">Admin Panel</h3>
            <p className="text-center mb-20">
              Control the game, manage playlists, and track player scores.
            </p>
            <input
              type="password"
              className="input"
              placeholder="Enter admin password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin(e)}
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
            <h3 className="subtitle text-center">Join as Player</h3>
            <p className="text-center mb-20">
              Enter your name and start guessing songs!
            </p>
            <form onSubmit={handleGameCodeSubmit}>
              <input
                type="text"
                className="input"
                placeholder="Enter game code"
                value={gameCode}
                onChange={handleGameCodeChange}
                maxLength={8}
                required
              />
              {gameCodeError && (
                <p className="error-text text-center mb-10">{gameCodeError}</p>
              )}
              <div className="flex-center">
                <button 
                  type="submit" 
                  className="btn"
                  disabled={loading || !gameCode.trim()}
                >
                  {loading ? 'Verifying...' : 'Verify Game Code'}
                </button>
              </div>
            </form>

            {gameCodeVerified && (
              <div className="flex-center mt-20">
                <form onSubmit={handlePlayerJoin}>
                  <input
                    type="text"
                    className="input"
                    placeholder="Enter your player name"
                    value={playerName}
                    onChange={handlePlayerNameChange}
                    maxLength={25}
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
                <button 
                  className="btn ml-10" 
                  onClick={handleBackToGameCode}
                >
                  Back to Game Code
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="card mt-20">
          <h3 className="subtitle text-center">How to Play</h3>
          <div className="grid">
            <div>
              <h4>For Admins:</h4>
              <ul>
                <li>Connect your Spotify account</li>
                <li>Select a playlist to play from</li>
                <li>Control playback and track scores</li>
                <li>Monitor all connected players</li>
              </ul>
            </div>
            <div>
              <h4>For Players:</h4>
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