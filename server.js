const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const SpotifyWebApi = require('spotify-web-api-node');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://127.0.0.1:3001",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Spotify API configuration
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI
});

// Lyrics.ovh API configuration (no authentication required)
const LYRICS_OVH_BASE_URL = 'https://api.lyrics.ovh/v1';

// Game state
let gameState = {
  currentSong: null,
  players: {}, // socketId -> playerName
  scores: {}, // playerName -> score (persistent)
  isPlaying: false,
  currentPlaylist: null,
  accessToken: null,
  guessedParts: {
    artist: false,
    title: false,
    lyrics: false
  },
  trackStatus: {}, // Track status for each song: 'unplayed', 'played', 'partial', 'complete'
  songStates: {}, // Persistent state for each song: { isComplete, lyricsGuessed, bonusAwarded, playersWhoGuessed, currentGuesses }
  bonusAwarded: false, // Track if bonus point has been awarded for current song
  playersWhoGuessed: new Set(), // Track which players have made correct guesses this round
  activeUsernames: new Set(), // Track which usernames are currently connected
  currentGuesses: {
    artist: [],
    title: [],
    lyrics: []
  }, // Track all guesses for current song: { guess: string, player: string, timestamp: Date }
  lastGuessTimestamps: {}, // playerName -> timestamp of last guess (ms)
};

// Function to fetch lyrics from lyrics.ovh API
async function fetchLyrics(artistName, songTitle) {
  try {
    console.log('🎵 Starting lyrics fetch process...');
    console.log(`📝 Searching for: "${songTitle}" by "${artistName}"`);
    
    // Clean and encode the artist and song names for the API
    const cleanArtist = encodeURIComponent(artistName.trim());
    const cleanSong = encodeURIComponent(songTitle.trim());
    
    console.log(`🔍 Fetching from lyrics.ovh: ${cleanArtist}/${cleanSong}`);
    
    // Make request to lyrics.ovh API
    const response = await axios.get(`${LYRICS_OVH_BASE_URL}/${cleanArtist}/${cleanSong}`, {
      timeout: 10000, // 10 second timeout
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (response.data && response.data.lyrics) {
      const lyrics = response.data.lyrics.trim();
      if (lyrics.length > 0) {
        console.log(`✅ Successfully fetched lyrics (${lyrics.length} characters)`);
        console.log(`📄 Lyrics preview: "${lyrics.substring(0, 100)}..."`);
        return lyrics;
      }
    }
    
    console.log('❌ No lyrics found in response');
    return null;
    
  } catch (error) {
    console.error('❌ Error fetching lyrics from lyrics.ovh:', error);
    console.error('🔍 Error details:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      artistName,
      songTitle
    });
    
    // Check if it's a 404 (song not found)
    if (error.response?.status === 404) {
      console.log('❌ Song not found in lyrics.ovh database');
      return null;
    }
    
    // Check if it's a timeout or network error
    if (error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND') {
      console.log('❌ Network error or timeout');
      return null;
    }
    
    return null;
  }
}

// Function to normalize text for lyrics comparison
function normalizeText(text) {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation and special characters
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim();
}

// Function to count letters in text (excluding spaces and special characters)
function countLetters(text) {
  if (!text) return 0;
  
  return text
    .toLowerCase()
    .replace(/[^\w]/g, '') // Remove all non-word characters
    .length;
}

// Function to normalize song titles for comparison
function normalizeTitle(title) {
  if (!title) return '';
  
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, '') // Remove anything in parentheses
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim();
}

// Function to normalize artist names for comparison
function normalizeArtist(artist) {
  if (!artist) return '';
  
  return artist
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim();
}

// Function to update track status
function updateTrackStatus(trackId, status) {
  gameState.trackStatus[trackId] = status;
  console.log(`Track ${trackId} status updated to: ${status}`);
}

// Function to get track status
function getTrackStatus(trackId) {
  return gameState.trackStatus[trackId] || 'unplayed';
}

// Function to fetch all tracks from a playlist (handles pagination)
async function fetchAllPlaylistTracks(playlistId) {
  try {
    let allTracks = [];
    let offset = 0;
    const limit = 100; // Spotify API limit per request
    
    while (true) {
      console.log(`Fetching playlist tracks: offset ${offset}, limit ${limit}`);
      
      const response = await spotifyApi.getPlaylistTracks(playlistId, {
        offset: offset,
        limit: limit
      });
      
      const tracks = response.body.items;
      allTracks = allTracks.concat(tracks);
      
      console.log(`Fetched ${tracks.length} tracks (total so far: ${allTracks.length})`);
      
      // If we got fewer tracks than the limit, we've reached the end
      if (tracks.length < limit) {
        break;
      }
      
      offset += limit;
    }
    
    console.log(`Successfully fetched all ${allTracks.length} tracks from playlist`);
    return allTracks;
  } catch (error) {
    console.error('Error fetching all playlist tracks:', error);
    throw error;
  }
}

// Admin password verification
app.post('/api/verify-admin', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  if (!adminPassword) {
    return res.status(500).json({ error: 'Admin password not configured' });
  }
  
  if (password === adminPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid admin password' });
  }
});

// Spotify authentication
app.get('/auth/spotify', (req, res) => {
  const scopes = ['user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing'];
  const authorizeURL = spotifyApi.createAuthorizeURL(scopes);
  res.json({ url: authorizeURL });
});

app.get('/auth/spotify/callback', async (req, res) => {
  const { code } = req.query;
  
  try {
    const data = await spotifyApi.authorizationCodeGrant(code);
    gameState.accessToken = data.body.access_token;
    spotifyApi.setAccessToken(data.body.access_token);
    
    res.redirect(`${process.env.FRONTEND_URL || 'http://127.0.0.1:3001'}/admin`);
  } catch (error) {
    console.error('Error getting tokens:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://127.0.0.1:3001'}/?error=auth_failed`);
  }
});

// API endpoints
app.post('/api/playlist', async (req, res) => {
  const { playlistUrl } = req.body;
  
  if (!gameState.accessToken) {
    return res.status(401).json({ error: 'Not authenticated with Spotify' });
  }
  
  try {
    // Extract playlist ID from URL
    const playlistId = playlistUrl.split('/playlist/')[1]?.split('?')[0];
    if (!playlistId) {
      return res.status(400).json({ error: 'Invalid playlist URL' });
    }
    
    // Get playlist metadata
    const playlist = await spotifyApi.getPlaylist(playlistId);
    
    // Fetch all tracks from the playlist (handles pagination)
    const allTracks = await fetchAllPlaylistTracks(playlistId);
    
    // Create the complete playlist object with all tracks
    const completePlaylist = {
      ...playlist.body,
      tracks: {
        ...playlist.body.tracks,
        items: allTracks
      }
    };
    
    gameState.currentPlaylist = completePlaylist;
    
    // Initialize track status for all tracks
    allTracks.forEach(item => {
      if (item.track && item.track.id) {
        gameState.trackStatus[item.track.id] = 'unplayed';
      }
    });
    
    console.log(`Initialized track status for ${allTracks.length} tracks`);
    
    res.json({ success: true, playlist: completePlaylist });
  } catch (error) {
    console.error('Error fetching playlist:', error);
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

app.post('/api/play', async (req, res) => {
  const { trackUri } = req.body;
  
  if (!gameState.accessToken) {
    return res.status(401).json({ error: 'Not authenticated with Spotify' });
  }
  
  try {
    // First, check if user has an active device
    const devices = await spotifyApi.getMyDevices();
    const activeDevices = devices.body.devices.filter(device => device.is_active);
    
    if (activeDevices.length === 0) {
      return res.status(400).json({ 
        error: 'No active Spotify device found. Please open Spotify on your desktop, mobile, or web player and make sure it\'s playing or ready to play.' 
      });
    }
    
    // Try to play the track
    await spotifyApi.play({ uris: [trackUri] });
    gameState.isPlaying = true;
    
    // Get track details
    const trackId = trackUri.split(':')[2];
    const track = await spotifyApi.getTrack(trackId);
    
    // Fetch lyrics from lyrics.ovh
    const artistName = track.body.artists[0].name;
    const songTitle = track.body.name;
    const lyrics = await fetchLyrics(artistName, songTitle);
    
    const songData = {
      id: track.body.id,
      name: track.body.name,
      artists: track.body.artists.map(artist => artist.name),
      album: track.body.album.name,
      uri: track.body.uri,
      lyrics: lyrics,
      lyricsAvailable: !!lyrics && lyrics.trim().length > 0
    };
    
    // Check if this song has been played before and get its previous state
    const previousSongState = gameState.songStates && gameState.songStates[songData.id];
    
    if (previousSongState) {
      // Song was played before, restore its previous state (complete or partial)
      gameState.currentSong = songData;
      gameState.guessedParts = {
        artist: previousSongState.guessedParts?.artist || false,
        title: previousSongState.guessedParts?.title || false,
        lyrics: previousSongState.guessedParts?.lyrics || false
      };
      // Set lyrics as unavailable if no lyrics were fetched
      if (!songData.lyricsAvailable) {
        gameState.guessedParts.lyrics = null; // null means unavailable
      }
      gameState.bonusAwarded = previousSongState.bonusAwarded || false;
      gameState.playersWhoGuessed = new Set(previousSongState.playersWhoGuessed || []);
      gameState.currentGuesses = previousSongState.currentGuesses || { artist: [], title: [], lyrics: [] };
      
      if (previousSongState.isComplete) {
        console.log(`🔄 Restoring completed state for song: ${songData.name}`);
      } else {
        console.log(`🔄 Restoring partial state for song: ${songData.name} - Artist: ${gameState.guessedParts.artist}, Title: ${gameState.guessedParts.title}, Lyrics: ${gameState.guessedParts.lyrics}`);
      }
    } else {
      // New song, start fresh
      gameState.currentSong = songData;
      // Reset guessed parts for new song
      gameState.guessedParts = {
        artist: false,
        title: false,
        lyrics: false
      };
      // Set lyrics as unavailable if no lyrics were fetched
      if (!songData.lyricsAvailable) {
        gameState.guessedParts.lyrics = null; // null means unavailable
      }
      // Reset bonus flag and player tracking for new song
      gameState.bonusAwarded = false;
      gameState.playersWhoGuessed.clear();
      // Clear all guesses for new song
      gameState.currentGuesses = {
        artist: [],
        title: [],
        lyrics: []
      };
    }
    
    // Mark track as played (but don't override 'complete' or 'partial' status)
    const currentStatus = getTrackStatus(track.body.id);
    if (currentStatus !== 'complete' && currentStatus !== 'partial') {
      updateTrackStatus(track.body.id, 'played');
    }
    
    // Notify all clients about new song
    const songDataWithState = {
      ...songData,
      guessedParts: gameState.guessedParts,
      currentGuesses: gameState.currentGuesses
    };
    console.log('Emitting newSong event to all clients:', songDataWithState);
    io.emit('newSong', songDataWithState);
    
    // Emit guesses for new song
    io.emit('guessesUpdated', {
      currentGuesses: gameState.currentGuesses
    });
    
    res.json({ success: true, song: songData });
  } catch (error) {
    console.error('Error playing track:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to play track. ';
    
    if (error.statusCode === 403) {
      errorMessage += 'This feature requires a Spotify Premium account.';
    } else if (error.statusCode === 404) {
      errorMessage += 'No active device found. Please open Spotify and make sure it\'s ready to play.';
    } else if (error.statusCode === 429) {
      errorMessage += 'Too many requests. Please wait a moment and try again.';
    } else {
      errorMessage += 'Make sure Spotify is open and playing, and you have a Premium account.';
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/pause', async (req, res) => {
  if (!gameState.accessToken) {
    return res.status(401).json({ error: 'Not authenticated with Spotify' });
  }
  
  try {
    await spotifyApi.pause();
    gameState.isPlaying = false;
    io.emit('playbackPaused');
    res.json({ success: true });
  } catch (error) {
    console.error('Error pausing playback:', error);
    res.status(500).json({ error: 'Failed to pause playback' });
  }
});

app.post('/api/resume', async (req, res) => {
  if (!gameState.accessToken) {
    return res.status(401).json({ error: 'Not authenticated with Spotify' });
  }
  
  try {
    await spotifyApi.play();
    gameState.isPlaying = true;
    io.emit('playbackResumed');
    res.json({ success: true });
  } catch (error) {
    console.error('Error resuming playback:', error);
    res.status(500).json({ error: 'Failed to resume playback' });
  }
});

app.post('/api/reset-scores', (req, res) => {
  gameState.scores = {};
  io.emit('scoresReset');
  res.json({ success: true });
});

app.get('/api/track-status', (req, res) => {
  res.json({ success: true, trackStatus: gameState.trackStatus });
});

app.post('/api/reset-playlist', (req, res) => {
  // Reset all track status to unplayed
  Object.keys(gameState.trackStatus).forEach(trackId => {
    gameState.trackStatus[trackId] = 'unplayed';
  });
  
  // Clear all persistent song states
  gameState.songStates = {};
  
  // Reset current song and guessed parts
  gameState.currentSong = null;
  gameState.guessedParts = {
    artist: false,
    title: false,
    lyrics: false
  };
  gameState.isPlaying = false;
  gameState.bonusAwarded = false;
  gameState.playersWhoGuessed.clear();
  gameState.activeUsernames.clear();
  gameState.currentGuesses = {
    artist: [],
    title: [],
    lyrics: []
  };
  
  console.log('🔄 Playlist reset - cleared all song states');
  
  // Notify all clients
  io.emit('playlistReset');
  
  res.json({ success: true });
});

// Get available Spotify devices
app.get('/api/devices', async (req, res) => {
  if (!gameState.accessToken) {
    return res.status(401).json({ error: 'Not authenticated with Spotify' });
  }
  
  try {
    const devices = await spotifyApi.getMyDevices();
    res.json({ success: true, devices: devices.body.devices });
  } catch (error) {
    console.error('Error getting devices:', error);
    res.status(500).json({ error: 'Failed to get devices' });
  }
});

// Debug endpoint for lyrics configuration
app.get('/api/debug/lyrics', (req, res) => {
  console.log('🔍 Lyrics debug endpoint called');
  
  res.json({
    success: true,
    lyricsService: 'lyrics.ovh',
    baseUrl: LYRICS_OVH_BASE_URL,
    message: 'Lyrics.ovh API is configured (no authentication required)',
    environment: process.env.NODE_ENV || 'development',
    serverTime: new Date().toISOString()
  });
});

// Simple lyrics.ovh API test endpoint
app.get('/api/debug/lyrics-test', async (req, res) => {
  try {
    console.log('🧪 Simple lyrics.ovh API test...');
    
    // Test with a well-known song
    const testArtist = 'Queen';
    const testSong = 'Bohemian Rhapsody';
    
    console.log(`🔍 Testing with: "${testSong}" by "${testArtist}"`);
    
    const lyrics = await fetchLyrics(testArtist, testSong);
    
    if (lyrics) {
      res.json({
        success: true,
        message: 'Lyrics.ovh API is working!',
        testArtist,
        testSong,
        lyricsLength: lyrics.length,
        lyricsPreview: lyrics.substring(0, 200) + '...'
      });
    } else {
      res.json({
        success: false,
        message: 'Lyrics fetching failed',
        testArtist,
        testSong,
        error: 'No lyrics returned from lyrics.ovh API'
      });
    }
  } catch (error) {
    console.error('❌ Lyrics.ovh API test failed:', error);
    res.json({
      success: false,
      error: error.message,
      message: 'Lyrics.ovh API test failed',
      stack: error.stack
    });
  }
});

// Detailed lyrics.ovh API diagnostics endpoint
app.get('/api/debug/lyrics-diagnostics', async (req, res) => {
  try {
    console.log('🔍 Running lyrics.ovh API diagnostics...');
    
    const diagnostics = {
      lyricsService: 'lyrics.ovh',
      baseUrl: LYRICS_OVH_BASE_URL,
      environment: process.env.NODE_ENV || 'development',
      serverTime: new Date().toISOString(),
      userAgent: req.get('User-Agent'),
      clientIP: req.ip || req.connection.remoteAddress
    };
    
    // Test different songs to see success rate
    const testSongs = [
      { artist: 'Queen', song: 'Bohemian Rhapsody' },
      { artist: 'The Beatles', song: 'Hey Jude' },
      { artist: 'Michael Jackson', song: 'Billie Jean' }
    ];
    const testResults = {};
    
    for (const test of testSongs) {
      try {
        console.log(`🔍 Testing: "${test.song}" by "${test.artist}"`);
        const lyrics = await fetchLyrics(test.artist, test.song);
        testResults[`${test.artist} - ${test.song}`] = {
          success: !!lyrics,
          lyricsLength: lyrics ? lyrics.length : 0,
          hasLyrics: !!lyrics
        };
      } catch (error) {
        testResults[`${test.artist} - ${test.song}`] = {
          success: false,
          error: error.message,
          status: error.response?.status
        };
      }
    }
    
    diagnostics.testResults = testResults;
    
    res.json({
      success: true,
      diagnostics
    });
    
  } catch (error) {
    console.error('❌ Lyrics.ovh diagnostics failed:', error);
    res.json({
      success: false,
      error: error.message,
      message: 'Lyrics.ovh diagnostics failed',
      stack: error.stack
    });
  }
});

// Test lyrics fetching endpoint
app.get('/api/debug/test-lyrics', async (req, res) => {
  try {
    console.log('🧪 Testing lyrics fetching...');
    
    // Test with a well-known song
    const testArtist = 'Queen';
    const testSong = 'Bohemian Rhapsody';
    
    console.log(`🧪 Testing with: "${testSong}" by "${testArtist}"`);
    
    const lyrics = await fetchLyrics(testArtist, testSong);
    
    if (lyrics) {
      res.json({
        success: true,
        message: 'Lyrics fetching is working!',
        testArtist,
        testSong,
        lyricsLength: lyrics.length,
        lyricsPreview: lyrics.substring(0, 200) + '...'
      });
    } else {
      res.json({
        success: false,
        message: 'Lyrics fetching failed',
        testArtist,
        testSong,
        error: 'No lyrics returned from lyrics.ovh API'
      });
    }
  } catch (error) {
    console.error('🧪 Test lyrics error:', error);
    res.json({
      success: false,
      error: error.message,
      message: 'Lyrics fetching test failed',
      stack: error.stack
    });
  }
});

// Get current playback position
app.get('/api/playback-position', async (req, res) => {
  if (!gameState.accessToken) {
    return res.status(401).json({ error: 'Not authenticated with Spotify' });
  }
  
  try {
    const playback = await spotifyApi.getMyCurrentPlaybackState();
    if (playback.body && playback.body.is_playing) {
      res.json({ 
        success: true, 
        position: playback.body.progress_ms,
        duration: playback.body.item?.duration_ms || 0,
        isPlaying: playback.body.is_playing
      });
    } else {
      res.json({ 
        success: true, 
        position: 0,
        duration: 0,
        isPlaying: false
      });
    }
  } catch (error) {
    console.error('Error getting playback position:', error);
    res.status(500).json({ error: 'Failed to get playback position' });
  }
});

// Seek to position in song
app.post('/api/seek', async (req, res) => {
  const { positionMs } = req.body;
  
  if (!gameState.accessToken) {
    return res.status(401).json({ error: 'Not authenticated with Spotify' });
  }
  
  try {
    await spotifyApi.seek(positionMs);
    res.json({ success: true });
  } catch (error) {
    console.error('Error seeking to position:', error);
    res.status(500).json({ error: 'Failed to seek to position' });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔗 User connected with socket ID:', socket.id);
  
  // Send current game state to new player
  socket.emit('gameState', {
    currentSong: gameState.currentSong,
    players: gameState.players,
    scores: gameState.scores,
    isPlaying: gameState.isPlaying,
    guessedParts: gameState.guessedParts
  });
  
  // Player joins
  socket.on('playerJoin', (playerName) => {
    console.log(`👤 Player attempting to join: ${playerName} (socket: ${socket.id})`);
    
    // Check if username is already taken by another active player
    if (gameState.activeUsernames.has(playerName)) {
      // Check if this is a reconnection (same username, different socket)
      const existingSocketId = Object.keys(gameState.players).find(socketId => 
        gameState.players[socketId] === playerName
      );
      
      if (existingSocketId && existingSocketId !== socket.id) {
        // Username is taken by another active player
        socket.emit('usernameTaken', { error: 'Username is already taken by another player' });
        console.log(`❌ Username "${playerName}" rejected - already taken by another player`);
        return;
      }
    }
    
    // Username is available or this is a reconnection
    gameState.players[socket.id] = playerName;
    gameState.activeUsernames.add(playerName);
    
    // Initialize score if this is a new player, otherwise keep existing score
    if (!gameState.scores[playerName]) {
      gameState.scores[playerName] = 0;
      console.log(`🆕 New player "${playerName}" joined with 0 points`);
    } else {
      console.log(`🔄 Player "${playerName}" reconnected with ${gameState.scores[playerName]} points`);
    }
    
    io.emit('playerJoined', { playerName, players: gameState.players, scores: gameState.scores });
    console.log(`📊 Updated players:`, gameState.players);
    console.log(`📊 Updated scores:`, gameState.scores);
  });
  
  // Player makes a guess
  socket.on('makeGuess', (guess) => {
    const playerName = gameState.players[socket.id];
    if (!playerName || !gameState.currentSong) return;

    // --- RATE LIMITING: 1 guess per second per player ---
    const now = Date.now();
    const lastGuess = gameState.lastGuessTimestamps[playerName] || 0;
    if (now - lastGuess < 1000) {
      socket.emit('validationError', { error: 'You can only guess once per second. Please wait a moment.' });
      return;
    }
    gameState.lastGuessTimestamps[playerName] = now;
    // --- END RATE LIMITING ---

    const { artist, title, lyrics } = guess;
    let correctParts = [];
    let allPartsGuessed = true;
    let validationError = null;
    
    // Track all guesses (both correct and incorrect)
    const timestamp = new Date();
    if (artist && artist.trim()) {
      gameState.currentGuesses.artist.push({
        guess: artist.trim(),
        player: playerName,
        timestamp: timestamp
      });
    }
    if (title && title.trim()) {
      gameState.currentGuesses.title.push({
        guess: title.trim(),
        player: playerName,
        timestamp: timestamp
      });
    }
    if (lyrics && lyrics.trim()) {
      gameState.currentGuesses.lyrics.push({
        guess: lyrics.trim(),
        player: playerName,
        timestamp: timestamp
      });
    }
    
    // Check artist guess
    if (artist && !gameState.guessedParts.artist) {
      // Normalize the guess for comparison
      const normalizedGuess = normalizeArtist(artist);
      
      // Check against all artists in the song
      const correctArtist = gameState.currentSong.artists.find(a => {
        const normalizedArtist = normalizeArtist(a);
        return normalizedArtist.includes(normalizedGuess) || normalizedGuess.includes(normalizedArtist);
      });
      
      if (correctArtist) {
        gameState.guessedParts.artist = true;
        gameState.scores[playerName]++;
        correctParts.push('artist');
        console.log(`🎤 Artist guessed correctly by ${playerName}: ${artist} (matched: ${correctArtist}, normalized: ${normalizedGuess})`);
      }
    }
    
    // Check title guess
    if (title && !gameState.guessedParts.title) {
      // Normalize both the actual title and the guess for comparison
      const normalizedActualTitle = normalizeTitle(gameState.currentSong.name);
      const normalizedGuess = normalizeTitle(title);
      
      if (normalizedActualTitle.includes(normalizedGuess) || normalizedGuess.includes(normalizedActualTitle)) {
        gameState.guessedParts.title = true;
        gameState.scores[playerName]++;
        correctParts.push('title');
        console.log(`🎵 Title guessed correctly by ${playerName}: ${title} (normalized: ${normalizedGuess})`);
      }
    }
    
    // Check lyrics guess
    if (lyrics && gameState.guessedParts.lyrics !== null) {
      // Check if lyrics are available for guessing
      if (!gameState.guessedParts.lyrics) {
        // Check minimum length requirement (12 letters)
        const letterCount = countLetters(lyrics);
        if (letterCount < 12) {
          validationError = `Lyrics guess must be at least 12 letters long (you have ${letterCount})`;
          socket.emit('validationError', { error: validationError });
          return;
        }
        
        // Normalize both the lyrics and the guess for comparison
        const normalizedLyrics = normalizeText(gameState.currentSong.lyrics);
        const normalizedGuess = normalizeText(lyrics);
        
        if (normalizedLyrics.includes(normalizedGuess)) {
          gameState.guessedParts.lyrics = true;
          gameState.scores[playerName]++;
          correctParts.push('lyrics');
          console.log(`📝 Lyrics guessed correctly by ${playerName}: ${lyrics}`);
        }
      }
    } else if (lyrics && gameState.guessedParts.lyrics === null) {
      // Lyrics are not available, inform the player
      socket.emit('validationError', { error: 'Lyrics are not available for this song. You cannot guess lyrics.' });
      return;
    }
    
    // Check if all available parts have been guessed
    const artistGuessed = gameState.guessedParts.artist;
    const titleGuessed = gameState.guessedParts.title;
    const lyricsGuessed = gameState.guessedParts.lyrics === true; // true means guessed, false means not guessed, null means unavailable
    
    if (!artistGuessed || !titleGuessed || (gameState.guessedParts.lyrics !== null && !lyricsGuessed)) {
      allPartsGuessed = false;
    }
    
    // Save the song state for persistence (both partial and complete)
    if (gameState.currentSong) {
      const isComplete = allPartsGuessed;
      gameState.songStates[gameState.currentSong.id] = {
        isComplete: isComplete,
        guessedParts: { ...gameState.guessedParts },
        bonusAwarded: gameState.bonusAwarded,
        playersWhoGuessed: Array.from(gameState.playersWhoGuessed),
        currentGuesses: { ...gameState.currentGuesses }
      };
      
      if (isComplete) {
        // Mark track as complete
        updateTrackStatus(gameState.currentSong.id, 'complete');
        console.log(`💾 Saved completed state for song: ${gameState.currentSong.name}`);
      } else {
        // Mark track as partial if any parts are guessed
        const anyGuessed = gameState.guessedParts.artist || gameState.guessedParts.title || gameState.guessedParts.lyrics === true;
        if (anyGuessed) {
          updateTrackStatus(gameState.currentSong.id, 'partial');
          console.log(`💾 Saved partial state for song: ${gameState.currentSong.name} - Artist: ${gameState.guessedParts.artist}, Title: ${gameState.guessedParts.title}, Lyrics: ${gameState.guessedParts.lyrics}`);
        }
      }
    }
    
    if (correctParts.length > 0) {
      // Track that this player made a correct guess
      gameState.playersWhoGuessed.add(playerName);
      
      // Award bonus point if this player just completed all parts, bonus hasn't been awarded yet,
      // and this is the only player who has made correct guesses this round
      let bonusAwarded = false;
      if (allPartsGuessed && !gameState.bonusAwarded && gameState.playersWhoGuessed.size === 1) {
        gameState.scores[playerName]++;
        gameState.bonusAwarded = true;
        bonusAwarded = true;
        console.log(`🏆 ${playerName} earned a bonus point for completing all parts alone!`);
      }
      
      // Update track status based on guessing progress
      if (gameState.currentSong && gameState.currentSong.id) {
        const currentStatus = getTrackStatus(gameState.currentSong.id);
        if (currentStatus === 'played' && !allPartsGuessed) {
          updateTrackStatus(gameState.currentSong.id, 'partial');
        } else if (allPartsGuessed) {
          updateTrackStatus(gameState.currentSong.id, 'complete');
        }
      }
      
      io.emit('correctGuess', { 
        playerName, 
        players: gameState.players, 
        scores: gameState.scores,
        guessedParts: gameState.guessedParts,
        correctParts,
        allPartsGuessed,
        bonusAwarded
      });
      console.log(`✅ ${playerName} earned ${correctParts.length} point(s) for: ${correctParts.join(', ')}${bonusAwarded ? ' + 1 bonus point' : ''}`);
    } else {
      socket.emit('incorrectGuess');
    }
    
    // Emit updated guesses to all clients (including admin)
    io.emit('guessesUpdated', {
      currentGuesses: gameState.currentGuesses
    });
  });
  
  // Player disconnects
  socket.on('disconnect', () => {
    const playerName = gameState.players[socket.id];
    if (playerName) {
      delete gameState.players[socket.id];
      // Clean up last guess timestamp
      delete gameState.lastGuessTimestamps[playerName];
      
      // Check if this username is still used by other active players
      const usernameStillActive = Object.values(gameState.players).includes(playerName);
      if (!usernameStillActive) {
        gameState.activeUsernames.delete(playerName);
        console.log(`👋 Player "${playerName}" disconnected (username now available)`);
      } else {
        console.log(`👋 Player "${playerName}" disconnected (username still in use by another connection)`);
      }
      
      io.emit('playerLeft', { playerName, players: gameState.players, scores: gameState.scores });
      console.log(`📊 Updated players:`, gameState.players);
      console.log(`📊 Scores remain persistent:`, gameState.scores);
    }
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 