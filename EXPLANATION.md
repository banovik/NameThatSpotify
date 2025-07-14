# High-Level Overview

This app is a real-time, multiplayer music guessing game powered by Spotify. The backend (Node.js/Express) manages game state, player connections, and API requests. The frontend (React) provides the user interface for both players and admins, handling real-time updates and user interactions. The app fetches song lyrics from lyrics.ovh and playlist/track data from Spotify.

# Project Structure and File Roles

## Root Directory

- server.js: The main backend server file. Sets up the Express server, handles API endpoints, manages WebSocket connections for real-time updates, and orchestrates game logic (playlist management, player state, lyrics fetching, etc.).
- package.json / package-lock.json: Define backend dependencies (Express, axios, etc.) and scripts.
- env.example: Template for environment variables (e.g., Spotify credentials).
- README.md: Project documentation.

## /client

This is the React frontend.

- package.json / package-lock.json: Define frontend dependencies (React, axios, etc.).
- env.local: Local environment variables for the frontend (e.g., API base URL).

## /client/public

- index.html: The single HTML file loaded by the browser. It contains a <div id="root"></div> where the React app is mounted. It also includes the manifest for PWA support.

## /client/src

- index.js: The entry point for the React app. It renders the <App /> component into the root div in index.html.
- index.css: Global CSS styles for the app.
- App.js: The main React component that sets up routing and global state. It determines which page (Landing, Player, Admin) to show based on the user’s role or URL.
- components/
    - LandingPage.js: The landing page where users choose to join as a player or admin.
    - PlayerPage.js: The main interface for players. Handles displaying the current song, lyrics guessing UI, and the leaderboard.
    - AdminPage.js: The admin dashboard. Allows playlist management, track control, viewing player scores, and using troubleshooting tools.

# How the App Works (End-to-End Flow)

1. HTML and React Bootstrapping
    - The browser loads client/public/index.html, which is a minimal HTML file with a root div.
    - client/src/index.js uses ReactDOM to render the React app (<App />) into this root div.
    - React takes over the UI from here, rendering components dynamically based on app state.
2. Routing and State Management
    - <App /> manages which page to show (Landing, Player, Admin) using React state and/or routing.
    - State is managed using React’s useState, useEffect, and context/hooks as needed.
3. Admin Flow
    - The admin logs in and is shown the AdminPage.
    - AdminPage.js provides:
        - Instructions: How to set up Spotify and the game.
        - Playlist Management: Enter a Spotify playlist URL, which is sent to the backend to load tracks.
        - Track Controls: Play, pause, skip tracks.
        - Leaderboard: See player scores in real time.
        - Connected Players: See who is connected.
        - Troubleshooting Tools: Check Spotify device status, test lyrics fetching, etc.
        - Destructive Actions: Reset scores, reset playlist, select new playlist (all with confirmation dialogs).
4. Player Flow
    - Players join via the LandingPage and are routed to PlayerPage.js.
    - PlayerPage.js provides:
        - Current Song Info: Shows the current track (but not the answer).
        - Lyrics Guessing UI: Players guess missing lyrics. If lyrics are unavailable, guessing is disabled.
        - Progress Indicator: Shows which parts of the lyrics have been guessed.
        - Leaderboard: Shows player rankings and scores.
5. Backend API and Real-Time Communication
    - server.js exposes REST API endpoints for:
        - Loading playlists from Spotify (using the Spotify Web API).
        - Fetching lyrics for tracks (using lyrics.ovh).
        - Managing game state (current track, guessed lyrics, scores, etc.).
        - Admin actions (resetting scores, playlist, etc.).
    - The backend also uses WebSockets (or similar) to push real-time updates to all connected clients (players and admin), ensuring everyone sees the latest game state instantly.
6. Lyrics Fetching
    - When a new track is played, the backend queries lyrics.ovh for lyrics using the artist and track name.
    - If lyrics are found, they are sent to the frontend for display and guessing.
    - If not, the UI disables lyrics guessing and shows a message.
7. Game State Persistence
    - The backend maintains a persistent songStates object, tracking which lyrics have been guessed for each song and whether a song is complete or partially guessed.
    - This state persists until the admin clicks "Reset Playlist", at which point all progress is cleared.
8. Leaderboard and Player Management
    - The backend tracks all connected players, their scores, and their guesses.
    - The leaderboard is calculated and sent to both the player and admin UIs.
    - The admin can see all connected players and their scores.

# How JavaScript and React Are Used

- JavaScript is used throughout for logic, API calls (with axios/fetch), and state management.
- React provides a component-based architecture, allowing for modular, reusable UI elements.
- React State and Effects (useState, useEffect) manage UI updates, API calls, and real-time data.
- Event Handlers (e.g., button clicks) trigger API requests to the backend and update the UI accordingly.
- Conditional Rendering is used to show/hide UI elements based on game state (e.g., disabling guessing if lyrics are missing).

# How the HTML File Is Constructed

- The public/index.html file is a minimal HTML5 document with a <div id="root"></div>.
- All visible UI is rendered by React into this root div.
- The HTML file also includes a manifest for PWA support and can include meta tags, favicon, etc.

# How APIs Are Queried

- Frontend to Backend: The React app uses axios or fetch to call backend endpoints (e.g., /api/playlist, /api/lyrics, /api/guess).
- Backend to Spotify: The backend uses the Spotify Web API to fetch playlist and track data. OAuth is used for authentication.
- Backend to lyrics.ovh: The backend fetches lyrics from lyrics.ovh with a simple HTTP GET request (no authentication required).
- WebSockets: Used for real-time updates between backend and frontend (e.g., when a player makes a guess, all clients are updated).

# How Each File Is Connected

- index.html is the entry point for the app, loaded by the browser.
- index.js bootstraps the React app, rendering <App /> into the root div.
- App.js manages routing and global state, rendering either the Landing, Player, or Admin page.
- AdminPage.js, PlayerPage.js, and LandingPage.js are rendered by <App /> based on the user’s role and app state.
- App.js and its children make API calls to the backend (server.js) to fetch data, submit guesses, and perform admin actions.
- server.js handles all backend logic, API requests to Spotify and lyrics.ovh, and manages real-time communication with clients.

# Key Technologies

- React: UI framework for building interactive, component-based interfaces.
- Node.js/Express: Backend server for API endpoints and real-time communication.
- Spotify Web API: For playlist and track data.
- lyrics.ovh API: For fetching song lyrics.
- WebSockets: For real-time updates between backend and frontend.
- JavaScript: Used throughout for logic, state, and API calls.