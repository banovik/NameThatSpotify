# 🎵 Spotify Music Game

A multiplayer music guessing game that uses Spotify's API to create an interactive music trivia experience. Players compete to guess song details while the admin controls playback from any Spotify playlist.

## ✨ Features

### 🎮 Admin Panel
- **Spotify Integration**: Connect your Spotify account and control playback
- **Playlist Management**: Load any public Spotify playlist by URL
- **Real-time Control**: Play, pause, and switch tracks
- **Player Tracking**: Monitor all connected players and their scores
- **Score Management**: Reset scores and start new rounds
- **Manual Point Awarding**: Click on player guesses to award points for close matches
- **Score Editing**: Manually adjust any player's score in the leaderboard
- **Playlist Hiding**: Hide playlist and song information for blind testing
- **Lyrics Management**: 
  - Bulk lyrics scraping for entire playlists
  - Manual lyrics entry for missing songs
  - Lyrics availability indicators for each track
  - Local SQLite caching for performance

### 🎯 Player Experience
- **Real-time Guessing**: Guess artist names, song titles, or lyrics independently
- **Live Leaderboard**: See scores update in real-time
- **Competitive Gameplay**: Each correct guess earns 1 point, up to 3 points per song
- **Bonus Points**: A player earns a bonus point only if they guess all three parts correctly alone
- **Multiple Players**: Support for unlimited concurrent players
- **Progress Tracking**: Visual indicators show which parts of the song have been guessed
- **Rate Limiting**: 1 guess per second per player to prevent spam
- **Profanity Filter**: Username filtering with leetspeak detection

### 🔧 Technical Features
- **Real-time Communication**: Socket.IO for instant updates
- **Responsive Design**: Works on desktop and mobile devices
- **Modern UI**: Beautiful gradient design with smooth animations
- **Error Handling**: Robust error handling and user feedback
- **Lyrics Integration**: lyrics.ovh API with local SQLite caching
- **Persistent State**: Song progress and completion status persist across sessions

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Spotify account with Premium subscription
- Spotify Developer App (for API credentials)

### 1. Clone and Install

```bash
git clone <repository-url>
cd SpotifyMusicGame
npm install
cd client
npm install
cd ..
```

### 2. API Setup

#### Spotify API Setup
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add `http://127.0.0.1:5001/auth/spotify/callback` to your Redirect URIs
4. Copy your Client ID and Client Secret

### 3. Environment Configuration

Create a `.env` file in the root directory:

```bash
cp env.example .env
```

Edit `.env` with your credentials:

```env
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
SPOTIFY_REDIRECT_URI=http://127.0.0.1:5001/auth/spotify/callback
PORT=5001
ADMIN_PASSWORD=your_admin_password_here
```

### 4. Start the Application

```bash
# Start the backend server
npm run dev

# In a new terminal, start the React frontend
npm run client
```

The application will be available at:
- **Frontend**: http://127.0.0.1:3001
- **Backend**: http://127.0.0.1:5001

## 🎮 How to Play

### For Admins:
1. Enter the admin password and click "Login as Admin" on the landing page
2. Authorize with your Spotify account
3. Enter a Spotify playlist URL
4. Optionally scrape lyrics for all songs in the playlist
5. Click "Play" on any track to start the game
6. Monitor player scores and manage the game
7. Use manual point awarding for close guesses
8. Edit player scores as needed
9. Hide playlist information for blind testing

### For Players:
1. Enter your player name on the landing page (profanity filtered)
2. Click "Join Game"
3. Wait for the admin to start playing music
4. Guess the artist, song title, or lyrics independently
5. Earn 1 point for each correct guess (up to 3 points per song)
6. Earn a bonus point only if you guess all three parts correctly alone
7. Watch the progress indicators to see what's been guessed
8. Rate limited to 1 guess per second

## 🏗️ Project Structure

```
SpotifyMusicGame/
├── server.js              # Express server with Socket.IO
├── package.json           # Backend dependencies
├── .env                   # Environment variables
├── lyrics.db              # SQLite database for lyrics caching
├── client/                # React frontend
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── LandingPage.js
│   │   │   ├── AdminPage.js
│   │   │   └── PlayerPage.js
│   │   ├── contexts/
│   │   │   └── AuthContext.js
│   │   ├── App.js
│   │   ├── index.js
│   │   └── index.css
│   └── package.json
├── DEPLOYMENT.md          # Deployment instructions
└── README.md
```

## 🔧 API Endpoints

### Authentication
- `GET /auth/spotify` - Initiate Spotify OAuth
- `GET /auth/spotify/callback` - Handle OAuth callback
- `POST /api/verify-admin` - Verify admin password

### Game Management
- `POST /api/playlist` - Load Spotify playlist
- `POST /api/play` - Play a specific track
- `POST /api/pause` - Pause playback
- `POST /api/resume` - Resume playback
- `POST /api/reset-scores` - Reset all player scores
- `POST /api/reset-playlist` - Reset playlist progress
- `GET /api/track-status` - Get track status information
- `GET /api/devices` - Get available Spotify devices

### Lyrics Management
- `POST /api/scrape-lyrics` - Start bulk lyrics scraping
- `POST /api/stop-scraping` - Stop lyrics scraping
- `POST /api/manual-lyrics` - Save manually entered lyrics
- `POST /api/lyrics-availability` - Check lyrics availability for tracks

### Admin Features
- `POST /api/manual-award` - Manually award points for guesses
- `POST /api/update-score` - Update player scores
- `GET /api/playback-position` - Get current playback position
- `POST /api/seek` - Seek to position in song

### Debug/Testing
- `GET /api/debug/lyrics-test` - Test lyrics API
- `GET /api/debug/lyrics-diagnostics` - Run lyrics diagnostics
- `GET /api/debug/test-lyrics` - Test lyrics fetching

### Socket.IO Events
- `playerJoin` - Player joins the game
- `playerLeft` - Player leaves the game
- `makeGuess` - Player submits a guess
- `newSong` - New song starts playing
- `correctGuess` - Player guesses correctly
- `scoresReset` - Scores are reset
- `playlistReset` - Playlist is reset
- `guessesUpdated` - Guesses are updated
- `scrapingProgress` - Lyrics scraping progress

## 🎨 Customization

### Styling
The app uses CSS custom properties and can be easily customized by modifying `client/src/index.css`.

### Game Rules
Modify the guessing logic in `server.js` to change how guesses are validated.

### Profanity Filter
The username profanity filter can be customized in `server.js` by modifying the filter logic.

### Rate Limiting
Adjust the rate limiting (currently 1 guess per second) in the `makeGuess` socket handler.

## 🐛 Troubleshooting

### Common Issues

1. **Spotify Authentication Fails**
   - Ensure your redirect URI matches exactly
   - Check that your Spotify app is properly configured
   - Verify you have a Spotify Premium account

2. **Playback Not Working**
   - Make sure Spotify is open and playing
   - Verify you have a Spotify Premium account (required for API playback)
   - Check that you have an active Spotify device

3. **Socket Connection Issues**
   - Check that the backend server is running
   - Verify the Socket.IO URL in PlayerPage.js
   - Check firewall settings

4. **CORS Errors**
   - Ensure the frontend proxy is configured correctly
   - Check that the backend CORS settings match your frontend URL

5. **Lyrics Not Loading**
   - Check internet connectivity (lyrics.ovh API requires internet)
   - Verify the lyrics database has proper write permissions
   - Try manual lyrics entry for problematic songs

6. **SQLite Issues**
   - Ensure the server has write permissions in the root directory
   - Check that sqlite3 is properly installed
   - Verify the lyrics.db file is created and accessible

## 🔒 Security Features

- **Profanity Filter**: Blocks inappropriate usernames including leetspeak
- **Rate Limiting**: Prevents guess spam (1 per second per player)
- **Admin Authentication**: Secure admin login system
- **Input Validation**: All user inputs are validated and sanitized

## 📊 Performance Features

- **Lyrics Caching**: SQLite database for fast lyrics retrieval
- **Bulk Scraping**: Pre-fetch lyrics for entire playlists
- **Persistent State**: Song progress persists across sessions
- **Real-time Updates**: Efficient Socket.IO communication

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Spotify Web API for music integration
- lyrics.ovh for lyrics data
- Socket.IO for real-time communication
- React for the frontend framework
- Express.js for the backend server
- SQLite for local caching

## 📞 Support

If you encounter any issues or have questions, please open an issue on GitHub or contact the development team.

---

**Happy Gaming! 🎵🎮** 