import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { useLogging } from '../contexts/LoggingContext';

const PlayerPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { log, logError } = useLogging();
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
  const [lyricsAvailable, setLyricsAvailable] = useState(true);
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
    log('Attempting to connect to Socket.IO server at', backendUrl);
    const newSocket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000
    });
    setSocket(newSocket);

    // Socket event listeners
    newSocket.on('connect', () => {
      log('Connected to server with socket ID:', newSocket.id);
      // Join with game code
      newSocket.emit('playerJoin', { 
        playerName: location.state.playerName,
        gameCode: location.state.gameCode 
      });
    });

    newSocket.on('connect_error', (error) => {
      logError('Socket connection error:', error);
    });

    newSocket.on('disconnect', (reason) => {
      log('Disconnected from server:', reason);
    });

    newSocket.on('gameCodeInvalid', (data) => {
      logError('Game code invalid:', data.error);
      setMessage(data.error, 'error');
      // Redirect back to landing page after a short delay
      setTimeout(() => {
        navigate('/');
      }, 3000);
    });

    newSocket.on('gameEnded', (data) => {
      log('Game ended:', data.message);
      setMessage(data.message, 'error');
      // Redirect back to landing page after a short delay
      setTimeout(() => {
        navigate('/');
      }, 5000);
    });

    newSocket.on('gameState', (gameState) => {
      log('Received game state:', gameState);
      setCurrentSong(gameState.currentSong);
      setPlayers(gameState.players || {});
      setScores(gameState.scores || {});
      setIsPlaying(gameState.isPlaying);
      setGuessedParts(gameState.guessedParts || { artist: false, title: false, lyrics: false });
    });

    newSocket.on('newSong', (song) => {
      log('Received new song:', song);
      setCurrentSong(song);
      setIsPlaying(true);
      setLyricsAvailable(song.lyricsAvailable !== false);
      
      // Clear input fields for new song
      setGuess({ artist: '', title: '', lyrics: '' });
      setLyricsLetterCount(0);
      
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
      setCanGuess(!isCompleted);
      
      if (isCompleted) {
        setMessage('This song has already been completed! All parts have been guessed.', 'info');
        setMessageType('info');
      } else if (hasProgress) {
        setMessage('This song has partial progress! Some parts have already been guessed.', 'info');
        setMessageType('info');
      } else {
        setMessage('New song started! Start guessing!');
        setMessageType('success');
      }
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
      
      // Clear input fields for parts that were just guessed correctly
      const newGuess = { ...guess };
      data.correctParts.forEach(part => {
        newGuess[part] = '';
      });
      setGuess(newGuess);
      
      // Reset lyrics letter count if lyrics were guessed
      if (data.correctParts.includes('lyrics')) {
        setLyricsLetterCount(0);
      }
      
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

    newSocket.on('playerKicked', (data) => {
      setPlayers(data.players || {});
      setScores(data.scores || {});
      if (data.playerName === playerName) {
        setMessage(`You have been kicked from the game. Reason: ${data.reason}`, 'error');
        // Redirect back to landing page after a short delay
        setTimeout(() => {
          navigate('/');
        }, 5000);
      } else {
        setMessage(`${data.playerName} has been kicked from the game.`, 'info');
      }
    });

    newSocket.on('accessDenied', (data) => {
      setMessage(data.error, 'error');
      // Redirect back to landing page after a short delay
      setTimeout(() => {
        navigate('/');
      }, 5000);
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
    // Sanitize input to prevent XSS and injection attacks (less restrictive for user experience)
    const sanitized = value
      .replace(/[<>`{}|$\\]/g, '') // Remove only truly dangerous characters, allow apostrophes, quotes, parentheses
      .replace(/script|javascript|vbscript|onload|onerror|onclick/gi, '') // Remove script keywords
      .substring(0, 100); // Limit length
    
    setGuess(prev => ({ ...prev, [field]: sanitized }));
    
    // Count letters for lyrics input
    if (field === 'lyrics') {
      const letterCount = sanitized.replace(/[^\w]/g, '').length;
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
              <span className="progress-label">Lyrics {guessedParts.lyrics ? '✓' : !lyricsAvailable ? '✗' : ''}</span>
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (guess.artist || guess.title || guess.lyrics)) {
                      e.preventDefault();
                      handleGuessSubmit(e);
                    }
                  }}
                  enterKeyHint="done"
                  disabled={guessedParts.title}
                  maxLength={100}
                />
                <input
                  ref={artistInputRef}
                  type="text"
                  className={`input ${guessedParts.artist ? 'disabled' : ''}`}
                  placeholder={guessedParts.artist ? "Artist already guessed ✓" : "Artist name"}
                  value={guess.artist}
                  onChange={(e) => handleInputChange('artist', e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (guess.artist || guess.title || guess.lyrics)) {
                      e.preventDefault();
                      handleGuessSubmit(e);
                    }
                  }}
                  enterKeyHint="done"
                  disabled={guessedParts.artist}
                  maxLength={100}
                />
                <div className="lyrics-input-container">
                  <input
                    ref={lyricsInputRef}
                    type="text"
                    className={`input ${guessedParts.lyrics ? 'disabled' : ''} ${!lyricsAvailable ? 'disabled' : ''} ${lyricsLetterCount > 0 && lyricsLetterCount < 12 ? 'input-warning' : ''}`}
                    placeholder={guessedParts.lyrics ? "Lyrics already guessed ✓" : !lyricsAvailable ? "Lyrics not available ✗" : "Lyrics (min 12 letters)"}
                    value={guess.lyrics}
                    onChange={(e) => handleInputChange('lyrics', e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (guess.artist || guess.title || guess.lyrics)) {
                        e.preventDefault();
                        handleGuessSubmit(e);
                      }
                    }}
                    enterKeyHint="done"
                    disabled={guessedParts.lyrics || !lyricsAvailable}
                    maxLength={100}
                  />
                  {guess.lyrics && !guessedParts.lyrics && lyricsAvailable && (
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
              ? "Guess the artist, song title, or lyrics! You can use apostrophes, quotes, and other common characters. Lyrics must be at least 12 letters. Each correct guess earns 1 point."
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
          <li>Listen to the music being played by the admin.</li>
          <li>Guess the song title, artist, and any lyrics.</li>
          <li>Song titles: Parentheses and special characters are ignored.</li>
          <li>Artist names: All special characters are ignored.</li>
          <li>Lyrics guesses must be at least 12 letters long.</li>
          <li>Punctuation and special characters are ignored in lyrics</li>
          <li>Each correct guess earns one point.</li>
          <li>If you guess all three items correctly, you earn one bonus point!</li>
          <li>Once all items are guessed correctly, guessing for that song is disabled</li>
          <li>When a new song starts, you can begin guessing again.</li>
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