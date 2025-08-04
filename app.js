// Initialize map and data structures
let map;
let markers = [];
let markerLayers = {};
let loadedBatches = new Set();
let allDevelopers = new Map(); // Use login as key to avoid duplicates
let locationCache = new Map();
let index = null;

// Progressive loading configuration
const LOADING_CONFIG = {
    initialBatches: 2,              // Number of batches to load initially
    batchesPerZoomLevel: 1,         // Additional batches per zoom level
    maxBatches: 10,                 // Maximum batches to load
    developersPerView: 100,         // Max developers to show in current view
    minZoomForMore: 5,              // Minimum zoom to load more data
    loadRadius: 1000,               // km radius to consider for loading more
    geocodingDelay: 100,            // Delay between geocoding requests
    markerUpdateDelay: 50           // Delay between marker updates
};

// Major cities for location-based filtering
const MAJOR_LOCATIONS = [
    { name: 'San Francisco', lat: 37.7749, lng: -122.4194, aliases: ['sf', 'san francisco', 'bay area'] },
    { name: 'New York', lat: 40.7128, lng: -74.0060, aliases: ['nyc', 'new york', 'manhattan', 'brooklyn'] },
    { name: 'London', lat: 51.5074, lng: -0.1278, aliases: ['london', 'uk', 'united kingdom'] },
    { name: 'Berlin', lat: 52.5200, lng: 13.4050, aliases: ['berlin', 'germany'] },
    { name: 'Tokyo', lat: 35.6762, lng: 139.6503, aliases: ['tokyo', 'japan'] },
    { name: 'Seattle', lat: 47.6062, lng: -122.3321, aliases: ['seattle', 'washington'] },
    { name: 'Austin', lat: 30.2672, lng: -97.7431, aliases: ['austin', 'texas'] },
    { name: 'Boston', lat: 42.3601, lng: -71.0589, aliases: ['boston', 'massachusetts'] },
    { name: 'Toronto', lat: 43.6532, lng: -79.3832, aliases: ['toronto', 'canada'] },
    { name: 'Amsterdam', lat: 52.3676, lng: 4.9041, aliases: ['amsterdam', 'netherlands'] },
    { name: 'Paris', lat: 48.8566, lng: 2.3522, aliases: ['paris', 'france'] },
    { name: 'Singapore', lat: 1.3521, lng: 103.8198, aliases: ['singapore'] },
    { name: 'Sydney', lat: -33.8688, lng: 151.2093, aliases: ['sydney', 'australia'] },
    { name: 'Mumbai', lat: 19.0760, lng: 72.8777, aliases: ['mumbai', 'bombay', 'india'] },
    { name: 'Bangalore', lat: 12.9716, lng: 77.5946, aliases: ['bangalore', 'bengaluru', 'india'] }
];

// Initialize the map
function initMap() {
    try {
        map = L.map('map').setView([20, 0], 2);
        
        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(map);
        
        // Create layer groups for different types of markers
        markerLayers.all = L.layerGroup().addTo(map);
        markerLayers.filtered = L.layerGroup();
        
        // Add map event listeners
        map.on('moveend', debounce(onMapChange, 500));
        map.on('zoomend', debounce(onMapChange, 500));
        
        console.log('✅ Map initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize map:', error);
        showError('Failed to initialize map. Please refresh the page.');
    }
}

// Debounce function
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

// Load index file
async function loadIndex() {
    try {
        console.log('📖 Loading data index...');
        const response = await fetch('./data/index.json');
        if (!response.ok) {
            throw new Error(`Failed to load index: ${response.status}`);
        }
        index = await response.json();
        console.log(`📊 Index loaded: ${index.total_developers} developers across ${index.total_batches} batches`);
        return index;
    } catch (error) {
        console.error('❌ Failed to load index:', error);
        // Fallback to single file
        return null;
    }
}

// Load a specific batch of developers
async function loadBatch(batchNumber) {
    if (loadedBatches.has(batchNumber)) {
        console.log(`⏭️  Batch ${batchNumber} already loaded`);
        return [];
    }
    
    try {
        console.log(`📥 Loading batch ${batchNumber}...`);
        showLoading(true, `Loading developer batch ${batchNumber}...`);
        
        const response = await fetch(`./data/developers-batch-${batchNumber}.json`);
        if (!response.ok) {
            if (response.status === 404) {
                console.log(`📁 Batch ${batchNumber} not found, trying fallback...`);
                // Try fallback to single file
                const fallbackResponse = await fetch('./developers-data.json');
                if (fallbackResponse.ok) {
                    const fallbackData = await fallbackResponse.json();
                    return fallbackData.developers || [];
                }
            }
            throw new Error(`Failed to load batch ${batchNumber}: ${response.status}`);
        }
        
        const batchData = await response.json();
        const newDevelopers = batchData.developers || [];
        
        // Add to global developers map
        newDevelopers.forEach(dev => {
            if (!allDevelopers.has(dev.login)) {
                allDevelopers.set(dev.login, dev);
            }
        });
        
        loadedBatches.add(batchNumber);
        console.log(`✅ Loaded batch ${batchNumber}: ${newDevelopers.length} developers`);
        
        updateDeveloperCount();
        return newDevelopers;
        
    } catch (error) {
        console.error(`❌ Failed to load batch ${batchNumber}:`, error);
        showError(`Failed to load developer data batch ${batchNumber}`);
        return [];
    } finally {
        showLoading(false);
    }
}

// Load initial batches
async function loadInitialData() {
    console.log('🚀 Starting initial data load...');
    showLoading(true, 'Loading developer data...');
    
    try {
        // Load index first
        await loadIndex();
        
        if (!index) {
            console.log('📄 No index found, loading single file...');
            // Fallback to single developers-data.json file
            try {
                const response = await fetch('./developers-data.json');
                if (response.ok) {
                    const data = await response.json();
                    const developers = data.developers || [];
                    developers.forEach(dev => {
                        allDevelopers.set(dev.login, dev);
                    });
                    loadedBatches.add(0);
                    console.log(`✅ Loaded ${developers.length} developers from single file`);
                }
            } catch (e) {
                console.error('❌ Failed to load fallback data:', e);
                showError('No developer data available. Please check if data files exist.');
                return;
            }
        } else {
            // Load initial batches
            const batchesToLoad = Math.min(LOADING_CONFIG.initialBatches, index.total_batches);
            console.log(`📚 Loading ${batchesToLoad} initial batches...`);
            
            for (let i = 0; i < batchesToLoad; i++) {
                await loadBatch(i);
                await delay(100); // Small delay to prevent overwhelming
            }
        }
        
        // Initialize map with loaded data
        await updateMapMarkers();
        
        console.log(`🎉 Initial load complete: ${allDevelopers.size} developers loaded`);
        
    } catch (error) {
        console.error('❌ Initial data load failed:', error);
        showError('Failed to load initial data. Please refresh the page.');
    } finally {
        showLoading(false);
    }
}

// Handle map changes (zoom/pan)
async function onMapChange() {
    const zoom = map.getZoom();
    const bounds = map.getBounds();
    const center = map.getCenter();
    
    console.log(`🗺️  Map changed: zoom=${zoom}, center=[${center.lat.toFixed(3)}, ${center.lng.toFixed(3)}]`);
    
    // Determine if we need to load more data
    const shouldLoadMore = zoom >= LOADING_CONFIG.minZoomForMore && 
                          loadedBatches.size < LOADING_CONFIG.maxBatches;
    
    if (shouldLoadMore && index) {
        const additionalBatches = Math.floor((zoom - LOADING_CONFIG.minZoomForMore) * LOADING_CONFIG.batchesPerZoomLevel) + 1;
        const targetBatches = Math.min(
            LOADING_CONFIG.initialBatches + additionalBatches,
            index.total_batches,
            LOADING_CONFIG.maxBatches
        );
        
        // Load additional batches if needed
        for (let i = loadedBatches.size; i < targetBatches; i++) {
            if (!loadedBatches.has(i)) {
                console.log(`📈 Loading additional batch ${i} for zoom level ${zoom}`);
                await loadBatch(i);
                await delay(200);
            }
        }
    }
    
    // Update visible markers based on current view
    await updateMapMarkers();
}

// Get developers in current map bounds
function getDevelopersInBounds(bounds) {
    const developersInBounds = [];
    const expandedBounds = bounds.pad(0.1); // Add 10% padding
    
    for (const developer of allDevelopers.values()) {
        if (developer.coordinates) {
            const latLng = L.latLng(developer.coordinates.lat, developer.coordinates.lng);
            if (expandedBounds.contains(latLng)) {
                developersInBounds.push(developer);
            }
        }
    }
    
    // Sort by followers and limit
    return developersInBounds
        .sort((a, b) => b.followers - a.followers)
        .slice(0, LOADING_CONFIG.developersPerView);
}

// Geocode location string to coordinates
async function geocodeLocation(location) {
    if (locationCache.has(location)) {
        return locationCache.get(location);
    }
    
    try {
        // First try to match with major cities
        const normalizedLocation = location.toLowerCase();
        for (const city of MAJOR_LOCATIONS) {
            if (city.aliases.some(alias => normalizedLocation.includes(alias))) {
                const coords = { lat: city.lat, lng: city.lng };
                locationCache.set(location, coords);
                return coords;
            }
        }
        
        // If not found in major cities, use Nominatim
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`
        );
        
        if (!response.ok) {
            throw new Error(`Geocoding API error: ${response.status}`);
        }
        
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
        console.error(`❌ Geocoding error for "${location}":`, error);
    }
    
    locationCache.set(location, null);
    return null;
}

// Update map markers
async function updateMapMarkers() {
    const bounds = map.getBounds();
    const developersToShow = getDevelopersInBounds(bounds);
    
    console.log(`🎯 Updating markers: ${developersToShow.length} developers in view`);
    showLoading(true, `Updating ${developersToShow.length} markers...`);
    
    try {
        // Clear existing markers
        markerLayers.all.clearLayers();
        markers = [];
        
        // Group developers by location to avoid overlapping
        const locationGroups = {};
        const geocodingPromises = [];
        
        for (const dev of developersToShow) {
            if (!dev.coordinates && dev.location) {
                // Queue geocoding if not already done
                if (!locationCache.has(dev.location)) {
                    geocodingPromises.push(
                        geocodeLocation(dev.location).then(coords => {
                            if (coords) {
                                dev.coordinates = coords;
                            }
                        })
                    );
                } else {
                    const cached = locationCache.get(dev.location);
                    if (cached) {
                        dev.coordinates = cached;
                    }
                }
            }
        }
        
        // Wait for geocoding with batching
        if (geocodingPromises.length > 0) {
            console.log(`🌍 Geocoding ${geocodingPromises.length} locations...`);
            
            // Process in batches of 5 to respect rate limits
            const batchSize = 5;
            for (let i = 0; i < geocodingPromises.length; i += batchSize) {
                const batch = geocodingPromises.slice(i, i + batchSize);
                await Promise.all(batch);
                if (i + batchSize < geocodingPromises.length) {
                    await delay(LOADING_CONFIG.geocodingDelay);
                }
            }
        }
        
        // Group by location
        for (const dev of developersToShow) {
            if (dev.coordinates) {
                const locationKey = `${dev.coordinates.lat.toFixed(3)},${dev.coordinates.lng.toFixed(3)}`;
                if (!locationGroups[locationKey]) {
                    locationGroups[locationKey] = [];
                }
                locationGroups[locationKey].push(dev);
            }
        }
        
        // Create markers
        let markerCount = 0;
        for (const [locationKey, devs] of Object.entries(locationGroups)) {
            const [lat, lng] = locationKey.split(',').map(parseFloat);
            
            devs.forEach((dev, index) => {
                const offset = index * 0.001; // Small offset for overlapping markers
                const marker = L.marker([lat + offset, lng + offset])
                    .bindPopup(createPopupContent(dev));
                
                markerLayers.all.addLayer(marker);
                markers.push(marker);
                markerCount++;
            });
            
            // Small delay between location groups
            if (markerCount % 10 === 0) {
                await delay(LOADING_CONFIG.markerUpdateDelay);
            }
        }
        
        updateDeveloperCount();
        console.log(`✅ Created ${markerCount} markers`);
        
    } catch (error) {
        console.error('❌ Error updating markers:', error);
        showError('Failed to update map markers');
    } finally {
        showLoading(false);
    }
}

// Create popup content for developer
function createPopupContent(developer) {
    const company = developer.company ? `<span>🏢 ${developer.company}</span>` : '';
    const bio = developer.bio ? `<span>📝 ${developer.bio.substring(0, 100)}${developer.bio.length > 100 ? '...' : ''}</span>` : '';
    const repos = developer.public_repos > 0 ? `<span>📦 ${developer.public_repos} public repos</span>` : '';
    
    return `
        <div class="developer-popup">
            <div class="popup-header">
                <img src="${developer.avatar_url}" alt="${developer.login}" class="avatar">
                <div class="popup-info">
                    <h3>${developer.name || developer.login}</h3>
                    <div class="stats">
                        <span class="followers">👥 ${developer.followers.toLocaleString()}</span>
                        <span class="location">📍 ${developer.location}</span>
                    </div>
                </div>
            </div>
            <div class="popup-details">
                ${company}
                ${repos}
                ${bio}
            </div>
            <div class="popup-actions">
                <a href="${developer.html_url}" target="_blank" class="github-link">View on GitHub →</a>
            </div>
        </div>
    `;
}

// Update developer count display
function updateDeveloperCount() {
    const totalLoaded = allDevelopers.size;
    const batchesLoaded = loadedBatches.size;
    const markersShown = markers.length;
    
    const countElement = document.getElementById('developerCount');
    if (countElement) {
        countElement.innerHTML = `
            <div class="count-primary">${markersShown.toLocaleString()} developers shown</div>
            <div class="count-secondary">${totalLoaded.toLocaleString()} loaded • ${batchesLoaded} batches</div>
        `;
    }
}

// Show/hide loading indicator
function showLoading(show, message = 'Loading...') {
    const loadingEl = document.getElementById('loading');
    const messageEl = loadingEl.querySelector('p');
    
    if (show) {
        if (messageEl) messageEl.textContent = message;
        loadingEl.classList.remove('hidden');
    } else {
        loadingEl.classList.add('hidden');
    }
}

// Show error message
function showError(message) {
    const errorEl = document.createElement('div');
    errorEl.className = 'error-message';
    errorEl.innerHTML = `
        <div class="error-content">
            <span class="error-icon">⚠️</span>
            <span class="error-text">${message}</span>
            <button class="error-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
    `;
    document.body.appendChild(errorEl);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (errorEl.parentElement) {
            errorEl.remove();
        }
    }, 5000);
}

// Clear all data and reload
function clearAll() {
    console.log('🗑️  Clearing all data...');
    
    markerLayers.all.clearLayers();
    markers = [];
    allDevelopers.clear();
    loadedBatches.clear();
    
    updateDeveloperCount();
    console.log('✅ All data cleared');
}

// Refresh and reload data
async function refreshData() {
    console.log('🔄 Refreshing data...');
    clearAll();
    await loadInitialData();
}

// Delay utility
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Initialize everything when page loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🌍 GitHub Developers World Map - Progressive Loading Edition');
    
    try {
        // Initialize map
        initMap();
        
        // Load initial data
        await loadInitialData();
        
        // Add refresh button handler
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', refreshData);
        }
        
        // Add instructions
        const info = document.createElement('div');
        info.className = 'map-info';
        info.innerHTML = `
            <div class="info-item">💡 Zoom in to load more developers in specific regions</div>
            <div class="info-item">🔍 Pan around to discover developers worldwide</div>
            <div class="info-item">📊 Data loads progressively as you explore</div>
        `;
        
        const header = document.querySelector('.header');
        if (header) {
            header.appendChild(info);
        }
        
        console.log('🎉 Application initialized successfully');
        
    } catch (error) {
        console.error('❌ Failed to initialize application:', error);
        showError('Failed to initialize the application. Please refresh the page.');
    }
});