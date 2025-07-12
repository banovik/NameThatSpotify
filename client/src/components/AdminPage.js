import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';

const AdminPage = () => {
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [playlist, setPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [players, setPlayers] = useState({});
  const [scores, setScores] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [devices, setDevices] = useState([]);
  const [showDevices, setShowDevices] = useState(false);
  const [guessedParts, setGuessedParts] = useState({ artist: false, title: false, lyrics: false });

  useEffect(() => {
    // Check if user is authenticated
    const checkAuthStatus = async () => {
      try {
        // This would check if the user has a valid Spotify token
        // For now, we'll assume they're authenticated if they reach this page
      } catch (error) {
        console.error('Auth check failed:', error);
        navigate('/');
      }
    };

    checkAuthStatus();

    // Initialize Socket.IO connection for admin
    console.log('Admin: Attempting to connect to Socket.IO server at http://127.0.0.1:5001');
    const newSocket = io('http://127.0.0.1:5001', {
      transports: ['websocket', 'polling'],
      timeout: 20000
    });
    setSocket(newSocket);

    // Socket event listeners for admin
    newSocket.on('connect', () => {
      console.log('✅ Admin connected to server with socket ID:', newSocket.id);
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ Admin socket connection error:', error);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('🔌 Admin disconnected from server:', reason);
    });

    newSocket.on('gameState', (gameState) => {
      console.log('Admin received game state:', gameState);
      setPlayers(gameState.players || {});
      setScores(gameState.scores || {});
      setIsPlaying(gameState.isPlaying);
      setGuessedParts(gameState.guessedParts || { artist: false, title: false, lyrics: false });
    });

    newSocket.on('playerJoined', (data) => {
      console.log('Admin: Player joined:', data);
      setPlayers(data.players || {});
      setScores(data.scores || {});
    });

    newSocket.on('playerLeft', (data) => {
      console.log('Admin: Player left:', data);
      setPlayers(data.players || {});
      setScores(data.scores || {});
    });

    newSocket.on('correctGuess', (data) => {
      console.log('Admin: Correct guess:', data);
      setScores(data.scores || {});
      setGuessedParts(data.guessedParts || { artist: false, title: false, lyrics: false });
    });

    newSocket.on('scoresReset', () => {
      console.log('Admin: Scores reset');
      setScores({});
    });

    return () => {
      newSocket.close();
    };
  }, [navigate]);

  const checkDevices = async () => {
    try {
      const response = await axios.get('/api/devices');
      setDevices(response.data.devices);
      setShowDevices(true);
    } catch (error) {
      console.error('Error checking devices:', error);
      setError('Failed to check Spotify devices');
    }
  };

  const handlePlaylistSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/playlist', { playlistUrl });
      setPlaylist(response.data.playlist);
      setTracks(response.data.playlist.tracks.items);
      setError('');
    } catch (error) {
      setError('Failed to load playlist. Please check the URL and try again.');
      console.error('Playlist error:', error);
    } finally {
      setLoading(false);
    }
  };

  const playTrack = async (track) => {
    try {
      await axios.post('/api/play', { trackUri: track.uri });
      setCurrentTrack(track);
      setIsPlaying(true);
      setError('');
    } catch (error) {
      setError('Failed to play track. Make sure Spotify is open and playing.');
      console.error('Play error:', error);
    }
  };

  const pausePlayback = async () => {
    try {
      await axios.post('/api/pause');
      setIsPlaying(false);
      setError('');
    } catch (error) {
      setError('Failed to pause playback.');
      console.error('Pause error:', error);
    }
  };

  const resetScores = async () => {
    try {
      await axios.post('/api/reset-scores');
      setScores({});
      setError('');
    } catch (error) {
      setError('Failed to reset scores.');
      console.error('Reset error:', error);
    }
  };

  const selectNewPlaylist = () => {
    setPlaylist(null);
    setTracks([]);
    setCurrentTrack(null);
    setIsPlaying(false);
    setPlaylistUrl('');
  };

  return (
    <div className="container">
      <h1 className="title">🎮 Admin Panel</h1>
      
      {error && (
        <div className="card" style={{ background: '#ffe6e6', border: '1px solid #ff9999' }}>
          <p style={{ color: '#cc0000' }}>{error}</p>
        </div>
      )}

      {/* Spotify Device Check */}
      <div className="card">
        <h2 className="subtitle">🎵 Spotify Device Status</h2>
        <p className="text-center mb-20">
          Make sure you have Spotify open and ready to play music.
        </p>
        <div className="flex-center">
          <button className="btn btn-secondary" onClick={checkDevices}>
            Check Available Devices
          </button>
        </div>
        
        {showDevices && (
          <div className="mt-20">
            <h4>Available Devices:</h4>
            {devices.length > 0 ? (
              <div className="player-list">
                {devices.map((device, index) => (
                  <div key={device.id} className="player-item">
                    <span>{device.name}</span>
                    <span style={{ color: device.is_active ? '#1db954' : '#666' }}>
                      {device.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center">No devices found. Please open Spotify on your desktop, mobile, or web player.</p>
            )}
          </div>
        )}
      </div>

      {/* Playlist Management */}
      <div className="card">
        <h2 className="subtitle">📋 Playlist Management</h2>
        <p className="text-center mb-20" style={{ fontSize: '0.9rem', color: '#666' }}>
          Load any Spotify playlist to access all tracks (no 100-track limit).
        </p>
        
        {!playlist ? (
          <form onSubmit={handlePlaylistSubmit}>
            <input
              type="url"
              className="input"
              placeholder="Enter Spotify playlist URL"
              value={playlistUrl}
              onChange={(e) => setPlaylistUrl(e.target.value)}
              required
            />
            <div className="flex-center">
              <button 
                type="submit" 
                className="btn"
                disabled={loading || !playlistUrl}
              >
                {loading ? 'Loading all tracks...' : 'Load Playlist'}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <div className="flex-between mb-20">
              <h3>Current Playlist: {playlist.name}</h3>
              <button className="btn btn-secondary" onClick={selectNewPlaylist}>
                Select New Playlist
              </button>
            </div>
            
            <div className="player-list">
              {tracks.map((item, index) => (
                <div key={item.track.id} className="player-item">
                  <div>
                    <strong>{index + 1}.</strong> {item.track.name} - {item.track.artists.map(a => a.name).join(', ')}
                  </div>
                  <button 
                    className="btn"
                    onClick={() => playTrack(item.track)}
                    disabled={isPlaying && currentTrack?.id === item.track.id}
                  >
                    {isPlaying && currentTrack?.id === item.track.id ? 'Playing' : 'Play'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Playback Controls */}
      {currentTrack && (
        <div className="card">
          <h2 className="subtitle">🎵 Now Playing</h2>
          <div className="now-playing">
            <h3>{currentTrack.name}</h3>
            <p>by {currentTrack.artists.map(a => a.name).join(', ')}</p>
            <p>Album: {currentTrack.album.name}</p>
            
            {/* Progress Indicator */}
            <div className="progress-indicator mt-20">
              <div className="progress-item">
                <span className={`progress-dot ${guessedParts.artist ? 'guessed' : ''}`}>🎤</span>
                <span className="progress-label">Artist {guessedParts.artist ? '✓' : ''}</span>
              </div>
              <div className="progress-item">
                <span className={`progress-dot ${guessedParts.title ? 'guessed' : ''}`}>🎵</span>
                <span className="progress-label">Title {guessedParts.title ? '✓' : ''}</span>
              </div>
              <div className="progress-item">
                <span className={`progress-dot ${guessedParts.lyrics ? 'guessed' : ''}`}>📝</span>
                <span className="progress-label">Lyrics {guessedParts.lyrics ? '✓' : ''}</span>
              </div>
            </div>
            
            <div className="flex-center mt-20">
              <button 
                className="btn btn-danger" 
                onClick={pausePlayback}
                disabled={!isPlaying}
              >
                Pause
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Correct Answers */}
      {currentTrack && (
        <div className="card">
          <h2 className="subtitle">🎯 Correct Answers</h2>
          <div className="correct-answers">
            <div className="answer-item">
              <strong>Artist:</strong> {currentTrack.artists.map(a => a.name).join(', ')}
            </div>
            <div className="answer-item">
              <strong>Title:</strong> {currentTrack.name}
            </div>
            <div className="answer-item">
              <strong>Lyrics:</strong> <em>Players need to guess lyrics from the song</em>
            </div>
            {currentTrack.lyrics && currentTrack.lyrics !== `Lyrics not available for ${currentTrack.name} by ${currentTrack.artists[0]}` && (
              <div className="lyrics-preview">
                <strong>Lyrics Preview:</strong>
                <div className="lyrics-text">
                  {currentTrack.lyrics.substring(0, 200)}...
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Player Tracking */}
      <div className="card">
        <h2 className="subtitle">👥 Connected Players</h2>
        <div className="flex-between mb-20">
          <span>Total Players: {Object.keys(players).length}</span>
          <button className="btn btn-secondary" onClick={resetScores}>
            Reset Scores
          </button>
        </div>
        
        {Object.keys(players).length > 0 ? (
          <div className="player-list">
            {Object.entries(players).map(([socketId, playerName]) => (
              <div key={socketId} className="player-item">
                <span>{playerName}</span>
                <span className="score">{scores[playerName] || 0} points</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center">No players connected yet.</p>
        )}
      </div>

      {/* Game Instructions */}
      <div className="card">
        <h2 className="subtitle">📖 Admin Instructions</h2>
        <ul>
          <li>Load a Spotify playlist using the URL</li>
          <li>Click "Play" on any track to start playing it</li>
          <li>Players will be able to guess the song details</li>
          <li>Monitor player scores in real-time</li>
          <li>Use "Reset Scores" to start a new round</li>
          <li>Select a new playlist anytime to change the game</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminPage; 