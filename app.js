import { createClient, supabaseUrl, supabaseKey } from './supabase.js';

const supabaseClient = createClient(supabaseUrl, supabaseKey);

async function getSpotifyCredentials() {
  const { data, error } = await supabaseClient
    .from('config') // Replace 'config' with your actual Supabase table name
    .select('*')
    .in('key', ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET']);

  if (error) {
    console.error('Error fetching credentials:', error);
    return null;
  }

  const credentials = {};
  data.forEach((row) => {
    credentials[row.key] = row.value;
  });

  return credentials;
}

// Example usage
getSpotifyCredentials().then((credentials) => {
  const clientId = credentials.SPOTIFY_CLIENT_ID;
  const clientSecret = credentials.SPOTIFY_CLIENT_SECRET;



  // Use the clientId and clientSecret in your Spotify API calls
});

// DOM Elements
const commandInput = document.getElementById('commandInput');
const statusElement = document.getElementById('status');
const currentTrackElement = document.getElementById('currentTrack');
const favoritesListElement = document.getElementById('favoritesList');

// Token management
let accessToken = localStorage.getItem('spotifyAccessToken');
let tokenExpiryTime = localStorage.getItem('tokenExpiryTime');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're returning from auth flow
    if (window.location.search.includes('code=')) {
        handleCallback();
    }
    
    // Check if token exists and is valid
    checkTokenStatus();
    
    // Load favorites if authenticated
    if (isAuthenticated()) {
        loadFavorites();
        getCurrentPlayback();
    }
});

// Process text command
function processCommand() {
    const command = commandInput.value;
    if (command.trim() === '') {
        updateStatus('Please enter a command');
        return;
    }
    
    handleCommand(command);
    commandInput.value = ''; // Clear input after processing
}

// Check if user is authenticated with valid token
function isAuthenticated() {
    const currentTime = new Date().getTime();
    return accessToken && tokenExpiryTime && currentTime < parseInt(tokenExpiryTime);
}

// Check token status and update UI accordingly
function checkTokenStatus() {
    if (isAuthenticated()) {
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('controlSection').style.display = 'block';
    } else {
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('controlSection').style.display = 'none';
    }
}

// Update the status with message and optional class for styling
function updateStatus(message, className = '') {
    statusElement.textContent = message;
    statusElement.className = className;
    
    // Auto-clear status after 5 seconds for success/info messages
    if (className !== 'error') {
        setTimeout(() => {
            statusElement.textContent = '';
            statusElement.className = '';
        }, 5000);
    }
}

// Voice recognition
function startVoiceRecognition() {
    if (!('webkitSpeechRecognition' in window)) {
        updateStatus('Voice recognition not supported in this browser.', 'error');
        return;
    }

    const recognition = new webkitSpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onstart = function() {
        updateStatus('Listening... Speak now', 'listening');
        document.getElementById('voiceButton').classList.add('listening');
    };

    recognition.onresult = function(event) {
        const command = event.results[0][0].transcript;
        updateStatus(`You said: ${command}`);
        handleCommand(command);
    };

    recognition.onerror = function(event) {
        updateStatus(`Error occurred in recognition: ${event.error}`, 'error');
        document.getElementById('voiceButton').classList.remove('listening');
    };

    recognition.onend = function() {
        document.getElementById('voiceButton').classList.remove('listening');
    };

    recognition.start();
}

// Spotify Authentication
function authorize() {
    // Define scopes needed for the app
    const scopes = [
        'user-read-private',
        'user-read-email',
        'user-modify-playback-state',
        'user-read-playback-state',
        'user-read-currently-playing',
        'playlist-read-private',
        'playlist-read-collaborative'
    ].join(' ');
    
    // Create authorization URL
    const authUrl = `https://accounts.spotify.com/authorize?response_type=code`+
        `&client_id=${encodeURIComponent(clientId)}`+
        `&scope=${encodeURIComponent(scopes)}`+
        `&redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    // Redirect to Spotify authorization page
    window.location.href = authUrl;
}

// Handle the callback from Spotify authorization
async function handleCallback() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        
        if (!code) {
            throw new Error('Authorization code not found');
        }
        
        // Exchange code for token
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + btoa(clientId + ':' + clientSecret)
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri
            }).toString()
        });
        
        if (!response.ok) {
            throw new Error('Failed to exchange code for token');
        }
        
        const data = await response.json();
        
        // Save tokens and expiry time
        accessToken = data.access_token;
        const expiresIn = data.expires_in; // in seconds
        const tokenExpiry = new Date().getTime() + (expiresIn * 1000);
        
        localStorage.setItem('spotifyAccessToken', accessToken);
        localStorage.setItem('tokenExpiryTime', tokenExpiry);
        if (data.refresh_token) {
            localStorage.setItem('spotifyRefreshToken', data.refresh_token);
        }
        
        // Clear the URL parameters to prevent reusing the code
        window.history.replaceState({}, document.title, redirectUri);
        
        updateStatus('Successfully connected to Spotify!', 'success');
        checkTokenStatus();
        loadFavorites();
        getCurrentPlayback();
    } catch (error) {
        console.error('Authorization error:', error);
        updateStatus(`Authorization failed: ${error.message}`, 'error');
    }
}

// Refresh the access token
async function refreshToken() {
    try {
        const refreshToken = localStorage.getItem('spotifyRefreshToken');
        
        if (!refreshToken) {
            throw new Error('No refresh token available');
        }
        
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + btoa(clientId + ':' + clientSecret)
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            }).toString()
        });
        
        if (!response.ok) {
            throw new Error('Failed to refresh token');
        }
        
        const data = await response.json();
        
        // Update tokens
        accessToken = data.access_token;
        const expiresIn = data.expires_in; // in seconds
        const tokenExpiry = new Date().getTime() + (expiresIn * 1000);
        
        localStorage.setItem('spotifyAccessToken', accessToken);
        localStorage.setItem('tokenExpiryTime', tokenExpiry);
        
        if (data.refresh_token) {
            localStorage.setItem('spotifyRefreshToken', data.refresh_token);
        }
        
        return true;
    } catch (error) {
        console.error('Token refresh error:', error);
        logout(); // If refresh fails, logout
        return false;
    }
}

// Ensure token is valid before making API calls
async function ensureValidToken() {
    if (!isAuthenticated()) {
        if (localStorage.getItem('spotifyRefreshToken')) {
            const success = await refreshToken();
            if (!success) {
                return false;
            }
        } else {
            return false;
        }
    }
    return true;
}

// Logout function
function logout() {
    localStorage.removeItem('spotifyAccessToken');
    localStorage.removeItem('tokenExpiryTime');
    localStorage.removeItem('spotifyRefreshToken');
    accessToken = null;
    tokenExpiryTime = null;
    checkTokenStatus();
    updateStatus('Logged out successfully');
}

// Get current playback state
async function getCurrentPlayback() {
    if (!await ensureValidToken()) {
        updateStatus('Please log in to Spotify', 'error');
        return;
    }
    
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (response.status === 204) {
            // No active device
            currentTrackElement.innerHTML = '<p>No active playback</p>';
            return;
        }
        
        if (!response.ok) {
            throw new Error('Failed to get current playback');
        }
        
        const data = await response.json();
        
        if (data && data.item) {
            const track = data.item;
            const artists = track.artists.map(artist => artist.name).join(', ');
            const albumImg = track.album.images[0]?.url || '';
            
            currentTrackElement.innerHTML = `
                <div class="track-info">
                    ${albumImg ? `<img src="${albumImg}" alt="${track.name}" class="album-cover">` : ''}
                    <div>
                        <h3>${track.name}</h3>
                        <p>${artists}</p>
                        <p>${track.album.name}</p>
                    </div>
                </div>
            `;
        } else {
            currentTrackElement.innerHTML = '<p>No track currently playing</p>';
        }
    } catch (error) {
        console.error('Get playback error:', error);
        updateStatus(`Error getting playback: ${error.message}`, 'error');
    }
}

// Playback controls
async function playTrack(trackUri) {
    if (!await ensureValidToken()) {
        updateStatus('Please log in to Spotify', 'error');
        return;
    }
    
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ uris: [trackUri] })
        });
        
        if (response.status === 404) {
            throw new Error('No active device found. Start Spotify on a device first.');
        }
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Unknown error');
        }
        
        updateStatus('Playing track!', 'success');
        
        // Update current track display after a short delay
        setTimeout(getCurrentPlayback, 1000);
    } catch (error) {
        console.error('Play track error:', error);
        updateStatus(`Error playing track: ${error.message}`, 'error');
    }
}

async function playPlaylist(playlistUri) {
    if (!await ensureValidToken()) {
        updateStatus('Please log in to Spotify', 'error');
        return;
    }
    
    try {
        const response = await fetch('https://api.spotify.com/v1/me/player/play', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ context_uri: playlistUri })
        });
        
        if (response.status === 404) {
            throw new Error('No active device found. Start Spotify on a device first.');
        }
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Unknown error');
        }
        
        updateStatus('Playing playlist!', 'success');
        
        // Update current track display after a short delay
        setTimeout(getCurrentPlayback, 1000);
    } catch (error) {
        console.error('Play playlist error:', error);
        updateStatus(`Error playing playlist: ${error.message}`, 'error');
    }
}

// Search Spotify
async function searchSpotify(query, type = 'track') {
    if (!await ensureValidToken()) {
        updateStatus('Please log in to Spotify', 'error');
        return null;
    }
    
    try {
        const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=${type}&limit=5`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Search failed');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Search error:', error);
        updateStatus(`Search error: ${error.message}`, 'error');
        return null;
    }
}

// Get user's playlists
async function getUserPlaylists() {
    if (!await ensureValidToken()) {
        updateStatus('Please log in to Spotify', 'error');
        return null;
    }
    
    try {
        const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to get playlists');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Get playlists error:', error);
        updateStatus(`Error getting playlists: ${error.message}`, 'error');
        return null;
    }
}

// Favorites management with Supabase
async function saveFavoriteToDb(name, type, uri) {
    try {
        const result = await saveFavorite(name, type, uri);
        if (result.success) {
            updateStatus(`Saved "${name}" to favorites`, 'success');
            loadFavorites(); // Refresh favorites list
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Save favorite error:', error);
        updateStatus(`Error saving favorite: ${error.message}`, 'error');
    }
}

async function loadFavorites() {
    try {
        const result = await getFavorites();
        if (result.success) {
            // Clear current list
            favoritesListElement.innerHTML = '';
            
            if (result.favorites.length === 0) {
                favoritesListElement.innerHTML = '<p>No favorites saved yet</p>';
                return;
            }
            
            // Create list of favorites
            const ul = document.createElement('ul');
            result.favorites.forEach(fav => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${fav.name} (${fav.type})</span>
                    <button onclick="playFromFavorite('${fav.spotify_uri}', '${fav.type}')">Play</button>
                `;
                ul.appendChild(li);
            });
            
            favoritesListElement.appendChild(ul);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Load favorites error:', error);
        updateStatus(`Error loading favorites: ${error.message}`, 'error');
    }
}

// Play from favorite
function playFromFavorite(uri, type) {
    if (type === 'track') {
        playTrack(uri);
    } else if (type === 'playlist' || type === 'album') {
        playPlaylist(uri);
    }
}

// Enhanced command handling with NLP
async function handleCommand(command) {
    // Save command to history
    if (isAuthenticated()) {
        saveCommandHistory(command).catch(console.error);
    }
    
    // Convert to lowercase for easier matching
    const lowerCommand = command.toLowerCase();
    
    // Check for direct URI commands (backward compatibility)
    if (lowerCommand.startsWith('play track ')) {
        const trackUri = command.replace('play track ', '');
        playTrack(trackUri);
        return;
    } 
    
    if (lowerCommand.startsWith('play playlist ')) {
        const playlistUri = command.replace('play playlist ', '');
        playPlaylist(playlistUri);
        return;
    }
    
    // Play favorite
    if (lowerCommand.includes('play') && lowerCommand.includes('favorite')) {
        const nameMatch = lowerCommand.match(/play(?:\s+my)?\s+favorite\s+(.+)/i);
        if (nameMatch && nameMatch[1]) {
            const favName = nameMatch[1].trim();
            const result = await findFavoriteByName(favName);
            
            if (result.success) {
                updateStatus(`Playing your favorite: ${result.favorite.name}`);
                playFromFavorite(result.favorite.spotify_uri, result.favorite.type);
            } else {
                updateStatus(`Favorite "${favName}" not found`, 'error');
            }
        } else {
            // Play first favorite
            const result = await getFavorites();
            if (result.success && result.favorites.length > 0) {
                const firstFav = result.favorites[0];
                updateStatus(`Playing your favorite: ${firstFav.name}`);
                playFromFavorite(firstFav.spotify_uri, firstFav.type);
            } else {
                updateStatus('No favorites found', 'error');
            }
        }
        return;
    }
    
    // Save current as favorite
    if (lowerCommand.includes('save') && 
        (lowerCommand.includes('favorite') || lowerCommand.includes('favourites'))) {
        
        // Get current track
        if (!await ensureValidToken()) {
            updateStatus('Please log in to Spotify', 'error');
            return;
        }
        
        try {
            const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            
            if (response.status === 204) {
                updateStatus('No track currently playing', 'error');
                return;
            }
            
            if (!response.ok) {
                throw new Error('Failed to get current track');
            }
            
            const data = await response.json();
            
            if (data && data.item) {
                const track = data.item;
                const nameMatch = lowerCommand.match(/save\s+(?:as|to)?\s+(?:my)?\s+(?:favorite|favourites?)(?:\s+as)?\s+(.+)/i);
                const favName = nameMatch && nameMatch[1] ? 
                    nameMatch[1].trim() : 
                    `${track.name} by ${track.artists[0].name}`;
                
                await saveFavoriteToDb(favName, 'track', track.uri);
            }
        } catch (error) {
            console.error('Save favorite error:', error);
            updateStatus(`Error saving favorite: ${error.message}`, 'error');
        }
        return;
    }
    
    // Search and play
    if (lowerCommand.includes('play')) {
        // Extract search query
        let searchQuery = command;
        if (lowerCommand.startsWith('play ')) {
            searchQuery = command.substring(5);
        }
        
        // Special cases
        if (lowerCommand.includes('discover weekly') || lowerCommand.includes('discovery weekly')) {
            // Find Discover Weekly playlist
            const playlists = await getUserPlaylists();
            if (playlists && playlists.items) {
                const discoverWeekly = playlists.items.find(
                    p => p.name.toLowerCase().includes('discover weekly')
                );
                
                if (discoverWeekly) {
                    updateStatus(`Playing Discover Weekly playlist`);
                    playPlaylist(discoverWeekly.uri);
                    return;
                }
            }
        }
        
        // Determine search type
        let searchType = 'track';
        if (lowerCommand.includes('album')) {
            searchType = 'album';
        } else if (lowerCommand.includes('playlist')) {
            searchType = 'playlist';
        } else if (lowerCommand.includes('artist')) {
            searchType = 'artist';
        }
        
        // Search and play first result
        const searchResults = await searchSpotify(searchQuery, searchType);
        if (searchResults) {
            const resultKey = searchType + 's'; // e.g., 'tracks', 'albums'
            if (searchResults[resultKey]?.items?.length > 0) {
                const firstResult = searchResults[resultKey].items[0];
                
                if (searchType === 'track') {
                    updateStatus(`Playing "${firstResult.name}" by ${firstResult.artists[0].name}`);
                    playTrack(firstResult.uri);
                } else {
                    updateStatus(`Playing ${searchType} "${firstResult.name}"`);
                    playPlaylist(firstResult.uri);
                }
            } else {
                updateStatus(`No ${searchType}s found for "${searchQuery}"`, 'error');
            }
        }
        return;
    }
    
    // If no command matched
    updateStatus(`I don't understand the command: "${command}"`, 'error');
}
