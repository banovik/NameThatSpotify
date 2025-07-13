const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const SpotifyWebApi = require('spotify-web-api-node');
const { Client } = require('genius-lyrics');
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

// Genius API configuration
const geniusClient = new Client(process.env.GENIUS_ACCESS_TOKEN || '');

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
  bonusAwarded: false, // Track if bonus point has been awarded for current song
  playersWhoGuessed: new Set(), // Track which players have made correct guesses this round
  activeUsernames: new Set(), // Track which usernames are currently connected
  currentGuesses: {
    artist: [],
    title: [],
    lyrics: []
  } // Track all guesses for current song: { guess: string, player: string, timestamp: Date }
};

// Function to fetch lyrics from Genius
async function fetchLyrics(artistName, songTitle) {
  try {
    console.log('🎵 Starting lyrics fetch process...');
    console.log(`📝 Searching for: "${songTitle}" by "${artistName}"`);
    
    if (!process.env.GENIUS_ACCESS_TOKEN) {
      console.log('❌ No Genius access token provided, skipping lyrics fetch');
      console.log('💡 To enable lyrics, add GENIUS_ACCESS_TOKEN to your .env file');
      return null;
    }

    console.log('✅ Genius access token found');
    console.log(`🔍 Searching Genius for: "${songTitle} ${artistName}"`);
    
    // Search for the song on Genius
    const searches = await geniusClient.songs.search(`${songTitle} ${artistName}`);
    
    console.log(`📊 Found ${searches.length} search results on Genius`);
    
    if (searches.length === 0) {
      console.log('❌ No songs found on Genius');
      return null;
    }
    
    // Get the first (most relevant) result
    const song = searches[0];
    console.log(`🎯 Selected result: "${song.title}" by "${song.artist.name}"`);
    console.log(`🔗 Genius URL: ${song.url}`);
    
    // Fetch the lyrics
    console.log('📖 Fetching lyrics from Genius...');
    const lyrics = await song.lyrics();
    
    if (!lyrics || lyrics.trim().length === 0) {
      console.log('❌ No lyrics content found');
      return null;
    }
    
    console.log(`✅ Successfully fetched lyrics (${lyrics.length} characters)`);
    console.log(`📄 Lyrics preview: "${lyrics.substring(0, 100)}..."`);
    
    return lyrics;
  } catch (error) {
    console.error('❌ Error fetching lyrics from Genius:', error);
    console.error('🔍 Error details:', {
      message: error.message,
      stack: error.stack,
      artistName,
      songTitle
    });
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
    
    // Fetch lyrics from Genius
    const artistName = track.body.artists[0].name;
    const songTitle = track.body.name;
    const lyrics = await fetchLyrics(artistName, songTitle);
    
    const songData = {
      id: track.body.id,
      name: track.body.name,
      artists: track.body.artists.map(artist => artist.name),
      album: track.body.album.name,
      uri: track.body.uri,
      lyrics: lyrics || `Lyrics not available for ${songTitle} by ${artistName}`
    };
    
    gameState.currentSong = songData;
    // Reset guessed parts for new song
    gameState.guessedParts = {
      artist: false,
      title: false,
      lyrics: false
    };
    // Reset bonus flag and player tracking for new song
    gameState.bonusAwarded = false;
    gameState.playersWhoGuessed.clear();
    // Clear all guesses for new song
    gameState.currentGuesses = {
      artist: [],
      title: [],
      lyrics: []
    };
    
    // Mark track as played
    updateTrackStatus(track.body.id, 'played');
    
    // Notify all clients about new song
    console.log('Emitting newSong event to all clients:', songData);
    io.emit('newSong', songData);
    
    // Emit empty guesses for new song
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
  const hasGeniusToken = !!process.env.GENIUS_ACCESS_TOKEN;
  const geniusTokenLength = process.env.GENIUS_ACCESS_TOKEN ? process.env.GENIUS_ACCESS_TOKEN.length : 0;
  
  res.json({
    success: true,
    hasGeniusToken,
    geniusTokenLength,
    geniusTokenConfigured: hasGeniusToken && geniusTokenLength > 0,
    message: hasGeniusToken ? 'Genius API token is configured' : 'Genius API token is not configured'
  });
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
    if (lyrics && !gameState.guessedParts.lyrics) {
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
    
    // Check if all parts have been guessed
    if (!gameState.guessedParts.artist || !gameState.guessedParts.title || !gameState.guessedParts.lyrics) {
      allPartsGuessed = false;
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