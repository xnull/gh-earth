// Initialize map
let map;
let markers = [];
let developerCache = new Map();
let locationCache = new Map();
let currentSearches = new Set();

// GitHub API configuration
const GITHUB_API_BASE = 'https://api.github.com';

// Major cities and regions for location-based search
const MAJOR_LOCATIONS = [
    // North America
    { name: 'San Francisco', lat: 37.7749, lng: -122.4194, searchTerms: ['San Francisco', 'SF', 'Bay Area'] },
    { name: 'New York', lat: 40.7128, lng: -74.0060, searchTerms: ['New York', 'NYC', 'Manhattan', 'Brooklyn'] },
    { name: 'Seattle', lat: 47.6062, lng: -122.3321, searchTerms: ['Seattle', 'Washington'] },
    { name: 'Austin', lat: 30.2672, lng: -97.7431, searchTerms: ['Austin', 'Texas'] },
    { name: 'Toronto', lat: 43.6532, lng: -79.3832, searchTerms: ['Toronto', 'Canada'] },
    
    // Europe
    { name: 'London', lat: 51.5074, lng: -0.1278, searchTerms: ['London', 'UK', 'United Kingdom'] },
    { name: 'Berlin', lat: 52.5200, lng: 13.4050, searchTerms: ['Berlin', 'Germany'] },
    { name: 'Paris', lat: 48.8566, lng: 2.3522, searchTerms: ['Paris', 'France'] },
    { name: 'Amsterdam', lat: 52.3676, lng: 4.9041, searchTerms: ['Amsterdam', 'Netherlands'] },
    { name: 'Stockholm', lat: 59.3293, lng: 18.0686, searchTerms: ['Stockholm', 'Sweden'] },
    
    // Asia
    { name: 'Tokyo', lat: 35.6762, lng: 139.6503, searchTerms: ['Tokyo', 'Japan'] },
    { name: 'Beijing', lat: 39.9042, lng: 116.4074, searchTerms: ['Beijing', 'China'] },
    { name: 'Shanghai', lat: 31.2304, lng: 121.4737, searchTerms: ['Shanghai', 'China'] },
    { name: 'Bangalore', lat: 12.9716, lng: 77.5946, searchTerms: ['Bangalore', 'Bengaluru', 'India'] },
    { name: 'Singapore', lat: 1.3521, lng: 103.8198, searchTerms: ['Singapore'] },
    
    // Other regions
    { name: 'Sydney', lat: -33.8688, lng: 151.2093, searchTerms: ['Sydney', 'Australia'] },
    { name: 'São Paulo', lat: -23.5505, lng: -46.6333, searchTerms: ['São Paulo', 'Brazil'] },
    { name: 'Tel Aviv', lat: 32.0853, lng: 34.7818, searchTerms: ['Tel Aviv', 'Israel'] },
    { name: 'Dubai', lat: 25.2048, lng: 55.2708, searchTerms: ['Dubai', 'UAE'] }
];

// Initialize the map
function initMap() {
    map = L.map('map').setView([20, 0], 2);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);
    
    // Add map event listeners
    map.on('moveend', debounce(onMapMoveEnd, 1000));
    map.on('zoomend', debounce(onMapMoveEnd, 1000));
}

// Debounce function to limit API calls
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Handle map movement
async function onMapMoveEnd() {
    const bounds = map.getBounds();
    const zoom = map.getZoom();
    
    // Only load developers if zoomed in enough (zoom level > 4)
    if (zoom > 4) {
        await loadDevelopersInView(bounds);
    }
}

// Find locations visible in current map bounds
function getVisibleLocations(bounds) {
    return MAJOR_LOCATIONS.filter(location => {
        return bounds.contains([location.lat, location.lng]);
    });
}

// Load developers in the current view
async function loadDevelopersInView(bounds) {
    showLoading(true);
    
    const visibleLocations = getVisibleLocations(bounds);
    
    if (visibleLocations.length === 0) {
        showLoading(false);
        return;
    }
    
    try {
        // Search for developers in visible locations
        const searchPromises = visibleLocations.map(location => 
            searchDevelopersByLocation(location)
        );
        
        const results = await Promise.all(searchPromises);
        const allDevelopers = results.flat();
        
        // Update the count
        const uniqueDevelopers = new Map();
        allDevelopers.forEach(dev => {
            if (!uniqueDevelopers.has(dev.login)) {
                uniqueDevelopers.set(dev.login, dev);
            }
        });
        
        document.getElementById('developerCount').textContent = 
            `${uniqueDevelopers.size} developers in view (${markers.length} total loaded)`;
        
    } catch (error) {
        console.error('Error loading developers:', error);
    } finally {
        showLoading(false);
    }
}

// Search for developers by location
async function searchDevelopersByLocation(location) {
    const developers = [];
    
    for (const searchTerm of location.searchTerms) {
        // Skip if we're already searching this term
        if (currentSearches.has(searchTerm)) {
            continue;
        }
        
        // Check cache first
        if (developerCache.has(searchTerm)) {
            const cachedDevs = developerCache.get(searchTerm);
            await addDevelopersToMap(cachedDevs, false);
            developers.push(...cachedDevs);
            continue;
        }
        
        currentSearches.add(searchTerm);
        
        try {
            // Search for users with location matching the search term
            const response = await fetch(
                `${GITHUB_API_BASE}/search/users?q=location:"${encodeURIComponent(searchTerm)}"+followers:>500&sort=followers&order=desc&per_page=30`
            );
            
            if (!response.ok) {
                if (response.status === 403) {
                    console.warn('GitHub API rate limit reached');
                    break;
                }
                throw new Error('Failed to fetch data from GitHub');
            }
            
            const data = await response.json();
            
            // Fetch additional details for each developer
            const developerDetails = await Promise.all(
                data.items.map(async (dev) => {
                    try {
                        const userResponse = await fetch(dev.url);
                        if (userResponse.ok) {
                            return await userResponse.json();
                        }
                    } catch (error) {
                        console.error(`Error fetching details for ${dev.login}:`, error);
                    }
                    return null;
                })
            );
            
            const validDevelopers = developerDetails.filter(dev => dev && dev.location);
            
            // Cache the results
            developerCache.set(searchTerm, validDevelopers);
            
            // Add to map
            await addDevelopersToMap(validDevelopers, false);
            developers.push(...validDevelopers);
            
            // Add delay to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error(`Error searching location "${searchTerm}":`, error);
        } finally {
            currentSearches.delete(searchTerm);
        }
    }
    
    return developers;
}

// Initial load of popular developers worldwide
async function fetchInitialDevelopers() {
    showLoading(true);
    
    try {
        // Search for users with high follower count
        const response = await fetch(
            `${GITHUB_API_BASE}/search/users?q=followers:>5000&sort=followers&order=desc&per_page=50`
        );
        
        if (!response.ok) {
            throw new Error('Failed to fetch data from GitHub');
        }
        
        const data = await response.json();
        const developers = data.items;
        
        // Fetch additional details for each developer
        const developerDetails = await Promise.all(
            developers.slice(0, 30).map(async (dev) => {
                try {
                    const userResponse = await fetch(dev.url);
                    if (userResponse.ok) {
                        return await userResponse.json();
                    }
                } catch (error) {
                    console.error(`Error fetching details for ${dev.login}:`, error);
                }
                return null;
            })
        );
        
        // Filter out null results and developers without location
        const validDevelopers = developerDetails.filter(dev => dev && dev.location);
        
        // Update the count
        document.getElementById('developerCount').textContent = 
            `${validDevelopers.length} top developers worldwide`;
        
        // Add markers to map
        await addDevelopersToMap(validDevelopers, true);
        
    } catch (error) {
        console.error('Error fetching developers:', error);
        alert('Failed to fetch GitHub developers. Please try again later.');
    } finally {
        showLoading(false);
    }
}

// Geocode location string to coordinates
async function geocodeLocation(location) {
    // Check cache first
    if (locationCache.has(location)) {
        return locationCache.get(location);
    }
    
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`
        );
        const data = await response.json();
        
        if (data && data.length > 0) {
            const coords = {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon)
            };
            locationCache.set(location, coords);
            return coords;
        }
    } catch (error) {
        console.error('Geocoding error:', error);
    }
    return null;
}

// Add developers to the map
async function addDevelopersToMap(developers, clearExisting = false) {
    if (clearExisting) {
        // Clear existing markers
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];
    }
    
    // Group developers by location to avoid too many geocoding requests
    const locationGroups = {};
    developers.forEach(dev => {
        if (!locationGroups[dev.location]) {
            locationGroups[dev.location] = [];
        }
        locationGroups[dev.location].push(dev);
    });
    
    // Process each location group
    for (const [location, devs] of Object.entries(locationGroups)) {
        const coords = await geocodeLocation(location);
        
        if (coords) {
            // If multiple developers in same location, offset them slightly
            devs.forEach((dev, index) => {
                // Check if we already have this developer on the map
                if (markers.some(m => m.options.developerId === dev.login)) {
                    return;
                }
                
                const offset = index * 0.0001;
                const marker = L.marker([coords.lat + offset, coords.lng + offset], {
                    developerId: dev.login
                }).bindPopup(createPopupContent(dev)).addTo(map);
                
                markers.push(marker);
            });
        }
        
        // Add delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
    }
}

// Create popup content for developer
function createPopupContent(developer) {
    return `
        <div class="developer-popup">
            <img src="${developer.avatar_url}" alt="${developer.login}" class="avatar">
            <h3>${developer.name || developer.login}</h3>
            <div class="info">
                <span>📍 ${developer.location}</span>
                <span>👥 ${developer.followers.toLocaleString()} followers</span>
                <span>📦 ${developer.public_repos} public repos</span>
                ${developer.company ? `<span>🏢 ${developer.company}</span>` : ''}
                ${developer.bio ? `<span>📝 ${developer.bio}</span>` : ''}
            </div>
            <a href="${developer.html_url}" target="_blank" class="github-link">View on GitHub →</a>
        </div>
    `;
}

// Show/hide loading indicator
function showLoading(show) {
    const loadingEl = document.getElementById('loading');
    if (show) {
        loadingEl.classList.remove('hidden');
    } else {
        loadingEl.classList.add('hidden');
    }
}

// Clear all markers and cache
function clearAll() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    developerCache.clear();
    document.getElementById('developerCount').textContent = '0 developers displayed';
}

// Initialize everything when page loads
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    fetchInitialDevelopers();
    
    // Add refresh button handler
    document.getElementById('refreshBtn').addEventListener('click', () => {
        clearAll();
        fetchInitialDevelopers();
    });
    
    // Add instructions
    const info = document.createElement('div');
    info.className = 'map-info';
    info.innerHTML = `
        <p>💡 Zoom in to load developers in specific regions</p>
        <p>🔍 Pan around to discover developers worldwide</p>
    `;
    document.querySelector('.header').appendChild(info);
});