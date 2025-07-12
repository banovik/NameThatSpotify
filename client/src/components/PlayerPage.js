import React, { useState, useEffect, useRef } from 'react';
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
  const [lyricsLetterCount, setLyricsLetterCount] = useState(0);
  const [guessedParts, setGuessedParts] = useState({ artist: false, title: false, lyrics: false });
  const [activeInput, setActiveInput] = useState('title'); // Track which input should be focused
  
  // Refs for input elements
  const titleInputRef = useRef(null);
  const artistInputRef = useRef(null);
  const lyricsInputRef = useRef(null);

  useEffect(() => {
    // Get player name from navigation state
    if (location.state?.playerName) {
      setPlayerName(location.state.playerName);
    } else {
      navigate('/');
      return;
    }

    // Initialize Socket.IO connection
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:5001';
    console.log('Attempting to connect to Socket.IO server at', backendUrl);
    const newSocket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000
    });
    setSocket(newSocket);

    // Socket event listeners
    newSocket.on('connect', () => {
      console.log('Connected to server with socket ID:', newSocket.id);
      newSocket.emit('playerJoin', location.state.playerName);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
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

    newSocket.on('playbackResumed', () => {
      setIsPlaying(true);
      setMessage('Playback resumed by admin', 'info');
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
        let message = `Round complete. All parts of the song have been guessed!`;
        if (data.bonusAwarded) {
          message += ` 🏆 ${data.playerName} earned a bonus point for completing all parts first!`;
        }
        setMessage(message, 'success');
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

    newSocket.on('validationError', (data) => {
      setMessage(data.error, 'error');
    });

    newSocket.on('usernameTaken', (data) => {
      setMessage(data.error, 'error');
      // Redirect back to landing page after a short delay
      setTimeout(() => {
        navigate('/');
      }, 3000);
    });

    newSocket.on('scoresReset', () => {
      setScores({});
      setMessage('Scores have been reset!', 'info');
    });

    return () => {
      newSocket.close();
    };
  }, [location.state, navigate]);

  // Determine which input should be active based on guessed parts
  useEffect(() => {
    if (!guessedParts.title) {
      setActiveInput('title');
    } else if (!guessedParts.artist) {
      setActiveInput('artist');
    } else if (!guessedParts.lyrics) {
      setActiveInput('lyrics');
    }
  }, [guessedParts]);

  // Focus the active input when it changes
  useEffect(() => {
    if (canGuess && currentSong) {
      const focusInput = () => {
        switch (activeInput) {
          case 'title':
            if (titleInputRef.current && !guessedParts.title) {
              titleInputRef.current.focus();
            }
            break;
          case 'artist':
            if (artistInputRef.current && !guessedParts.artist) {
              artistInputRef.current.focus();
            }
            break;
          case 'lyrics':
            if (lyricsInputRef.current && !guessedParts.lyrics) {
              lyricsInputRef.current.focus();
            }
            break;
        }
      };
      
      // Small delay to ensure the input is rendered
      setTimeout(focusInput, 100);
    }
  }, [activeInput, canGuess, currentSong, guessedParts]);

  const handleGuessSubmit = (e) => {
    e.preventDefault();
    
    if (!canGuess || !currentSong) {
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
    
    // Count letters for lyrics input
    if (field === 'lyrics') {
      const letterCount = value.replace(/[^\w]/g, '').length;
      setLyricsLetterCount(letterCount);
    }
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
      <h1 className="title">Player: {playerName}</h1>
      
      {message && (
        <div className="card" style={getMessageStyle()}>
          <p>{message}</p>
        </div>
      )}

      {/* Guessing Form */}
      {currentSong && (
        <div className="card">
          <h2 className="subtitle">Make Your Guess</h2>
          
          {/* Progress Indicator */}
          <div className="progress-indicator mb-20">
            <div className="progress-item">
              <span className={`progress-dot ${guessedParts.title ? 'guessed' : ''}`}>🎵</span>
              <span className="progress-label">Title {guessedParts.title ? '✓' : ''}</span>
            </div>
            <div className="progress-item">
              <span className={`progress-dot ${guessedParts.artist ? 'guessed' : ''}`}>🎤</span>
              <span className="progress-label">Artist {guessedParts.artist ? '✓' : ''}</span>
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
                  ref={titleInputRef}
                  type="text"
                  className={`input ${guessedParts.title ? 'disabled' : ''}`}
                  placeholder={guessedParts.title ? "Title already guessed ✓" : "Song title"}
                  value={guess.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  disabled={guessedParts.title}
                />
                <input
                  ref={artistInputRef}
                  type="text"
                  className={`input ${guessedParts.artist ? 'disabled' : ''}`}
                  placeholder={guessedParts.artist ? "Artist already guessed ✓" : "Artist name"}
                  value={guess.artist}
                  onChange={(e) => handleInputChange('artist', e.target.value)}
                  disabled={guessedParts.artist}
                />
                <div className="lyrics-input-container">
                  <input
                    ref={lyricsInputRef}
                    type="text"
                    className={`input ${guessedParts.lyrics ? 'disabled' : ''} ${lyricsLetterCount > 0 && lyricsLetterCount < 12 ? 'input-warning' : ''}`}
                    placeholder={guessedParts.lyrics ? "Lyrics already guessed ✓" : "Lyrics (min 12 letters)"}
                    value={guess.lyrics}
                    onChange={(e) => handleInputChange('lyrics', e.target.value)}
                    disabled={guessedParts.lyrics}
                  />
                  {guess.lyrics && !guessedParts.lyrics && (
                    <div className="letter-count">
                      {lyricsLetterCount}/12 letters
                    </div>
                  )}
                </div>
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
              ? "Guess the artist, song title, or lyrics! Special characters are ignored in all guesses. Lyrics must be at least 12 letters. Each correct guess earns 1 point."
              : "All parts of this song have been guessed! Wait for the next song to start guessing again."
            }
          </p>
        </div>
      )}

      {/* Current Song Info */}
      {currentSong && (
        <div className="card">
          <h2 className="subtitle">Now Playing</h2>
          <div className="now-playing">
            <h3>{guessedParts.title ? currentSong.name : '???'}</h3>
            <p>by {guessedParts.artist ? currentSong.artists.join(', ') : '???'}</p>
          </div>
        </div>
      )}

      {/* Game Status */}
      {!currentSong && (
        <div className="card">
          <h2 className="subtitle">Game Status</h2>
          <p className="text-center">Waiting for admin to start playing music...</p>
        </div>
      )}

      {/* Player Leaderboard */}
      <div className="card">
        <h2 className="subtitle">Leaderboard</h2>
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
        <h2 className="subtitle">How to Play</h2>
        <ul>
          <li>Listen to the music being played by the admin</li>
          <li>Guess the song title, artist, and any lyrics</li>
          <li>Song titles: Parentheses and special characters are ignored</li>
          <li>Artist names: Special characters are ignored</li>
          <li>Lyrics guesses must be at least 12 letters long</li>
          <li>Punctuation and special characters are ignored in lyrics</li>
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