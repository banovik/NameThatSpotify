const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const SpotifyWebApi = require('spotify-web-api-node');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://127.0.0.1:3001",
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

// Game state
let gameState = {
  currentSong: null,
  players: {},
  scores: {},
  isPlaying: false,
  currentPlaylist: null,
  accessToken: null,
  guessedParts: {
    artist: false,
    title: false,
    lyrics: false
  }
};

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
    
    res.redirect('http://127.0.0.1:3001/admin');
  } catch (error) {
    console.error('Error getting tokens:', error);
    res.redirect('http://127.0.0.1:3001/?error=auth_failed');
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
    
    const playlist = await spotifyApi.getPlaylist(playlistId);
    gameState.currentPlaylist = playlist.body;
    
    res.json({ success: true, playlist: playlist.body });
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
    
    // Get lyrics (Note: Spotify doesn't provide lyrics API, we'll use a placeholder)
    const songData = {
      id: track.body.id,
      name: track.body.name,
      artists: track.body.artists.map(artist => artist.name),
      album: track.body.album.name,
      uri: track.body.uri,
      lyrics: `Sample lyrics for ${track.body.name} by ${track.body.artists[0].name}` // Placeholder
    };
    
    gameState.currentSong = songData;
    // Reset guessed parts for new song
    gameState.guessedParts = {
      artist: false,
      title: false,
      lyrics: false
    };
    
    // Notify all clients about new song
    console.log('Emitting newSong event to all clients:', songData);
    io.emit('newSong', songData);
    
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

app.post('/api/reset-scores', (req, res) => {
  gameState.scores = {};
  io.emit('scoresReset');
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
    console.log(`👤 Player joined: ${playerName} (socket: ${socket.id})`);
    gameState.players[socket.id] = playerName;
    gameState.scores[playerName] = gameState.scores[playerName] || 0;
    
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
    
    // Check artist guess
    if (artist && !gameState.guessedParts.artist) {
      if (gameState.currentSong.artists.some(a => 
        a.toLowerCase().includes(artist.toLowerCase()) || 
        artist.toLowerCase().includes(a.toLowerCase())
      )) {
        gameState.guessedParts.artist = true;
        gameState.scores[playerName]++;
        correctParts.push('artist');
        console.log(`🎤 Artist guessed correctly by ${playerName}: ${artist}`);
      }
    }
    
    // Check title guess
    if (title && !gameState.guessedParts.title) {
      if (gameState.currentSong.name.toLowerCase().includes(title.toLowerCase())) {
        gameState.guessedParts.title = true;
        gameState.scores[playerName]++;
        correctParts.push('title');
        console.log(`🎵 Title guessed correctly by ${playerName}: ${title}`);
      }
    }
    
    // Check lyrics guess
    if (lyrics && !gameState.guessedParts.lyrics) {
      if (gameState.currentSong.lyrics.toLowerCase().includes(lyrics.toLowerCase())) {
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
      io.emit('correctGuess', { 
        playerName, 
        players: gameState.players, 
        scores: gameState.scores,
        guessedParts: gameState.guessedParts,
        correctParts,
        allPartsGuessed
      });
      console.log(`✅ ${playerName} earned ${correctParts.length} point(s) for: ${correctParts.join(', ')}`);
    } else {
      socket.emit('incorrectGuess');
    }
  });
  
  // Player disconnects
  socket.on('disconnect', () => {
    const playerName = gameState.players[socket.id];
    if (playerName) {
      delete gameState.players[socket.id];
      io.emit('playerLeft', { playerName, players: gameState.players, scores: gameState.scores });
      console.log(`Player left: ${playerName}`);
      console.log(`📊 Updated players:`, gameState.players);
    }
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 