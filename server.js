const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const SpotifyWebApi = require('spotify-web-api-node');
const axios = require('axios');
require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

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

// IP tracking middleware
app.use((req, res, next) => {
  req.ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
  next();
});

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
  scrapingState: {
    isScraping: false,
    currentIndex: 0,
    successfulCount: 0,
    totalCount: 0,
    failedIndices: [],
    playlistTracks: []
  },
  // Game code system
  gameCode: null,
  gameCodeExpiry: null,
  adminConnected: false,
  // Brute force protection
  bruteForceProtection: {
    adminPassword: {
      failedAttempts: 0,
      lastFailedAttempt: 0,
      blockedUntil: 0
    },
    gameCode: {
      failedAttempts: 0,
      lastFailedAttempt: 0,
      blockedUntil: 0
    }
  },
  // IP tracking and blocking
  blockedIps: new Map(), // ip -> { blockedUntil: timestamp, reason: string }
  socketToIp: new Map() // socketId -> ip
};

// Game code management functions
function generateGameCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function resetGameCode() {
  gameState.gameCode = null;
  gameState.gameCodeExpiry = null;
  gameState.adminConnected = false;
  // Clear all players and scores
  gameState.players = {};
  gameState.scores = {};
  gameState.activeUsernames.clear();
  gameState.currentSong = null;
  gameState.isPlaying = false;
  gameState.currentPlaylist = null;
  gameState.guessedParts = { artist: false, title: false, lyrics: false };
  gameState.trackStatus = {};
  gameState.songStates = {};
  gameState.bonusAwarded = false;
  gameState.playersWhoGuessed.clear();
  gameState.currentGuesses = { artist: [], title: [], lyrics: [] };
  gameState.lastGuessTimestamps = {};
  gameState.scrapingState = {
    isScraping: false,
    currentIndex: 0,
    successfulCount: 0,
    totalCount: 0,
    failedIndices: [],
    playlistTracks: []
  };
  // Reset brute force protection
  gameState.bruteForceProtection = {
    adminPassword: {
      failedAttempts: 0,
      lastFailedAttempt: 0,
      blockedUntil: 0
    },
    gameCode: {
      failedAttempts: 0,
      lastFailedAttempt: 0,
      blockedUntil: 0
    }
  };
  // Clear IP tracking (but keep blocked IPs for security)
  gameState.socketToIp.clear();
  
  // Notify all clients that game has ended
  io.emit('gameEnded', { message: 'Game session has expired. Please wait for an admin to start a new game.' });
  console.log('Game code expired - all players kicked out');
}

function extendGameCode() {
  if (gameState.gameCode) {
    gameState.gameCodeExpiry = Date.now() + (30 * 60 * 1000); // 30 minutes
    console.log('Game code timer extended for 30 minutes');
  }
}

function checkGameCodeExpiry() {
  if (gameState.gameCode && gameState.gameCodeExpiry && Date.now() > gameState.gameCodeExpiry) {
    resetGameCode();
  }
}

// Brute force protection functions
function checkBruteForceProtection(type) {
  const protection = gameState.bruteForceProtection[type];
  const now = Date.now();
  
  // Check if currently blocked
  if (now < protection.blockedUntil) {
    const remainingTime = Math.ceil((protection.blockedUntil - now) / 1000);
    return {
      blocked: true,
      remainingTime: remainingTime,
      message: `Too many failed attempts. Please wait ${remainingTime} seconds before trying again.`
    };
  }
  
  // Reset failed attempts if more than 1 minute has passed since last attempt
  if (now - protection.lastFailedAttempt > 60000) {
    protection.failedAttempts = 0;
  }
  
  return { blocked: false };
}

function recordFailedAttempt(type) {
  const protection = gameState.bruteForceProtection[type];
  const now = Date.now();
  
  protection.failedAttempts++;
  protection.lastFailedAttempt = now;
  
  // Block for 1 minute after 5 failed attempts
  if (protection.failedAttempts >= 5) {
    protection.blockedUntil = now + 60000; // 1 minute
    console.log(`🚫 Brute force protection activated for ${type} - blocked until ${new Date(protection.blockedUntil).toLocaleTimeString()}`);
  }
  
  console.log(`❌ Failed ${type} attempt #${protection.failedAttempts}`);
}

function resetFailedAttempts(type) {
  const protection = gameState.bruteForceProtection[type];
  protection.failedAttempts = 0;
  protection.lastFailedAttempt = 0;
  protection.blockedUntil = 0;
  console.log(`✅ Reset brute force protection for ${type}`);
}

// IP blocking functions
function blockIp(ip, reason = 'Admin kick', durationMinutes = 10) {
  const blockedUntil = Date.now() + (durationMinutes * 60 * 1000);
  gameState.blockedIps.set(ip, {
    blockedUntil: blockedUntil,
    reason: reason
  });
  console.log(`🚫 Blocked IP ${ip} until ${new Date(blockedUntil).toLocaleTimeString()} - Reason: ${reason}`);
}

function isIpBlocked(ip) {
  const blockInfo = gameState.blockedIps.get(ip);
  if (!blockInfo) return false;
  
  if (Date.now() > blockInfo.blockedUntil) {
    // Block has expired, remove it
    gameState.blockedIps.delete(ip);
    console.log(`✅ IP ${ip} block has expired and been removed`);
    return false;
  }
  
  return true;
}

function getBlockedIpInfo(ip) {
  const blockInfo = gameState.blockedIps.get(ip);
  if (!blockInfo) return null;
  
  if (Date.now() > blockInfo.blockedUntil) {
    gameState.blockedIps.delete(ip);
    return null;
  }
  
  return {
    remainingTime: Math.ceil((blockInfo.blockedUntil - Date.now()) / 1000),
    reason: blockInfo.reason
  };
}

function kickPlayer(socketId, reason = 'Admin kick') {
  const playerName = gameState.players[socketId];
  const ip = gameState.socketToIp.get(socketId);
  
  if (playerName) {
    // Remove player from game
    delete gameState.players[socketId];
    gameState.socketToIp.delete(socketId);
    
    // Check if this username is still used by other active players
    const usernameStillActive = Object.values(gameState.players).includes(playerName);
    if (!usernameStillActive) {
      gameState.activeUsernames.delete(playerName);
    }
    
    // Block the IP for 10 minutes
    if (ip) {
      blockIp(ip, reason, 10);
    }
    
    // Notify all clients
    io.emit('playerKicked', { 
      playerName, 
      players: gameState.players, 
      scores: gameState.scores,
      reason: reason
    });
    
    // Disconnect the socket
    io.sockets.sockets.get(socketId)?.disconnect();
    
    console.log(`👢 Kicked player "${playerName}" (IP: ${ip}) - Reason: ${reason}`);
    return { success: true, playerName, ip };
  }
  
  return { success: false, error: 'Player not found' };
}

function cleanupExpiredBlocks() {
  const now = Date.now();
  for (const [ip, blockInfo] of gameState.blockedIps.entries()) {
    if (now > blockInfo.blockedUntil) {
      gameState.blockedIps.delete(ip);
      console.log(`🧹 Cleaned up expired block for IP ${ip}`);
    }
  }
}

// Check game code expiry every minute
setInterval(checkGameCodeExpiry, 60000);

// Clean up expired IP blocks every 5 minutes
setInterval(cleanupExpiredBlocks, 300000);

// Set up SQLite database for lyrics caching
const dbPath = path.join(__dirname, 'lyrics.db');
const lyricsDb = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to lyrics.db:', err);
  } else {
    console.log('Connected to lyrics.db');
  }
});
lyricsDb.run(`CREATE TABLE IF NOT EXISTS lyrics_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  lyrics TEXT NOT NULL,
  UNIQUE(artist, title)
)`);

// Function to fetch lyrics from local DB or API
async function fetchLyrics(artistName, songTitle) {
  const normalizedArtist = normalizeArtist(artistName);
  const normalizedTitle = normalizeTitle(songTitle);

  // Try to get lyrics from local DB first
  const getLyricsFromDb = () => new Promise((resolve, reject) => {
    lyricsDb.get(
      'SELECT lyrics FROM lyrics_cache WHERE artist = ? AND title = ?',
      [normalizedArtist, normalizedTitle],
      (err, row) => {
        if (err) return reject(err);
        if (row && row.lyrics) {
          console.log('🎵 Loaded lyrics from local DB');
          resolve(row.lyrics);
        } else {
          resolve(null);
        }
      }
    );
  });

  let lyrics = await getLyricsFromDb();
  if (lyrics) return lyrics;

  // If not in DB, fetch from API
  try {
    console.log('🎵 Starting lyrics fetch process...');
    console.log(`📝 Searching for: "${songTitle}" by "${artistName}"`);
    const cleanArtist = encodeURIComponent(artistName.trim());
    const cleanSong = encodeURIComponent(songTitle.trim());
    console.log(`🔍 Fetching from lyrics.ovh: ${cleanArtist}/${cleanSong}`);
    const response = await axios.get(`${LYRICS_OVH_BASE_URL}/${cleanArtist}/${cleanSong}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    if (response.data && response.data.lyrics) {
      lyrics = response.data.lyrics.trim();
      if (lyrics.length > 0) {
        console.log(`✅ Successfully fetched lyrics (${lyrics.length} characters)`);
        // Store in DB for future use
        lyricsDb.run(
          'INSERT OR IGNORE INTO lyrics_cache (artist, title, lyrics) VALUES (?, ?, ?)',
          [normalizedArtist, normalizedTitle, lyrics],
          (err) => {
            if (err) {
              console.error('Failed to cache lyrics in DB:', err);
            } else {
              console.log('🗄️ Cached lyrics in local DB');
            }
          }
        );
        return lyrics;
      }
    }
    console.log('❌ No lyrics found in response');
    return null;
  } catch (error) {
    console.error('❌ Error fetching lyrics from lyrics.ovh:', error);
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
    .replace(/\s+-\s+.*$/g, '') // Remove anything after and including " - " (space-dash-space)
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim();
}

// Function to normalize artist names for comparison
function normalizeArtist(artist) {
  if (!artist) return '';
  
  return artist
    .toLowerCase()
    .replace(/\([^)]*\)/g, '') // Remove anything in parentheses
    .replace(/\s+-\s+.*$/g, '') // Remove anything after and including " - " (space-dash-space)
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
  
  // Check brute force protection
  const protection = checkBruteForceProtection('adminPassword');
  if (protection.blocked) {
    return res.status(429).json({ error: protection.message });
  }
  
  if (!adminPassword) {
    return res.status(500).json({ error: 'Admin password not configured' });
  }
  
  if (password === adminPassword) {
    // Reset failed attempts on successful login
    resetFailedAttempts('adminPassword');
    
    // Generate new game code when admin logs in
    gameState.gameCode = generateGameCode();
    gameState.gameCodeExpiry = Date.now() + (30 * 60 * 1000); // 30 minutes
    gameState.adminConnected = true;
    console.log(`Admin logged in - Game code generated: ${gameState.gameCode}`);
    res.json({ success: true, gameCode: gameState.gameCode });
  } else {
    // Record failed attempt
    recordFailedAttempt('adminPassword');
    res.status(401).json({ error: 'Invalid admin password' });
  }
});

// Game code verification for players
app.post('/api/verify-game-code', (req, res) => {
  const { gameCode } = req.body;
  
  // Check if IP is blocked
  if (isIpBlocked(req.ip)) {
    const blockInfo = getBlockedIpInfo(req.ip);
    return res.status(403).json({ 
      error: `Access denied. You are blocked for ${blockInfo.remainingTime} more seconds. Reason: ${blockInfo.reason}` 
    });
  }
  
  // Check brute force protection
  const protection = checkBruteForceProtection('gameCode');
  if (protection.blocked) {
    return res.status(429).json({ error: protection.message });
  }
  
  if (!gameState.gameCode) {
    return res.status(400).json({ error: 'No active game session' });
  }
  
  if (gameState.gameCode !== gameCode) {
    // Record failed attempt
    recordFailedAttempt('gameCode');
    return res.status(401).json({ error: 'Invalid game code' });
  }
  
  // Check if game code has expired
  if (gameState.gameCodeExpiry && Date.now() > gameState.gameCodeExpiry) {
    resetGameCode();
    return res.status(400).json({ error: 'Game session has expired' });
  }
  
  // Reset failed attempts on successful verification
  resetFailedAttempts('gameCode');
  res.json({ success: true });
});

// Kick player endpoint
app.post('/api/kick-player', (req, res) => {
  const { socketId, reason } = req.body;
  
  if (!gameState.adminConnected) {
    return res.status(401).json({ error: 'Admin not authenticated' });
  }
  
  if (!socketId) {
    return res.status(400).json({ error: 'Socket ID is required' });
  }
  
  const result = kickPlayer(socketId, reason || 'Admin kick');
  
  if (result.success) {
    res.json({ 
      success: true, 
      message: `Player "${result.playerName}" has been kicked and their IP blocked for 10 minutes`,
      playerName: result.playerName,
      ip: result.ip
    });
  } else {
    res.status(404).json({ error: result.error });
  }
});

// Get blocked IPs endpoint (for admin monitoring)
app.get('/api/blocked-ips', (req, res) => {
  if (!gameState.adminConnected) {
    return res.status(401).json({ error: 'Admin not authenticated' });
  }
  
  const blockedIps = [];
  for (const [ip, blockInfo] of gameState.blockedIps.entries()) {
    if (Date.now() <= blockInfo.blockedUntil) {
      blockedIps.push({
        ip: ip,
        blockedUntil: blockInfo.blockedUntil,
        remainingTime: Math.ceil((blockInfo.blockedUntil - Date.now()) / 1000),
        reason: blockInfo.reason
      });
    }
  }
  
  res.json({ blockedIps });
});

// Get current game code status (for admin page)
app.get('/api/game-code-status', (req, res) => {
  if (!gameState.gameCode) {
    return res.json({ 
      hasGameCode: false, 
      gameCode: null, 
      timeRemaining: 0,
      adminConnected: false 
    });
  }
  
  const timeRemaining = Math.max(0, gameState.gameCodeExpiry - Date.now());
  
  res.json({ 
    hasGameCode: true, 
    gameCode: gameState.gameCode, 
    timeRemaining: timeRemaining,
    adminConnected: gameState.adminConnected 
  });
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
    
    // Extend game code timer when a new song is played
    extendGameCode();
    
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

app.post('/api/update-score', (req, res) => {
  const { playerName, newScore } = req.body;
  if (!playerName || newScore === undefined || newScore === null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (typeof newScore !== 'number' || newScore < 0) {
    return res.status(400).json({ error: 'Invalid score value' });
  }
  // Update the player's score
  gameState.scores[playerName] = newScore;
  console.log(`Score updated for ${playerName}: ${newScore}`);
  // Notify all clients of the score update
  io.emit('scoresUpdated', { scores: gameState.scores });
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

// API endpoint to scrape lyrics for all songs in a playlist
app.post('/api/scrape-lyrics', async (req, res) => {
  if (!gameState.currentPlaylist) {
    return res.status(400).json({ error: 'No playlist loaded' });
  }

  if (gameState.scrapingState.isScraping) {
    return res.status(400).json({ error: 'Lyrics scraping already in progress' });
  }

  const tracks = gameState.currentPlaylist.tracks.items;
  gameState.scrapingState = {
    isScraping: true,
    currentIndex: 0,
    successfulCount: 0,
    totalCount: tracks.length,
    failedIndices: [],
    playlistTracks: tracks
  };

  console.log(`🎵 Starting lyrics scraping for ${tracks.length} songs`);

  // Start the scraping process
  scrapeLyricsForPlaylist();

  res.json({ 
    success: true, 
    message: `Started scraping lyrics for ${tracks.length} songs`,
    totalCount: tracks.length
  });
});

// API endpoint to stop lyrics scraping
app.post('/api/stop-scraping', (req, res) => {
  if (!gameState.scrapingState.isScraping) {
    return res.status(400).json({ error: 'No scraping in progress' });
  }

  gameState.scrapingState.isScraping = false;
  console.log('Lyrics scraping stopped by user');
  
  res.json({ success: true, message: 'Lyrics scraping stopped' });
});

// API endpoint to get scraping progress
app.get('/api/scraping-progress', (req, res) => {
  const state = gameState.scrapingState;
  res.json({
    isScraping: state.isScraping,
    currentIndex: state.currentIndex,
    successfulCount: state.successfulCount,
    totalCount: state.totalCount,
    progress: state.totalCount > 0 ? (state.successfulCount / state.totalCount) * 100 : 0
  });
});

// Function to scrape lyrics for all songs in the playlist
async function scrapeLyricsForPlaylist() {
  const state = gameState.scrapingState;
  // Build a list of tracks missing lyrics in the DB
  const allTracks = state.playlistTracks;
  const missingTracks = await new Promise((resolve) => {
    let results = [];
    let checked = 0;
    allTracks.forEach((trackItem, idx) => {
      if (!trackItem || !trackItem.track) {
        checked++;
        if (checked === allTracks.length) resolve(results);
        return;
      }
      const artist = trackItem.track.artists[0].name;
      const title = trackItem.track.name;
      const normalizedArtist = normalizeArtist(artist);
      const normalizedTitle = normalizeTitle(title);
      lyricsDb.get(
        'SELECT lyrics FROM lyrics_cache WHERE artist = ? AND title = ?',
        [normalizedArtist, normalizedTitle],
        (err, row) => {
          if (!row || !row.lyrics) {
            results.push({ track: trackItem.track, idx });
          }
          checked++;
          if (checked === allTracks.length) resolve(results);
        }
      );
    });
  });
  // Only process missing tracks
  state.missingTracks = missingTracks;
  state.isScraping = true;
  state.currentIndex = 0;
  state.successfulCount = 0;
  state.totalCount = missingTracks.length;
  state.failedIndices = [];

  while (state.isScraping && state.successfulCount < state.totalCount) {
    if (state.currentIndex < state.missingTracks.length) {
      const { track, idx } = state.missingTracks[state.currentIndex];
      if (track) {
        console.log(`Scraping lyrics for: ${track.name} by ${track.artists.map(a => a.name).join(', ')}`);
        try {
          const lyrics = await fetchLyrics(track.artists[0].name, track.name);
          if (lyrics) {
            state.successfulCount++;
            console.log(`Successfully scraped lyrics for: ${track.name}`);
          } else {
            if (!state.failedIndices.includes(state.currentIndex)) {
              state.failedIndices.push(state.currentIndex);
            }
            console.log(`Failed to scrape lyrics for: ${track.name}`);
          }
        } catch (error) {
          console.error(`Error scraping lyrics for ${track.name}:`, error);
          if (!state.failedIndices.includes(state.currentIndex)) {
            state.failedIndices.push(state.currentIndex);
          }
        }
      }
      state.currentIndex++;
    } else {
      if (state.failedIndices.length > 0) {
        const retryIndex = state.failedIndices.shift();
        state.currentIndex = retryIndex;
        console.log(`Retrying failed song at index ${retryIndex}`);
      } else {
        break;
      }
    }
    io.emit('scrapingProgress', {
      isScraping: state.isScraping,
      currentIndex: state.currentIndex,
      successfulCount: state.successfulCount,
      totalCount: state.totalCount,
      progress: (state.totalCount > 0 ? (state.successfulCount / state.totalCount) * 100 : 100)
    });
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  state.isScraping = false;
  console.log(`🎵 Lyrics scraping completed. ${state.successfulCount}/${state.totalCount} songs scraped successfully`);
  io.emit('scrapingProgress', {
    isScraping: false,
    currentIndex: state.currentIndex,
    successfulCount: state.successfulCount,
    totalCount: state.totalCount,
    progress: (state.totalCount > 0 ? (state.successfulCount / state.totalCount) * 100 : 100)
  });
}

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
    console.log('Simple lyrics.ovh API test...');
    
    // Test with a well-known song
    const testArtist = 'Queen';
    const testSong = 'Bohemian Rhapsody';
    
    console.log(`Testing with: "${testSong}" by "${testArtist}"`);
    
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
    console.error('Lyrics.ovh API test failed:', error);
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
    console.log('Running lyrics.ovh API diagnostics...');
    
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
        console.log(`Testing: "${test.song}" by "${test.artist}"`);
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
    console.error('Lyrics.ovh diagnostics failed:', error);
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
    console.log('Testing lyrics fetching...');
    
    // Test with a well-known song
    const testArtist = 'Queen';
    const testSong = 'Bohemian Rhapsody';
    
    console.log(`Testing with: "${testSong}" by "${testArtist}"`);
    
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
    console.error('Test lyrics error:', error);
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

// API endpoint to check lyrics availability for a list of songs
app.post('/api/lyrics-availability', async (req, res) => {
  const { songs } = req.body; // [{ id, artist, title }]
  if (!Array.isArray(songs)) {
    return res.status(400).json({ error: 'Missing or invalid songs array' });
  }
  const results = {};
  let checked = 0;
  songs.forEach(song => {
    if (!song || !song.artist || !song.title || !song.id) {
      results[song.id] = false;
      checked++;
      if (checked === songs.length) {
        return res.json({ availability: results });
      }
      return;
    }
    const normalizedArtist = normalizeArtist(song.artist);
    const normalizedTitle = normalizeTitle(song.title);
    lyricsDb.get(
      'SELECT lyrics FROM lyrics_cache WHERE artist = ? AND title = ?',
      [normalizedArtist, normalizedTitle],
      (err, row) => {
        results[song.id] = !!(row && row.lyrics);
        checked++;
        if (checked === songs.length) {
          return res.json({ availability: results });
        }
      }
    );
  });
});

app.post('/api/manual-lyrics', async (req, res) => {
  const { id, artist, title, lyrics } = req.body;
  if (!id || !artist || !title || !lyrics) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const normalizedArtist = normalizeArtist(artist);
  const normalizedTitle = normalizeTitle(title);
  lyricsDb.run(
    'INSERT OR REPLACE INTO lyrics_cache (artist, title, lyrics) VALUES (?, ?, ?)',
    [normalizedArtist, normalizedTitle, lyrics],
    function (err) {
      if (err) {
        console.error('Failed to save manual lyrics:', err);
        return res.status(500).json({ error: 'Failed to save lyrics' });
      }
      return res.json({ success: true });
    }
  );
});

app.post('/api/manual-award', (req, res) => {
  const { playerName, guessType, guessText } = req.body;
  if (!playerName || !guessType || !guessText) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!gameState.currentSong) {
    return res.status(400).json({ error: 'No current song' });
  }
  if (gameState.guessedParts[guessType] === true) {
    return res.status(400).json({ error: 'This category has already been guessed' });
  }
  // Award point to player
  gameState.scores[playerName] = (gameState.scores[playerName] || 0) + 1;
  // Mark category as guessed
  gameState.guessedParts[guessType] = true;
  // Track that this player made a correct guess
  gameState.playersWhoGuessed.add(playerName);
  // Check if all parts are now guessed
  const allPartsGuessed = gameState.guessedParts.artist && gameState.guessedParts.title && (gameState.guessedParts.lyrics === true || gameState.guessedParts.lyrics === null);
  // Award bonus if this player just completed all parts alone
  let bonusAwarded = false;
  if (allPartsGuessed && !gameState.bonusAwarded && gameState.playersWhoGuessed.size === 1) {
    gameState.scores[playerName]++;
    gameState.bonusAwarded = true;
    bonusAwarded = true;
  }
  // Update track status
  if (gameState.currentSong && gameState.currentSong.id) {
    if (allPartsGuessed) {
      updateTrackStatus(gameState.currentSong.id, 'complete');
    } else {
      updateTrackStatus(gameState.currentSong.id, 'partial');
    }
  }
  // Save song state
  if (gameState.currentSong) {
    gameState.songStates[gameState.currentSong.id] = {
      isComplete: allPartsGuessed,
      guessedParts: { ...gameState.guessedParts },
      bonusAwarded: gameState.bonusAwarded,
      playersWhoGuessed: Array.from(gameState.playersWhoGuessed),
      currentGuesses: { ...gameState.currentGuesses }
    };
  }
  // Notify all clients
  io.emit('correctGuess', { 
    playerName, 
    players: gameState.players, 
    scores: gameState.scores,
    guessedParts: gameState.guessedParts,
    correctParts: [guessType],
    allPartsGuessed,
    bonusAwarded
  });
  console.log(`Manual award: ${playerName} earned 1 point for ${guessType} guess: "${guessText}"${bonusAwarded ? ' + 1 bonus point' : ''}`);
  res.json({ success: true });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected with socket ID:', socket.id);
  
  // Track IP address for this socket
  const clientIp = socket.handshake.headers['x-forwarded-for'] || 
                   socket.handshake.address || 
                   socket.conn.remoteAddress;
  gameState.socketToIp.set(socket.id, clientIp);
  console.log(`Socket ${socket.id} connected from IP: ${clientIp}`);
  
  // Check if IP is blocked
  if (isIpBlocked(clientIp)) {
    const blockInfo = getBlockedIpInfo(clientIp);
    socket.emit('accessDenied', { 
      error: `Access denied. You are blocked for ${blockInfo.remainingTime} more seconds. Reason: ${blockInfo.reason}` 
    });
    socket.disconnect();
    return;
  }
  
  // Send current game state to new player
  socket.emit('gameState', {
    currentSong: gameState.currentSong,
    players: gameState.players,
    scores: gameState.scores,
    isPlaying: gameState.isPlaying,
    guessedParts: gameState.guessedParts
  });
  
  // Game code verification for players
  socket.on('verifyGameCode', (gameCode) => {
    if (!gameState.gameCode) {
      socket.emit('gameCodeInvalid', { error: 'No active game session' });
      return;
    }
    
    if (gameState.gameCode !== gameCode) {
      socket.emit('gameCodeInvalid', { error: 'Invalid game code' });
      return;
    }
    
    // Check if game code has expired
    if (gameState.gameCodeExpiry && Date.now() > gameState.gameCodeExpiry) {
      resetGameCode();
      socket.emit('gameCodeInvalid', { error: 'Game session has expired' });
      return;
    }
    
    socket.emit('gameCodeValid');
  });
  
  // Player joins
  socket.on('playerJoin', (data) => {
    const { playerName, gameCode } = data;
    console.log(`Player attempting to join: ${playerName} (socket: ${socket.id})`);
    
    // Verify game code first
    if (!gameState.gameCode) {
      socket.emit('gameCodeInvalid', { error: 'No active game session' });
      return;
    }
    
    if (gameState.gameCode !== gameCode) {
      socket.emit('gameCodeInvalid', { error: 'Invalid game code' });
      return;
    }
    
    // Check if game code has expired
    if (gameState.gameCodeExpiry && Date.now() > gameState.gameCodeExpiry) {
      resetGameCode();
      socket.emit('gameCodeInvalid', { error: 'Game session has expired' });
      return;
    }
    
    // Check if username is already taken by another active player
    const existingSocketId = Object.keys(gameState.players).find(socketId => 
      gameState.players[socketId] === playerName
    );
    
    if (existingSocketId) {
      if (existingSocketId !== socket.id) {
        // Username is taken by another active player (different socket)
        // Check if this might be a reconnection by looking at the score
        // If the player has a score, they might be reconnecting
        if (gameState.scores[playerName] !== undefined) {
          // This could be a reconnection - allow it but remove the old connection
          console.log(`Player "${playerName}" reconnecting - removing old connection (socket: ${existingSocketId})`);
          delete gameState.players[existingSocketId];
          // Clean up last guess timestamp for the old connection
          delete gameState.lastGuessTimestamps[playerName];
        } else {
          // This is a new player trying to use a taken name
          socket.emit('usernameTaken', { error: 'Sorry, that player name is taken. Please select another name.' });
          console.log(`Username "${playerName}" rejected - already taken by another player (socket: ${existingSocketId})`);
          return;
        }
      } else {
        // This is a reconnection (same socket ID)
        console.log(`Player "${playerName}" reconnecting (same socket: ${socket.id})`);
      }
    } else {
      // New player joining
      console.log(`New player "${playerName}" joining`);
    }
    
    // Username is available or this is a reconnection
    gameState.players[socket.id] = playerName;
    gameState.activeUsernames.add(playerName);
    
    // Initialize score if this is a new player, otherwise keep existing score
    if (!gameState.scores[playerName]) {
      gameState.scores[playerName] = 0;
      console.log(`New player "${playerName}" joined with 0 points`);
    } else {
      console.log(`Player "${playerName}" reconnected with ${gameState.scores[playerName]} points`);
    }
    
    io.emit('playerJoined', { playerName, players: gameState.players, scores: gameState.scores });
    console.log(`Updated players:`, gameState.players);
    console.log(`Updated scores:`, gameState.scores);
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
        
        // Split into words for better comparison
        const actualWords = normalizedArtist.split(/\s+/).filter(word => word.length > 0);
        const guessWords = normalizedGuess.split(/\s+/).filter(word => word.length > 0);
        
        // Check if the guess is a good match
        let isCorrect = false;
        
        if (actualWords.length > 0 && guessWords.length > 0) {
          // Calculate how many words from the guess match words in the actual artist
          const matchingWords = guessWords.filter(guessWord => 
            actualWords.some(actualWord => actualWord === guessWord)
          );
          
          // Calculate match percentage
          const matchPercentage = matchingWords.length / Math.max(actualWords.length, guessWords.length);
          
          // Require at least 80% match and at least 2 matching words (or all words if artist is short)
          const minWordsRequired = Math.min(2, actualWords.length);
          isCorrect = matchPercentage >= 0.8 && matchingWords.length >= minWordsRequired;
          
          // Also allow exact matches (case-insensitive, ignoring spaces and special chars)
          if (!isCorrect) {
            const exactMatch = normalizedArtist === normalizedGuess;
            isCorrect = exactMatch;
          }
          
          // Allow partial matches only if the guess contains ALL of the artist words
          if (!isCorrect && guessWords.length >= actualWords.length * 0.7) {
            const allActualWordsFound = actualWords.every(actualWord =>
              guessWords.some(guessWord => guessWord === actualWord)
            );
            isCorrect = allActualWordsFound;
          }
          
          // Handle cases where user types without spaces (e.g., "boxcarracer")
          if (!isCorrect && guessWords.length === 1 && actualWords.length > 1) {
            const concatenatedActual = actualWords.join('');
            const concatenatedGuess = guessWords.join('');
            isCorrect = concatenatedActual === concatenatedGuess;
          }
          
          // For partial matches, require that the guess contains at least 90% of the artist words
          // and that the missing words are not significant (e.g., "the", "a", "an")
          if (!isCorrect && guessWords.length < actualWords.length) {
            const significantWords = actualWords.filter(word => word.length > 2); // Filter out short words like "the", "a", etc.
            const matchingSignificantWords = significantWords.filter(actualWord =>
              guessWords.some(guessWord => guessWord === actualWord)
            );
            
            if (significantWords.length > 0) {
              const significantMatchPercentage = matchingSignificantWords.length / significantWords.length;
              isCorrect = significantMatchPercentage >= 0.9;
            }
          }
          
          // Handle cases where guess has fewer words but contains all significant words
          // This handles cases like "boxcar racer" for "Box Car Racer"
          if (!isCorrect && guessWords.length < actualWords.length) {
            const allSignificantWordsFound = actualWords.every(actualWord =>
              guessWords.some(guessWord => guessWord === actualWord)
            );
            isCorrect = allSignificantWordsFound;
          }
        }
        
        return isCorrect;
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
      
      // Split into words for better comparison
      const actualWords = normalizedActualTitle.split(/\s+/).filter(word => word.length > 0);
      const guessWords = normalizedGuess.split(/\s+/).filter(word => word.length > 0);
      
      // Check if the guess is a good match
      let isCorrect = false;
      
      if (actualWords.length > 0 && guessWords.length > 0) {
        // Calculate how many words from the guess match words in the actual title
        const matchingWords = guessWords.filter(guessWord => 
          actualWords.some(actualWord => actualWord === guessWord)
        );
        
        // Calculate match percentage
        const matchPercentage = matchingWords.length / Math.max(actualWords.length, guessWords.length);
        
        // Require at least 80% match and at least 2 matching words (or all words if title is short)
        const minWordsRequired = Math.min(2, actualWords.length);
        isCorrect = matchPercentage >= 0.8 && matchingWords.length >= minWordsRequired;
        
        // Also allow exact matches (case-insensitive, ignoring spaces and special chars)
        if (!isCorrect) {
          const exactMatch = normalizedActualTitle === normalizedGuess;
          isCorrect = exactMatch;
        }
        
        // Allow partial matches only if the guess contains ALL of the title words
        if (!isCorrect && guessWords.length >= actualWords.length * 0.7) {
          const allActualWordsFound = actualWords.every(actualWord =>
            guessWords.some(guessWord => guessWord === actualWord)
          );
          isCorrect = allActualWordsFound;
        }
        
        // Handle cases where user types without spaces (e.g., "cantstopme")
        if (!isCorrect && guessWords.length === 1 && actualWords.length > 1) {
          const concatenatedActual = actualWords.join('');
          const concatenatedGuess = guessWords.join('');
          isCorrect = concatenatedActual === concatenatedGuess;
        }
        
        // For partial matches, require that the guess contains at least 90% of the title words
        // and that the missing words are not significant (e.g., "the", "a", "an")
        if (!isCorrect && guessWords.length < actualWords.length) {
          const significantWords = actualWords.filter(word => word.length > 2); // Filter out short words like "the", "a", etc.
          const matchingSignificantWords = significantWords.filter(actualWord =>
            guessWords.some(guessWord => guessWord === actualWord)
          );
          
          if (significantWords.length > 0) {
            const significantMatchPercentage = matchingSignificantWords.length / significantWords.length;
            isCorrect = significantMatchPercentage >= 0.9;
          }
        }
        
        // Handle cases where guess has fewer words but contains all significant words
        // This handles cases like "cant stop me" for "Can't Stop Me"
        if (!isCorrect && guessWords.length < actualWords.length) {
          const allSignificantWordsFound = actualWords.every(actualWord =>
            guessWords.some(guessWord => guessWord === actualWord)
          );
          isCorrect = allSignificantWordsFound;
        }
      }
      
      if (isCorrect) {
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
    
    // Clean up IP tracking
    gameState.socketToIp.delete(socket.id);
    console.log(`Socket ${socket.id} disconnected`);
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 