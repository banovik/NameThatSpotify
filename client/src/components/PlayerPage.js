import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';

const PlayerPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [currentSong, setCurrentSong] = useState(null);
  const [players, setPlayers] = useState({});
  const [scores, setScores] = useState({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [guess, setGuess] = useState({ artist: '', title: '', lyrics: '' });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const [canGuess, setCanGuess] = useState(true);
  const [guessedParts, setGuessedParts] = useState({ artist: false, title: false, lyrics: false });

  useEffect(() => {
    // Get player name from navigation state
    if (location.state?.playerName) {
      setPlayerName(location.state.playerName);
    } else {
      navigate('/');
      return;
    }

    // Initialize Socket.IO connection
    console.log('Attempting to connect to Socket.IO server at http://127.0.0.1:5001');
    const newSocket = io('http://127.0.0.1:5001', {
      transports: ['websocket', 'polling'],
      timeout: 20000
    });
    setSocket(newSocket);

    // Socket event listeners
    newSocket.on('connect', () => {
      console.log('✅ Connected to server with socket ID:', newSocket.id);
      newSocket.emit('playerJoin', location.state.playerName);
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('🔌 Disconnected from server:', reason);
    });

    newSocket.on('gameState', (gameState) => {
      console.log('Received game state:', gameState);
      setCurrentSong(gameState.currentSong);
      setPlayers(gameState.players || {});
      setScores(gameState.scores || {});
      setIsPlaying(gameState.isPlaying);
      setGuessedParts(gameState.guessedParts || { artist: false, title: false, lyrics: false });
    });

    newSocket.on('newSong', (song) => {
      console.log('Received new song:', song);
      setCurrentSong(song);
      setIsPlaying(true);
      setCanGuess(true);
      setGuessedParts({ artist: false, title: false, lyrics: false });
      setMessage('New song started! Start guessing!');
      setMessageType('success');
    });

    newSocket.on('playbackPaused', () => {
      setIsPlaying(false);
      setMessage('Playback paused by admin', 'info');
    });

    newSocket.on('playerJoined', (data) => {
      setPlayers(data.players || {});
      setScores(data.scores || {});
      setMessage(`${data.playerName} joined the game!`, 'info');
    });

    newSocket.on('playerLeft', (data) => {
      setPlayers(data.players || {});
      setScores(data.scores || {});
      setMessage(`${data.playerName} left the game`, 'info');
    });

    newSocket.on('correctGuess', (data) => {
      setPlayers(data.players || {});
      setScores(data.scores || {});
      setGuessedParts(data.guessedParts || { artist: false, title: false, lyrics: false });
      
      // Check if all parts have been guessed
      if (data.allPartsGuessed) {
        setCanGuess(false);
        setMessage(`🎉 Round complete! All parts of the song have been guessed!`, 'success');
      } else {
        const correctPartsText = data.correctParts.map(part => {
          switch(part) {
            case 'artist': return 'artist';
            case 'title': return 'song title';
            case 'lyrics': return 'lyrics';
            default: return part;
          }
        }).join(', ');
        setMessage(`🎉 ${data.playerName} guessed the ${correctPartsText} correctly!`, 'success');
      }
    });

    newSocket.on('incorrectGuess', () => {
      setMessage('Incorrect guess. Try again!', 'error');
    });

    newSocket.on('scoresReset', () => {
      setScores({});
      setMessage('Scores have been reset!', 'info');
    });

    return () => {
      newSocket.close();
    };
  }, [location.state, navigate]);

  const handleGuessSubmit = (e) => {
    e.preventDefault();
    
    if (!canGuess || !isPlaying) {
      setMessage('Cannot guess right now!', 'error');
      return;
    }

    const { artist, title, lyrics } = guess;
    if (!artist && !title && !lyrics) {
      setMessage('Please enter at least one guess!', 'error');
      return;
    }

    socket.emit('makeGuess', { artist, title, lyrics });
    setGuess({ artist: '', title: '', lyrics: '' });
  };

  const handleInputChange = (field, value) => {
    setGuess(prev => ({ ...prev, [field]: value }));
  };

  const getMessageStyle = () => {
    switch (messageType) {
      case 'success':
        return { background: '#d4edda', border: '1px solid #c3e6cb', color: '#155724' };
      case 'error':
        return { background: '#f8d7da', border: '1px solid #f5c6cb', color: '#721c24' };
      default:
        return { background: '#d1ecf1', border: '1px solid #bee5eb', color: '#0c5460' };
    }
  };

  const myScore = (scores && scores[playerName]) || 0;

  return (
    <div className="container">
      <h1 className="title">🎯 Player: {playerName}</h1>
      
      {message && (
        <div className="card" style={getMessageStyle()}>
          <p>{message}</p>
        </div>
      )}

      {/* Current Song Info */}
      {currentSong && (
        <div className="card">
          <h2 className="subtitle">🎵 Now Playing</h2>
          <div className="now-playing">
            <h3>???</h3>
            <p>by ???</p>
            <p>Album: ???</p>
            <div className="flex-center mt-20">
              <span className="score">Your Score: {myScore}</span>
            </div>
          </div>
        </div>
      )}

      {/* Guessing Form */}
      {isPlaying && (
        <div className="card">
          <h2 className="subtitle">🎯 Make Your Guess</h2>
          
          {/* Progress Indicator */}
          <div className="progress-indicator mb-20">
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
          
          {canGuess && (
            <form onSubmit={handleGuessSubmit} className="guess-form">
              <div className="guess-input">
                <input
                  type="text"
                  className={`input ${guessedParts.artist ? 'disabled' : ''}`}
                  placeholder={guessedParts.artist ? "Artist already guessed ✓" : "Artist name"}
                  value={guess.artist}
                  onChange={(e) => handleInputChange('artist', e.target.value)}
                  disabled={guessedParts.artist}
                />
                <input
                  type="text"
                  className={`input ${guessedParts.title ? 'disabled' : ''}`}
                  placeholder={guessedParts.title ? "Title already guessed ✓" : "Song title"}
                  value={guess.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  disabled={guessedParts.title}
                />
                <input
                  type="text"
                  className={`input ${guessedParts.lyrics ? 'disabled' : ''}`}
                  placeholder={guessedParts.lyrics ? "Lyrics already guessed ✓" : "Lyrics (any part)"}
                  value={guess.lyrics}
                  onChange={(e) => handleInputChange('lyrics', e.target.value)}
                  disabled={guessedParts.lyrics}
                />
              </div>
              <div className="flex-center">
                <button 
                  type="submit" 
                  className="btn"
                  disabled={!guess.artist && !guess.title && !guess.lyrics}
                >
                  Submit Guess
                </button>
              </div>
            </form>
          )}
          
          <p className="text-center" style={{ fontSize: '0.9rem', color: '#666' }}>
            {canGuess 
              ? "Guess the artist, song title, or lyrics! Each correct guess earns 1 point."
              : "Round complete! Wait for the next song to start guessing again."
            }
          </p>
        </div>
      )}

      {/* Game Status */}
      {!isPlaying && (
        <div className="card">
          <h2 className="subtitle">⏸️ Game Status</h2>
          <p className="text-center">Waiting for admin to start playing music...</p>
        </div>
      )}

      {!canGuess && isPlaying && (
        <div className="card">
          <h2 className="subtitle">🎉 Round Complete!</h2>
          <p className="text-center">Someone guessed correctly! Wait for the next song.</p>
        </div>
      )}

      {/* Player Leaderboard */}
      <div className="card">
        <h2 className="subtitle">🏆 Leaderboard</h2>
        <div className="flex-between mb-20">
          <span>Total Players: {Object.keys(players || {}).length} </span>
          <span>Your Score: {myScore}</span>
        </div>
        
        {Object.keys(scores || {}).length > 0 ? (
          <div className="player-list">
            {Object.entries(scores || {})
              .sort(([,a], [,b]) => b - a)
              .map(([name, score]) => (
                <div key={name} className="player-item">
                  <span>{name === playerName ? `👤 ${name} (You)` : name}</span>
                  <span className="score">{score} points</span>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-center">No scores yet.</p>
        )}
      </div>

      {/* Game Instructions */}
      <div className="card">
        <h2 className="subtitle">📖 How to Play</h2>
        <ul>
          <li>Listen to the music being played by the admin</li>
          <li>Guess the artist, song title, or any lyrics</li>
          <li>You only need to get one correct to earn a point</li>
          <li>Once someone guesses correctly, the round ends</li>
          <li>Wait for the next song to start guessing again</li>
          <li>Compete with other players for the highest score!</li>
        </ul>
      </div>

      {/* Back to Home */}
      <div className="card">
        <div className="flex-center">
          <button className="btn btn-secondary" onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlayerPage; 