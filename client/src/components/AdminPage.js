import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';

const AdminPage = () => {
  const navigate = useNavigate();
  const { logoutAdmin } = useAuth();
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
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);
  const [trackStatus, setTrackStatus] = useState({});
  const [currentGuesses, setCurrentGuesses] = useState({
    artist: [],
    title: [],
    lyrics: []
  });
  const [scrapingProgress, setScrapingProgress] = useState({
    isScraping: false,
    currentIndex: 0,
    successfulCount: 0,
    totalCount: 0,
    progress: 0
  });
  const [lyricsAvailability, setLyricsAvailability] = useState({});
  const [manualLyricsTrackId, setManualLyricsTrackId] = useState(null);
  const [manualLyricsText, setManualLyricsText] = useState('');
  const [playlistHidden, setPlaylistHidden] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [newScore, setNewScore] = useState('');
  // Add state for editing lyrics in Now Playing
  const [editingLyrics, setEditingLyrics] = useState(false);
  const [editedLyricsText, setEditedLyricsText] = useState('');

  useEffect(() => {
    // Check if user is authenticated
    const checkAuthStatus = async () => {
      try {
        // Check if we have a valid Spotify token
        const response = await axios.get('/api/devices');
        // If this succeeds, we have a valid token
        console.log('Spotify authentication verified');
      } catch (error) {
        console.error('Spotify auth check failed:', error);
        // Don't redirect, just show that Spotify needs to be authenticated
        setError('Please authenticate with Spotify to use admin features');
      }
    };

    checkAuthStatus();

    // Initialize Socket.IO connection for admin
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:5001';
    console.log('Admin: Attempting to connect to Socket.IO server at', backendUrl);
    const newSocket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000
    });
    setSocket(newSocket);

    // Socket event listeners for admin
    newSocket.on('connect', () => {
      console.log('Admin connected to server with socket ID:', newSocket.id);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Admin socket connection error:', error);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Admin disconnected from server:', reason);
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
      // Update track status when guesses happen
      getTrackStatus();
      
      // Log bonus point if awarded
      if (data.bonusAwarded) {
        console.log(`🏆 Bonus point awarded to ${data.playerName} for completing all parts first!`);
      }
    });

    newSocket.on('scoresReset', () => {
      console.log('Admin: Scores reset');
      setScores({});
    });

    newSocket.on('playlistReset', () => {
      console.log('Admin: Playlist reset');
      setTrackStatus({});
      setCurrentTrack(null);
      setIsPlaying(false);
      setCurrentGuesses({ artist: [], title: [], lyrics: [] });
      setLyricsAvailability({}); // Reset lyrics availability on playlist reset
    });

    newSocket.on('guessesUpdated', (data) => {
      console.log('Admin: Guesses updated:', data.currentGuesses);
      setCurrentGuesses(data.currentGuesses);
    });

    newSocket.on('scrapingProgress', (data) => {
      console.log('Admin: Scraping progress:', data);
      setScrapingProgress(data);
      // After scraping is completed or stopped, recheck lyrics availability
      if (!data.isScraping) {
        checkLyricsAvailability();
      }
    });

    newSocket.on('newSong', (song) => {
      console.log('Admin: New song received:', song);
      console.log('Admin: Lyrics debug:', {
        hasLyrics: !!song.lyrics,
        lyricsLength: song.lyrics ? song.lyrics.length : 0,
        lyricsPreview: song.lyrics ? song.lyrics.substring(0, 100) : 'No lyrics',
        lyricsType: typeof song.lyrics,
        lyricsAvailable: song.lyricsAvailable
      });
      setCurrentTrack(song);
      setIsPlaying(true);
      
      // Check if this song has any previous progress
      const hasProgress = song.guessedParts && (
        song.guessedParts.artist || 
        song.guessedParts.title || 
        song.guessedParts.lyrics === true
      );
      
      const isCompleted = song.guessedParts && 
        song.guessedParts.artist && 
        song.guessedParts.title && 
        (song.guessedParts.lyrics === true || song.guessedParts.lyrics === null);
      
      setGuessedParts(song.guessedParts || { artist: false, title: false, lyrics: false });
      setCurrentGuesses(song.currentGuesses || { artist: [], title: [], lyrics: [] });
      
      if (isCompleted) {
        console.log('Admin: Song is already completed, guessing disabled');
      } else if (hasProgress) {
        console.log('Admin: Song has partial progress, some guessing disabled');
      }
    });

    return () => {
      newSocket.close();
    };
  }, [navigate]);

  useEffect(() => {
    if (tracks && tracks.length > 0) {
      checkLyricsAvailability();
    }
  }, [tracks]);

  // Update playback position periodically when playing
  useEffect(() => {
    let interval;
    if (currentTrack) {
      // Get initial position
      getPlaybackPosition();
      
      // Update position every second when playing
      if (isPlaying) {
        interval = setInterval(getPlaybackPosition, 1000);
      }
    } else {
      setPlaybackPosition(0);
      setPlaybackDuration(0);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isPlaying, currentTrack]);

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

  const testLyricsFetching = async () => {
    try {
      const response = await axios.get('/api/debug/test-lyrics');
      console.log('Lyrics test:', response.data);
      if (response.data.success) {
        alert(`Lyrics Test: SUCCESS!\n\nSong: ${response.data.testSong} by ${response.data.testArtist}\nLyrics length: ${response.data.lyricsLength}\n\nPreview:\n${response.data.lyricsPreview}`);
      } else {
        alert(`Lyrics Test: FAILED!\n\nError: ${response.data.error}\nMessage: ${response.data.message}`);
      }
    } catch (error) {
      console.error('Error testing lyrics:', error);
      alert('Failed to test lyrics fetching');
    }
  };

  const testLyricsAPI = async () => {
    try {
      const response = await axios.get('/api/debug/lyrics-test');
      console.log('Lyrics API test:', response.data);
      if (response.data.success) {
        alert(`Lyrics API Test: SUCCESS!\n\nSong: ${response.data.testSong} by ${response.data.testArtist}\nLyrics length: ${response.data.lyricsLength}\n\nPreview:\n${response.data.lyricsPreview}`);
      } else {
        alert(`Lyrics API Test: FAILED!\n\nError: ${response.data.error}\nMessage: ${response.data.message}`);
      }
    } catch (error) {
      console.error('Error testing lyrics API:', error);
      alert('Failed to test lyrics API');
    }
  };

  const runLyricsDiagnostics = async () => {
    try {
      const response = await axios.get('/api/debug/lyrics-diagnostics');
      console.log('Lyrics diagnostics:', response.data);
      if (response.data.success) {
        const diag = response.data.diagnostics;
        let message = `Lyrics Diagnostics:\n\n`;
        message += `Service: ${diag.lyricsService}\n`;
        message += `Base URL: ${diag.baseUrl}\n`;
        message += `Environment: ${diag.environment}\n`;
        message += `Server time: ${diag.serverTime}\n\n`;
        message += `Test Results:\n`;
        
        Object.entries(diag.testResults).forEach(([song, result]) => {
          if (result.success) {
            message += `"${song}": SUCCESS (${result.lyricsLength} chars)\n`;
          } else {
            message += `"${song}": FAILED (${result.status || 'unknown'}) - ${result.error}\n`;
          }
        });
        
        alert(message);
      } else {
        alert(`Lyrics Diagnostics: FAILED!\n\nError: ${response.data.error}\nMessage: ${response.data.message}`);
      }
    } catch (error) {
      console.error('Error running lyrics diagnostics:', error);
      alert('Failed to run lyrics diagnostics');
    }
  };

  const authenticateSpotify = async () => {
    try {
      const response = await axios.get('/auth/spotify');
      window.location.href = response.data.url;
    } catch (error) {
      console.error('Error initiating Spotify auth:', error);
      setError('Failed to connect to Spotify');
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
      // Get track status after loading playlist
      await getTrackStatus();
      setError('');
      // Check lyrics availability after playlist loads
      await checkLyricsAvailability();
    } catch (error) {
      setError('Failed to load playlist. Please check the URL and try again. Please ensure that the playlist is public and that it is not created by Spotify or a bot.');
      console.error('Playlist error:', error);
    } finally {
      setLoading(false);
    }
  };

  const playTrack = async (track) => {
    try {
      console.log('Admin: Playing track:', track);
      const response = await axios.post('/api/play', { trackUri: track.uri });
      console.log('Admin: Play response:', response.data);
      
      if (response.data.song) {
        console.log('Admin: Song data received:', response.data.song);
        console.log('Admin: Lyrics in response:', {
          hasLyrics: !!response.data.song.lyrics,
          lyricsLength: response.data.song.lyrics ? response.data.song.lyrics.length : 0,
          lyricsPreview: response.data.song.lyrics ? response.data.song.lyrics.substring(0, 100) : 'No lyrics'
        });
        setCurrentTrack(response.data.song);
      } else {
        setCurrentTrack(track);
      }
      
      setIsPlaying(true);
      setError('');
      // Update track status after playing
      await getTrackStatus();
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

  const resumePlayback = async () => {
    try {
      await axios.post('/api/resume');
      setIsPlaying(true);
      setError('');
    } catch (error) {
      setError('Failed to resume playback.');
      console.error('Resume error:', error);
    }
  };

  const togglePlayback = async () => {
    if (isPlaying) {
      await pausePlayback();
    } else {
      await resumePlayback();
    }
  };

  const resetScores = async () => {
    // Show confirmation dialog
    const confirmed = window.confirm('Are you sure you want to reset all player scores?');
    
    if (!confirmed) {
      return; // User cancelled
    }
    
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
    // Show confirmation dialog
    const confirmed = window.confirm('Are you sure you want to select a new playlist? This will clear the current playlist and stop the current song.');
    
    if (!confirmed) {
      return; // User cancelled
    }
    
    setPlaylist(null);
    setTracks([]);
    setCurrentTrack(null);
    setIsPlaying(false);
    setPlaylistUrl('');
    setLyricsAvailability({}); // Reset lyrics availability on new playlist selection
  };

  const handleLogout = () => {
    logoutAdmin();
    navigate('/');
  };

  // Get current playback position
  const getPlaybackPosition = async () => {
    try {
      const response = await axios.get('/api/playback-position');
      if (response.data.success) {
        setPlaybackPosition(response.data.position);
        setPlaybackDuration(response.data.duration);
        setIsPlaybackActive(response.data.isPlaying);
      }
    } catch (error) {
      console.error('Error getting playback position:', error);
    }
  };

  // Seek to position in song
  const seekToPosition = async (positionMs) => {
    try {
      await axios.post('/api/seek', { positionMs });
      setPlaybackPosition(positionMs);
    } catch (error) {
      console.error('Error seeking to position:', error);
      setError('Failed to seek to position');
    }
  };

  // Handle progress bar click
  const handleProgressClick = (event) => {
    if (!playbackDuration) return;
    
    const progressBar = event.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newPosition = Math.floor(percentage * playbackDuration);
    
    seekToPosition(newPosition);
  };

  // Format time in MM:SS
  const formatTime = (ms) => {
    if (!ms) return '0:00';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Format artists array
  const formatArtists = (artists) => {
    if (Array.isArray(artists)) {
      // If it's an array of strings, join them
      if (typeof artists[0] === 'string') {
        return artists.join(', ');
      }
      // If it's an array of objects with name property
      if (artists[0] && typeof artists[0] === 'object' && artists[0].name) {
        return artists.map(a => a.name).join(', ');
      }
    }
    return 'Unknown Artist';
  };

  // Get track status
  const getTrackStatus = async () => {
    try {
      const response = await axios.get('/api/track-status');
      if (response.data.success) {
        setTrackStatus(response.data.trackStatus);
      }
    } catch (error) {
      console.error('Error getting track status:', error);
    }
  };

  // Reset playlist
  const resetPlaylist = async () => {
    // Show confirmation dialog
    const confirmed = window.confirm('Are you sure you want to reset the playlist? This will clear all track progress and stop the current song.');
    
    if (!confirmed) {
      return; // User cancelled
    }
    
    try {
      await axios.post('/api/reset-playlist');
      setTrackStatus({});
      setCurrentTrack(null);
      setIsPlaying(false);
      setError('');
      setLyricsAvailability({}); // Reset lyrics availability on playlist reset
    } catch (error) {
      setError('Failed to reset playlist.');
      console.error('Reset playlist error:', error);
    }
  };

  // Get status icon
  const getStatusIcon = (trackId) => {
    const status = trackStatus[trackId] || 'unplayed';
    switch (status) {
      case 'unplayed':
        return '🟢'; // Green circle
      case 'played':
        return '🌑'; // Played but not guessed
      case 'partial':
        return '🌗'; // Partially guessed
      case 'complete':
        return '🌕'; // Fully guessed
      default:
        return '🟢';
    }
  };

  // Render guesses for a specific type
  const renderGuesses = (guessType) => {
    const guesses = currentGuesses[guessType] || [];
    if (guesses.length === 0) {
      return <p className="text-center" style={{ color: '#888', fontStyle: 'italic' }}>No guesses yet</p>;
    }
    
    return (
      <div className="guess-list">
        {guesses.map((guess, index) => (
          <div key={index} className="guess-item" onClick={() => handleManualAward(guess.player, guessType, guess.guess)} style={{ cursor: guessedParts[guessType] !== true ? 'pointer' : 'default' }}>
            <span className="guess-text">"{guess.guess}"</span>
            <span className="guess-player">| {guess.player}</span>
          </div>
        ))}
      </div>
    );
  };

  // Play a random unplayed song
  const playRandomUnplayedSong = () => {
    // Find all tracks with 'unplayed' status
    const unplayedTracks = tracks.filter(item => trackStatus[item.track.id] === 'unplayed');
    if (unplayedTracks.length === 0) {
      alert('All songs have been played! No unplayed songs remain.');
      return;
    }
    // Pick a random unplayed track
    const randomIndex = Math.floor(Math.random() * unplayedTracks.length);
    const randomTrack = unplayedTracks[randomIndex].track;
    playTrack(randomTrack);
  };

  // Start lyrics scraping
  const startLyricsScraping = async () => {
    try {
      const response = await axios.post('/api/scrape-lyrics');
      console.log('Started lyrics scraping:', response.data);
      setError('');
    } catch (error) {
      setError('Failed to start lyrics scraping: ' + (error.response?.data?.error || error.message));
      console.error('Lyrics scraping error:', error);
    }
  };

  // Stop lyrics scraping
  const stopLyricsScraping = async () => {
    try {
      const response = await axios.post('/api/stop-scraping');
      console.log('Stopped lyrics scraping:', response.data);
      setError('');
    } catch (error) {
      setError('Failed to stop lyrics scraping: ' + (error.response?.data?.error || error.message));
      console.error('Stop scraping error:', error);
    }
  };

  // Check lyrics availability for all tracks in the current playlist
  const checkLyricsAvailability = async () => {
    try {
      const response = await axios.post('/api/lyrics-availability', { songs: tracks.map(item => ({ id: item.track.id, artist: item.track.artists[0].name, title: item.track.name })) });
      setLyricsAvailability(response.data.availability);
      console.log('Lyrics availability checked:', response.data.availability);
    } catch (error) {
      console.error('Error checking lyrics availability:', error);
      setError('Failed to check lyrics availability for playlist tracks.');
    }
  };

  const handleSaveManualLyrics = async () => {
    if (!manualLyricsText.trim()) {
      alert('Lyrics text cannot be empty.');
      return;
    }
    try {
      await axios.post('/api/manual-lyrics', {
        id: manualLyricsTrackId,
        artist: tracks.find(item => item.track.id === manualLyricsTrackId)?.track.artists[0]?.name,
        title: tracks.find(item => item.track.id === manualLyricsTrackId)?.track.name,
        lyrics: manualLyricsText
      });
      console.log('Manual lyrics saved:', { id: manualLyricsTrackId, lyrics: manualLyricsText });
      setLyricsAvailability(prev => ({ ...prev, [manualLyricsTrackId]: true }));
      setManualLyricsTrackId(null);
      setManualLyricsText('');
      alert('Lyrics saved successfully!');
    } catch (error) {
      console.error('Error saving manual lyrics:', error);
      alert('Failed to save lyrics. Please try again.');
    }
  };

  // 1. Add a function handleManualAward that takes (playerName, guessType, guessText) and POSTs to /api/manual-award with { playerName, guessType, guessText }
  const handleManualAward = async (playerName, guessType, guessText) => {
    try {
      await axios.post('/api/manual-award', { playerName, guessType, guessText });
      console.log(`Point awarded manually to ${playerName} for ${guessType} guess: "${guessText}"`);
      // Refresh scores and guesses after manual award
      await getTrackStatus();
      setGuessedParts(prev => ({ ...prev, [guessType]: true })); // Mark as guessed
      alert(`Manual award awarded to ${playerName} for ${guessType} guess: "${guessText}"`);
    } catch (error) {
      console.error('Error awarding manual guess:', error);
      alert('Failed to award manual guess. Please try again.');
    }
  };

  const handleSaveScore = async () => {
    if (!editingPlayer || !newScore) {
      alert('Please select a player to edit and enter a new score.');
      return;
    }
    try {
      await axios.post('/api/update-score', { playerName: editingPlayer, newScore: parseInt(newScore) });
      setScores(prev => ({ ...prev, [editingPlayer]: parseInt(newScore) }));
      setEditingPlayer(null);
      setNewScore('');
      alert('Score updated successfully!');
    } catch (error) {
      console.error('Error saving score:', error);
      alert('Failed to update score. Please try again.');
    }
  };

  // Add handler for saving edited lyrics for current track
  const handleSaveEditedLyrics = async () => {
    if (!editedLyricsText.trim()) {
      alert('Lyrics text cannot be empty.');
      return;
    }
    try {
      await axios.post('/api/manual-lyrics', {
        id: currentTrack.id,
        artist: formatArtists(currentTrack.artists),
        title: currentTrack.name,
        lyrics: editedLyricsText
      });
      setEditingLyrics(false);
      setEditedLyricsText('');
      // Optionally update currentTrack.lyrics in state
      setCurrentTrack(prev => prev ? { ...prev, lyrics: editedLyricsText } : prev);
      alert('Lyrics updated successfully!');
    } catch (error) {
      console.error('Error saving edited lyrics:', error);
      alert('Failed to update lyrics. Please try again.');
    }
  };

  return (
    <div className="container">
      <div className="admin-header">
        <h1 className="title">Admin Panel</h1>
        <button className="btn btn-danger" onClick={handleLogout}>
          Logout
        </button>
      </div>
      
      {error && (
        <div className="card" style={{ background: '#ffe6e6', border: '1px solid #ff9999' }}>
          <p style={{ color: '#cc0000' }}>{error}</p>
        </div>
      )}

      {/* Spotify Authentication */}
      {error && error.includes('authenticate with Spotify') && (
        <div className="card">
          <h2 className="subtitle">Spotify Authentication Required</h2>
          <p className="text-center mb-20">
            You need to authenticate with Spotify to use admin features.
          </p>
          <div className="flex-center">
            <button className="btn" onClick={authenticateSpotify}>
              Connect Spotify Account
            </button>
          </div>
        </div>
      )}

      {/* Playlist Management */}
      <div className="card">
        <h2 className="subtitle">Playlist Management</h2>
        
        {!playlist ? (
          <form onSubmit={handlePlaylistSubmit}>
            <input
              type="url"
              className="input"
              placeholder="Enter the URL of a public, user-created Spotify playlist"
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
              <h2 className="subtitle">Current Playlist: {playlist.name}</h2>
              <div>
                <button className="btn" onClick={playRandomUnplayedSong}>
                Play Random
                </button>
                <button className="btn btn-secondary" onClick={resetPlaylist} style={{ marginRight: '10px' }}>
                  Reset Playlist
                </button>
                <button className="btn btn-secondary" onClick={selectNewPlaylist} style={{ marginRight: '10px' }}>
                  Select New Playlist
                </button>
                <button className="btn btn-secondary" onClick={() => setPlaylistHidden(!playlistHidden)}>
                  {playlistHidden ? 'Show Playlist' : 'Hide Playlist'}
                </button>
              </div>
            </div>
            {!playlistHidden && (
              <div className="player-list">
                {tracks.map((item, index) => (
                  <div key={item.track.id} className="player-item">
                    <div>
                      <strong>{index + 1}.</strong> {getStatusIcon(item.track.id)}{lyricsAvailability[item.track.id] === true ? '✔️' : lyricsAvailability[item.track.id] === false ? '❌' : ''} {item.track.name} - {item.track.artists.map(a => a.name).join(', ')}
                    </div>
                    {lyricsAvailability[item.track.id] === false && manualLyricsTrackId !== item.track.id && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button className="btn btn-secondary" onClick={() => setManualLyricsTrackId(item.track.id)}>
                          + Lyrics
                        </button>
                        <button 
                          className="btn"
                          onClick={() => playTrack(item.track)}
                          disabled={isPlaying && currentTrack?.id === item.track.id}
                        >
                          {isPlaying && currentTrack?.id === item.track.id ? 'Playing' : 'Play'}
                        </button>
                      </div>
                    )}
                    {lyricsAvailability[item.track.id] === false && manualLyricsTrackId === item.track.id && (
                      <div>
                        <textarea
                          className="input"
                          value={manualLyricsText}
                          onChange={(e) => setManualLyricsText(e.target.value)}
                          rows="3" cols="40" style={{ fontSize: '14px' }}
                        />
                        <div className="flex-center">
                          <button className="btn btn-success" onClick={handleSaveManualLyrics}>
                            Save Lyrics
                          </button>
                          <button className="btn btn-secondary" onClick={() => setManualLyricsTrackId(null)} style={{ marginLeft: '10px' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    {lyricsAvailability[item.track.id] !== false && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button 
                          className="btn"
                          onClick={() => playTrack(item.track)}
                          disabled={isPlaying && currentTrack?.id === item.track.id}
                        >
                          {isPlaying && currentTrack?.id === item.track.id ? 'Playing' : 'Play'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Playback Controls */}
      {!playlistHidden && currentTrack && (
        <div className="card">
          <h2 className="subtitle">Now Playing</h2>
          <div className="now-playing">
            <h3>{currentTrack.name}</h3>
            <p>by {formatArtists(currentTrack.artists)}</p>
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
                <span className="progress-label">Lyrics {guessedParts.lyrics ? '✓' : currentTrack?.lyricsAvailable === false ? '✗' : ''}</span>
              </div>
            </div>
            
            {/* Progress Bar */}
            {currentTrack && playbackDuration > 0 && (
              <div className="progress-bar-container mt-20">
                <div className="progress-bar" onClick={handleProgressClick}>
                  <div 
                    className="progress-fill" 
                    style={{ width: `${(playbackPosition / playbackDuration) * 100}%` }}
                  ></div>
                </div>
                <div className="progress-time">
                  <span>{formatTime(playbackPosition)}</span>
                  <span>{formatTime(playbackDuration)}</span>
                </div>
              </div>
            )}
            
            <div className="flex-center mt-20">
              <button 
                className={`btn ${isPlaying ? 'btn-danger' : 'btn'}`}
                onClick={togglePlayback}
                disabled={!currentTrack}
              >
                {isPlaying ? '⏸️ Pause' : '▶️ Play'}
              </button>
              {/* Edit Lyrics Button */}
              {currentTrack && (
                <button
                  className="btn btn-secondary"
                  style={{ marginLeft: '10px' }}
                  onClick={() => {
                    setEditingLyrics(true);
                    setEditedLyricsText(currentTrack.lyrics || '');
                  }}
                  disabled={editingLyrics}
                >
                  Edit Lyrics
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lyrics Editor Modal/Inline */}
      {editingLyrics && (
        <div className="card" style={{ marginTop: '20px', background: '#f8f9fa' }}>
          <h3>Edit Lyrics for: {currentTrack.name} by {formatArtists(currentTrack.artists)}</h3>
          <textarea
            className="input"
            value={editedLyricsText}
            onChange={e => setEditedLyricsText(e.target.value)}
            rows="6"
            style={{ width: '100%', fontSize: '14px', marginBottom: '10px' }}
          />
          <div className="flex-center">
            <button className="btn btn-success" onClick={handleSaveEditedLyrics}>
              Save
            </button>
            <button className="btn btn-secondary" onClick={() => setEditingLyrics(false)} style={{ marginLeft: '10px' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Correct Answers */}
      {!playlistHidden && currentTrack && (
        <div className="card">
          <h2 className="subtitle">Correct Answers</h2>
          <div className="correct-answers">
            <div className="answer-item">
              <strong>Artist:</strong> {formatArtists(currentTrack.artists)}
            </div>
            <div className="answer-item">
              <strong>Title:</strong> {currentTrack.name}
            </div>
            <div className="answer-item">
              <strong>Lyrics Availability:</strong> 
              {currentTrack.lyricsAvailable ? (
                <em>Lyrics available - players can guess lyrics from the song</em>
              ) : (
                <em>Lyrics not available - players cannot guess lyrics for this song</em>
              )}
            </div>
            {currentTrack.lyricsAvailable && currentTrack.lyrics && currentTrack.lyrics.length > 0 && (
              <div className="answer-item">
                <strong>Lyrics Preview:</strong>
                <div className="lyrics-text">
                  {currentTrack.lyrics.substring(0, 200)}...
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Player Guesses */}
      {!playlistHidden && currentTrack && (
        <div className="card">
          <h2 className="subtitle">Player Guesses - To manually award a point, click on a guess below.</h2>
          <div className="grid">
            <div>
              <h4 style={{ color: '#1db954', marginBottom: '10px' }}>Title Guesses</h4>
              {renderGuesses('title')}
            </div>
            <div>
              <h4 style={{ color: '#1db954', marginBottom: '10px' }}>Artist Guesses</h4>
              {renderGuesses('artist')}
            </div>
            <div>
              <h4 style={{ color: '#1db954', marginBottom: '10px' }}>Lyrics Guesses</h4>
              {renderGuesses('lyrics')}
            </div>
          </div>
        </div>
      )}

      {/* Player Leaderboard */}
      <div className="card">
        <h2 className="subtitle">Leaderboard</h2>
        <div className="flex-between mb-20">
          <button className="btn btn-secondary" onClick={resetScores}>
            Reset Scores
          </button>
        </div>
        
        {Object.keys(scores || {}).length > 0 ? (
          <div className="player-list">
            {Object.entries(scores || {})
              .sort(([,a], [,b]) => b - a)
              .map(([name, score]) => (
                <div key={name} className="player-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {editingPlayer === name ? (
                      <input
                        type="number"
                        className="input"
                        value={newScore}
                        onChange={(e) => setNewScore(e.target.value)}
                        style={{ width: '100px', marginBottom: 0, height: '40px'}}
                      />
                    ) : (
                      <span className="score">{score} points</span>
                    )}
                    {editingPlayer === name ? (
                      <div className="flex-center">
                        <button className="btn btn-success" style={{ marginLeft: '10px', padding: '8px 16px' }} onClick={handleSaveScore}>
                          Save
                        </button>
                        <button className="btn btn-secondary" style={{ marginLeft: '10px', padding: '8px 16px' }} onClick={() => setEditingPlayer(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button className="btn btn-secondary" style={{ padding: '8px 16px' }} onClick={() => { setEditingPlayer(name); setNewScore(score.toString()); }}>
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-center">No scores yet.</p>
        )}
      </div>

      {/* Player Tracking */}
      <div className="card">
        <h2 className="subtitle">Connected Players</h2>
        <div className="flex-between mb-20">
          <span>Total Players: {Object.keys(players).length}</span>
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
        <h2 className="subtitle">Admin Instructions</h2>
        <ul>
          <li>Make sure you have Spotify open in another tab.</li>
          <li>Play a song on that tab, so that authentication is verified.</li>
          <li>Click the "Connect Spotify Account" button to initialize OAuth in this tab.</li>
          <li>Enter a public, user-created Spotify playlist URL in the "Playlist Management" section.</li>
          <li>Once the playlist loads, click "Play" on any track to start playing it.</li>
          <li>Players will then be able to begin guessing song details.</li>
        </ul>
      </div>

            {/* Troubleshooting Tools */}
            <div className="card">
        <h2 className="subtitle">Troubleshooting Tools</h2>
        <div className="flex-center">
          <button className="btn btn-secondary" onClick={checkDevices} style={{ marginRight: '10px' }}>
            Check Spotify Devices
          </button>
          <button className="btn btn-secondary" onClick={testLyricsAPI} style={{ marginRight: '10px' }}>
            Test Lyrics API
          </button>
          <button className="btn btn-secondary" onClick={runLyricsDiagnostics} style={{ marginRight: '10px' }}>
            Lyrics Diagnostics
          </button>
          <button className="btn btn-secondary" onClick={testLyricsFetching}>
            Test Lyrics Fetching
          </button>
          <button className="btn btn-secondary" onClick={startLyricsScraping}>
            Scrape Lyrics
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
        {scrapingProgress.isScraping ? (
          <div style={{ width: '100%', marginTop: 20 }}>
            <div className="flex-between mb-10">
              <span>Progress: {scrapingProgress.successfulCount}/{scrapingProgress.totalCount} songs scraped successfully</span>
              <button className="btn btn-danger" onClick={stopLyricsScraping}>
                Stop Scraping
              </button>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${scrapingProgress.progress}%` }}
                ></div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default AdminPage; 