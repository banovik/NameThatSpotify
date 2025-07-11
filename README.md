# 🎵 Spotify Music Game

A multiplayer music guessing game that uses Spotify's API to create an interactive music trivia experience. Players compete to guess song details while the admin controls playback from any Spotify playlist.

## ✨ Features

### 🎮 Admin Panel
- **Spotify Integration**: Connect your Spotify account and control playback
- **Playlist Management**: Load any public Spotify playlist by URL
- **Real-time Control**: Play, pause, and switch tracks
- **Player Tracking**: Monitor all connected players and their scores
- **Score Management**: Reset scores and start new rounds

### 🎯 Player Experience
- **Real-time Guessing**: Guess artist names, song titles, or lyrics
- **Live Leaderboard**: See scores update in real-time
- **Competitive Gameplay**: First correct guess wins the round
- **Multiple Players**: Support for unlimited concurrent players

### 🔧 Technical Features
- **Real-time Communication**: Socket.IO for instant updates
- **Responsive Design**: Works on desktop and mobile devices
- **Modern UI**: Beautiful gradient design with smooth animations
- **Error Handling**: Robust error handling and user feedback

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Spotify account
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

### 2. Spotify API Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add `http://127.0.0.1:5001/auth/spotify/callback` to your Redirect URIs
4. Copy your Client ID and Client Secret

### 3. Environment Configuration

Create a `.env` file in the root directory:

```bash
cp env.example .env
```

Edit `.env` with your Spotify credentials:

```env
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
SPOTIFY_REDIRECT_URI=http://127.0.0.1:5001/auth/spotify/callback
PORT=5001
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
1. Click "Login as Admin" on the landing page
2. Authorize with your Spotify account
3. Enter a Spotify playlist URL
4. Click "Play" on any track to start the game
5. Monitor player scores and manage the game

### For Players:
1. Enter your player name on the landing page
2. Click "Join Game"
3. Wait for the admin to start playing music
4. Guess the artist, song title, or lyrics
5. Earn points for correct guesses!

## 🏗️ Project Structure

```
SpotifyMusicGame/
├── server.js              # Express server with Socket.IO
├── package.json           # Backend dependencies
├── .env                   # Environment variables
├── client/                # React frontend
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── LandingPage.js
│   │   │   ├── AdminPage.js
│   │   │   └── PlayerPage.js
│   │   ├── App.js
│   │   ├── index.js
│   │   └── index.css
│   └── package.json
└── README.md
```

## 🔧 API Endpoints

### Authentication
- `GET /auth/spotify` - Initiate Spotify OAuth
- `GET /auth/spotify/callback` - Handle OAuth callback

### Game Management
- `POST /api/playlist` - Load Spotify playlist
- `POST /api/play` - Play a specific track
- `POST /api/pause` - Pause playback
- `POST /api/reset-scores` - Reset all player scores

### Socket.IO Events
- `playerJoin` - Player joins the game
- `makeGuess` - Player submits a guess
- `newSong` - New song starts playing
- `correctGuess` - Player guesses correctly
- `playerLeft` - Player disconnects

## 🎨 Customization

### Styling
The app uses CSS custom properties and can be easily customized by modifying `client/src/index.css`.

### Game Rules
Modify the guessing logic in `server.js` to change how guesses are validated.

### Features
Add new features by extending the Socket.IO events and React components.

## 🐛 Troubleshooting

### Common Issues

1. **Spotify Authentication Fails**
   - Ensure your redirect URI matches exactly
   - Check that your Spotify app is properly configured

2. **Playback Not Working**
   - Make sure Spotify is open and playing
   - Verify you have a Spotify Premium account (required for API playback)

3. **Socket Connection Issues**
   - Check that the backend server is running
   - Verify the Socket.IO URL in PlayerPage.js

4. **CORS Errors**
   - Ensure the frontend proxy is configured correctly
   - Check that the backend CORS settings match your frontend URL

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
- Socket.IO for real-time communication
- React for the frontend framework
- Express.js for the backend server

## 📞 Support

If you encounter any issues or have questions, please open an issue on GitHub or contact the development team.

---

**Happy Gaming! 🎵🎮** 