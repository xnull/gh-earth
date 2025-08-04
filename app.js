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
                    console.log('📋 Sample developers:', developers.slice(0, 3).map(d => `${d.login} (${d.location})`));
                    
                    // Force initial geocoding for fallback data
                    console.log('🌍 Starting initial geocoding for fallback data...');
                    let geocoded = 0;
                    for (const dev of developers.slice(0, 20)) { // Geocode first 20 for faster testing
                        if (dev.location && !dev.coordinates) {
                            console.log(`🔍 Geocoding ${dev.login}: ${dev.location}`);
                            const coords = await geocodeLocation(dev.location);
                            if (coords) {
                                dev.coordinates = coords;
                                geocoded++;
                                console.log(`✅ ${dev.login} geocoded to [${coords.lat}, ${coords.lng}]`);
                            } else {
                                console.log(`❌ Failed to geocode ${dev.login}: ${dev.location}`);
                            }
                            if (geocoded % 3 === 0) {
                                await delay(100); // Small delay every 3 geocoding requests
                            }
                        }
                    }
                    console.log(`✅ Geocoded ${geocoded}/${developers.slice(0, 20).length} locations`);
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
    const expandedBounds = bounds.pad(0.2); // Add 20% padding
    
    // If we have very few developers loaded (< 100), show all of them regardless of bounds
    // This helps with the initial load when using fallback data
    const totalDevelopers = allDevelopers.size;
    const showAll = totalDevelopers < 100;
    
    for (const developer of allDevelopers.values()) {
        if (developer.coordinates) {
            const latLng = L.latLng(developer.coordinates.lat, developer.coordinates.lng);
            if (showAll || expandedBounds.contains(latLng)) {
                developersInBounds.push(developer);
            }
        } else if (developer.location) {
            // Include developers without coordinates but with location for geocoding
            developersInBounds.push(developer);
        }
    }
    
    // Sort by followers and limit
    return developersInBounds
        .sort((a, b) => b.followers - a.followers)
        .slice(0, showAll ? Math.min(totalDevelopers, 200) : LOADING_CONFIG.developersPerView);
}

// Geocode location string to coordinates
async function geocodeLocation(location) {
    if (locationCache.has(location)) {
        return locationCache.get(location);
    }
    
    try {
        // First try to match with major cities (more aggressive matching)
        const normalizedLocation = location.toLowerCase().trim();
        
        // Direct city name matches
        for (const city of MAJOR_LOCATIONS) {
            for (const alias of city.aliases) {
                if (normalizedLocation.includes(alias.toLowerCase()) || 
                    alias.toLowerCase().includes(normalizedLocation)) {
                    console.log(`🎯 Matched "${location}" to ${city.name}`);
                    const coords = { lat: city.lat, lng: city.lng };
                    locationCache.set(location, coords);
                    return coords;
                }
            }
        }
        
        // Try to extract city names from complex locations FIRST (before countries/states)
        const cityPatterns = {
            // Major cities that might be in complex addresses
            'san francisco': { lat: 37.7749, lng: -122.4194 },
            'new york': { lat: 40.7128, lng: -74.0060 },
            'london': { lat: 51.5074, lng: -0.1278 },
            'berlin': { lat: 52.5200, lng: 13.4050 },
            'tokyo': { lat: 35.6762, lng: 139.6503 },
            'paris': { lat: 48.8566, lng: 2.3522 },
            'seattle': { lat: 47.6062, lng: -122.3321 },
            'boston': { lat: 42.3601, lng: -71.0589 },
            'chicago': { lat: 41.8781, lng: -87.6298 },
            'austin': { lat: 30.2672, lng: -97.7431 },
            'toronto': { lat: 43.6532, lng: -79.3832 },
            'vancouver': { lat: 49.2827, lng: -123.1207 },
            'sydney': { lat: -33.8688, lng: 151.2093 },
            'melbourne': { lat: -37.8136, lng: 144.9631 },
            'amsterdam': { lat: 52.3676, lng: 4.9041 },
            'stockholm': { lat: 59.3293, lng: 18.0686 },
            'copenhagen': { lat: 55.6761, lng: 12.5683 },
            'helsinki': { lat: 60.1699, lng: 24.9384 },
            'oslo': { lat: 59.9139, lng: 10.7522 },
            'zurich': { lat: 47.3769, lng: 8.5417 },
            'vienna': { lat: 48.2082, lng: 16.3738 },
            'madrid': { lat: 40.4168, lng: -3.7038 },
            'barcelona': { lat: 41.3851, lng: 2.1734 },
            'rome': { lat: 41.9028, lng: 12.4964 },
            'milan': { lat: 45.4642, lng: 9.1900 },
            'munich': { lat: 48.1351, lng: 11.5820 },
            'hamburg': { lat: 53.5511, lng: 9.9937 },
            'cologne': { lat: 50.9375, lng: 6.9603 },
            'frankfurt': { lat: 50.1109, lng: 8.6821 },
            'moscow': { lat: 55.7558, lng: 37.6173 },
            'st petersburg': { lat: 59.9311, lng: 30.3609 },
            'warsaw': { lat: 52.2297, lng: 21.0122 },
            'prague': { lat: 50.0755, lng: 14.4378 },
            'budapest': { lat: 47.4979, lng: 19.0402 },
            'bucharest': { lat: 44.4268, lng: 26.1025 },
            'sofia': { lat: 42.6977, lng: 23.3219 },
            'athens': { lat: 37.9838, lng: 23.7275 },
            'istanbul': { lat: 41.0082, lng: 28.9784 },
            'ankara': { lat: 39.9334, lng: 32.8597 },
            'tel aviv': { lat: 32.0853, lng: 34.7818 },
            'jerusalem': { lat: 31.7683, lng: 35.2137 },
            'dubai': { lat: 25.2048, lng: 55.2708 },
            'mumbai': { lat: 19.0760, lng: 72.8777 },
            'delhi': { lat: 28.7041, lng: 77.1025 },
            'bangalore': { lat: 12.9716, lng: 77.5946 },
            'bengaluru': { lat: 12.9716, lng: 77.5946 },
            'hyderabad': { lat: 17.3850, lng: 78.4867 },
            'chennai': { lat: 13.0827, lng: 80.2707 },
            'pune': { lat: 18.5204, lng: 73.8567 },
            'beijing': { lat: 39.9042, lng: 116.4074 },
            'shanghai': { lat: 31.2304, lng: 121.4737 },
            'shenzhen': { lat: 22.5431, lng: 114.0579 },
            'guangzhou': { lat: 23.1291, lng: 113.2644 },
            'hangzhou': { lat: 30.2741, lng: 120.1551 },
            'seoul': { lat: 37.5665, lng: 126.9780 },
            'busan': { lat: 35.1796, lng: 129.0756 },
            'singapore': { lat: 1.3521, lng: 103.8198 },
            'bangkok': { lat: 13.7563, lng: 100.5018 },
            'jakarta': { lat: -6.2088, lng: 106.8456 },
            'manila': { lat: 14.5995, lng: 120.9842 },
            'kuala lumpur': { lat: 3.1390, lng: 101.6869 },
            'ho chi minh': { lat: 10.8231, lng: 106.6297 },
            'hanoi': { lat: 21.0285, lng: 105.8542 },
            'taipei': { lat: 25.0330, lng: 121.5654 },
            'hong kong': { lat: 22.3193, lng: 114.1694 },
            'macau': { lat: 22.1987, lng: 113.5439 }
        };
        
        for (const [cityName, coords] of Object.entries(cityPatterns)) {
            if (normalizedLocation.includes(cityName)) {
                console.log(`🎯 Found city "${cityName}" in "${location}"`);
                locationCache.set(location, coords);
                return coords;
            }
        }
        
        // Extended location mappings for countries/states (after cities)
        const locationMappings = {
            // Countries/Regions
            'usa': { lat: 40.7128, lng: -74.0060 }, // USA -> New York
            'us': { lat: 40.7128, lng: -74.0060 },  // US -> New York
            'united states': { lat: 40.7128, lng: -74.0060 },
            'uk': { lat: 51.5074, lng: -0.1278 },   // UK -> London
            'united kingdom': { lat: 51.5074, lng: -0.1278 },
            'england': { lat: 51.5074, lng: -0.1278 },
            'canada': { lat: 43.6532, lng: -79.3832 }, // Canada -> Toronto
            'brasil': { lat: -23.5505, lng: -46.6333 }, // Brasil -> São Paulo
            'brazil': { lat: -23.5505, lng: -46.6333 }, // Brazil -> São Paulo
            'china': { lat: 39.9042, lng: 116.4074 }, // China -> Beijing
            'india': { lat: 12.9716, lng: 77.5946 }, // India -> Bangalore
            'japan': { lat: 35.6762, lng: 139.6503 }, // Japan -> Tokyo
            'germany': { lat: 52.5200, lng: 13.4050 }, // Germany -> Berlin
            'france': { lat: 48.8566, lng: 2.3522 }, // France -> Paris
            'australia': { lat: -33.8688, lng: 151.2093 }, // Australia -> Sydney
            'netherlands': { lat: 52.3676, lng: 4.9041 }, // Netherlands -> Amsterdam
            'switzerland': { lat: 47.3769, lng: 8.5417 }, // Switzerland -> Zurich
            'sweden': { lat: 59.3293, lng: 18.0686 }, // Sweden -> Stockholm
            'norway': { lat: 59.9139, lng: 10.7522 }, // Norway -> Oslo
            'italy': { lat: 41.9028, lng: 12.4964 }, // Italy -> Rome
            'spain': { lat: 40.4168, lng: -3.7038 }, // Spain -> Madrid
            'russia': { lat: 55.7558, lng: 37.6173 }, // Russia -> Moscow
            'poland': { lat: 52.2297, lng: 21.0122 }, // Poland -> Warsaw
            'south korea': { lat: 37.5665, lng: 126.9780 }, // South Korea -> Seoul
            'korea': { lat: 37.5665, lng: 126.9780 }, // Korea -> Seoul
            'israel': { lat: 32.0853, lng: 34.7818 }, // Israel -> Tel Aviv
            'turkey': { lat: 41.0082, lng: 28.9784 }, // Turkey -> Istanbul
            'mexico': { lat: 19.4326, lng: -99.1332 }, // Mexico -> Mexico City
            'argentina': { lat: -34.6037, lng: -58.3816 }, // Argentina -> Buenos Aires
            'chile': { lat: -33.4489, lng: -70.6693 }, // Chile -> Santiago
            'colombia': { lat: 4.7110, lng: -74.0721 }, // Colombia -> Bogotá
            'finland': { lat: 60.1699, lng: 24.9384 }, // Finland -> Helsinki
            'denmark': { lat: 55.6761, lng: 12.5683 }, // Denmark -> Copenhagen
            'austria': { lat: 48.2082, lng: 16.3738 }, // Austria -> Vienna
            'belgium': { lat: 50.8503, lng: 4.3517 }, // Belgium -> Brussels
            'czechia': { lat: 50.0755, lng: 14.4378 }, // Czechia -> Prague
            'czech republic': { lat: 50.0755, lng: 14.4378 },
            'hungary': { lat: 47.4979, lng: 19.0402 }, // Hungary -> Budapest
            'ukraine': { lat: 50.4501, lng: 30.5234 }, // Ukraine -> Kyiv
            'romania': { lat: 44.4268, lng: 26.1025 }, // Romania -> Bucharest
            'bulgaria': { lat: 42.6977, lng: 23.3219 }, // Bulgaria -> Sofia
            'croatia': { lat: 45.8150, lng: 15.9819 }, // Croatia -> Zagreb
            'serbia': { lat: 44.7866, lng: 20.4489 }, // Serbia -> Belgrade
            'greece': { lat: 37.9838, lng: 23.7275 }, // Greece -> Athens
            'portugal': { lat: 38.7223, lng: -9.1393 }, // Portugal -> Lisbon
            'ireland': { lat: 53.3498, lng: -6.2603 }, // Ireland -> Dublin
            'estonia': { lat: 59.4370, lng: 24.7536 }, // Estonia -> Tallinn
            'latvia': { lat: 56.9496, lng: 24.1052 }, // Latvia -> Riga
            'lithuania': { lat: 54.6872, lng: 25.2797 }, // Lithuania -> Vilnius
            'slovenia': { lat: 46.0569, lng: 14.5058 }, // Slovenia -> Ljubljana
            'slovakia': { lat: 48.1486, lng: 17.1077 }, // Slovakia -> Bratislava
            'belarus': { lat: 53.9006, lng: 27.5590 }, // Belarus -> Minsk
            'iceland': { lat: 64.1466, lng: -21.9426 }, // Iceland -> Reykjavik
            
            // US States
            'california': { lat: 37.7749, lng: -122.4194 }, // California -> San Francisco
            'ca': { lat: 37.7749, lng: -122.4194 },
            'texas': { lat: 30.2672, lng: -97.7431 }, // Texas -> Austin
            'tx': { lat: 30.2672, lng: -97.7431 },
            'new york': { lat: 40.7128, lng: -74.0060 }, // New York -> NYC
            'ny': { lat: 40.7128, lng: -74.0060 },
            'florida': { lat: 25.7617, lng: -80.1918 }, // Florida -> Miami
            'fl': { lat: 25.7617, lng: -80.1918 },
            'washington': { lat: 47.6062, lng: -122.3321 }, // Washington -> Seattle
            'wa': { lat: 47.6062, lng: -122.3321 },
            'massachusetts': { lat: 42.3601, lng: -71.0589 }, // Massachusetts -> Boston
            'ma': { lat: 42.3601, lng: -71.0589 },
            'illinois': { lat: 41.8781, lng: -87.6298 }, // Illinois -> Chicago
            'il': { lat: 41.8781, lng: -87.6298 },
            'ohio': { lat: 39.9612, lng: -82.9988 }, // Ohio -> Columbus
            'oh': { lat: 39.9612, lng: -82.9988 },
            'georgia': { lat: 33.7490, lng: -84.3880 }, // Georgia -> Atlanta
            'ga': { lat: 33.7490, lng: -84.3880 },
            'virginia': { lat: 38.9072, lng: -77.0369 }, // Virginia -> Washington DC area
            'va': { lat: 38.9072, lng: -77.0369 },
            'north carolina': { lat: 35.7796, lng: -78.6382 }, // North Carolina -> Raleigh
            'nc': { lat: 35.7796, lng: -78.6382 },
            'colorado': { lat: 39.7392, lng: -104.9903 }, // Colorado -> Denver
            'co': { lat: 39.7392, lng: -104.9903 },
            'oregon': { lat: 45.5152, lng: -122.6784 }, // Oregon -> Portland
            'or': { lat: 45.5152, lng: -122.6784 },
            'utah': { lat: 40.7608, lng: -111.8910 }, // Utah -> Salt Lake City
            'ut': { lat: 40.7608, lng: -111.8910 },
            'arizona': { lat: 33.4484, lng: -112.0740 }, // Arizona -> Phoenix
            'az': { lat: 33.4484, lng: -112.0740 },
            'pennsylvania': { lat: 39.9526, lng: -75.1652 }, // Pennsylvania -> Philadelphia
            'pa': { lat: 39.9526, lng: -75.1652 },
            'michigan': { lat: 42.3314, lng: -83.0458 }, // Michigan -> Detroit
            'mi': { lat: 42.3314, lng: -83.0458 },
            'minnesota': { lat: 44.9778, lng: -93.2650 }, // Minnesota -> Minneapolis
            'mn': { lat: 44.9778, lng: -93.2650 },
            'wisconsin': { lat: 43.0389, lng: -87.9065 }, // Wisconsin -> Milwaukee
            'wi': { lat: 43.0389, lng: -87.9065 },
            'tennessee': { lat: 36.1627, lng: -86.7816 }, // Tennessee -> Nashville
            'tn': { lat: 36.1627, lng: -86.7816 },
            'missouri': { lat: 39.0458, lng: -76.6413 }, // Missouri -> St. Louis
            'mo': { lat: 39.0458, lng: -76.6413 },
            'maryland': { lat: 39.0458, lng: -76.6413 }, // Maryland -> Baltimore
            'md': { lat: 39.0458, lng: -76.6413 },
            'connecticut': { lat: 41.7658, lng: -72.6734 }, // Connecticut -> Hartford
            'ct': { lat: 41.7658, lng: -72.6734 },
            'new jersey': { lat: 40.0583, lng: -74.4057 }, // New Jersey -> Newark
            'nj': { lat: 40.0583, lng: -74.4057 },
            'indiana': { lat: 39.7684, lng: -86.1581 }, // Indiana -> Indianapolis
            'in': { lat: 39.7684, lng: -86.1581 },
            
            // Canadian Provinces
            'ontario': { lat: 43.6532, lng: -79.3832 }, // Ontario -> Toronto
            'on': { lat: 43.6532, lng: -79.3832 },
            'quebec': { lat: 45.5017, lng: -73.5673 }, // Quebec -> Montreal
            'qc': { lat: 45.5017, lng: -73.5673 },
            'british columbia': { lat: 49.2827, lng: -123.1207 }, // BC -> Vancouver
            'bc': { lat: 49.2827, lng: -123.1207 },
            'alberta': { lat: 51.0447, lng: -114.0719 }, // Alberta -> Calgary
            'ab': { lat: 51.0447, lng: -114.0719 },
            
            // Generic/Virtual locations
            'remote': { lat: 37.7749, lng: -122.4194 }, // Remote -> San Francisco
            'worldwide': { lat: 37.7749, lng: -122.4194 },
            'everywhere': { lat: 37.7749, lng: -122.4194 },
            'virtual': { lat: 37.7749, lng: -122.4194 },
            'online': { lat: 37.7749, lng: -122.4194 },
            'internet': { lat: 37.7749, lng: -122.4194 },
            'earth': { lat: 37.7749, lng: -122.4194 },
            'global': { lat: 37.7749, lng: -122.4194 },
            '127.0.0.1': { lat: 37.7749, lng: -122.4194 }, // Localhost joke -> SF
            'localhost': { lat: 37.7749, lng: -122.4194 },
            'undefined': { lat: 37.7749, lng: -122.4194 },
            'null': { lat: 37.7749, lng: -122.4194 },
            '~': { lat: 37.7749, lng: -122.4194 }, // Home directory joke -> SF
            'your heart': { lat: 37.7749, lng: -122.4194 }, // Funny location -> SF
            'ghent': { lat: 51.0543, lng: 3.7174 }, // Ghent, Belgium
            'são paulo': { lat: -23.5505, lng: -46.6333 }, // São Paulo, Brazil
            'sao paulo': { lat: -23.5505, lng: -46.6333 } // São Paulo, Brazil (no accent)
        };
        
        for (const [pattern, coords] of Object.entries(locationMappings)) {
            if (normalizedLocation.includes(pattern)) {
                console.log(`🌍 Mapped "${location}" to default location`);
                locationCache.set(location, coords);
                return coords;
            }
        }
        
        // Skip Nominatim for now as it's slow and often blocked
        // Instead, use a fallback location based on common patterns
        console.log(`🔍 Using fallback geocoding for "${location}"`);
        
        
        // If still no match, use a default location based on likely region
        let defaultCoords = { lat: 37.7749, lng: -122.4194 }; // Default to SF
        
        // Try to guess region from location string
        if (normalizedLocation.includes('europe') || normalizedLocation.includes('eu')) {
            defaultCoords = { lat: 51.5074, lng: -0.1278 }; // London
        } else if (normalizedLocation.includes('asia') || normalizedLocation.includes('asian')) {
            defaultCoords = { lat: 35.6762, lng: 139.6503 }; // Tokyo
        } else if (normalizedLocation.includes('africa') || normalizedLocation.includes('african')) {
            defaultCoords = { lat: -26.2041, lng: 28.0473 }; // Johannesburg
        } else if (normalizedLocation.includes('south america') || normalizedLocation.includes('latin')) {
            defaultCoords = { lat: -23.5505, lng: -46.6333 }; // São Paulo
        } else if (normalizedLocation.includes('oceania') || normalizedLocation.includes('pacific')) {
            defaultCoords = { lat: -33.8688, lng: 151.2093 }; // Sydney
        }
        
        console.log(`🌍 Using regional default for "${location}"`);
        locationCache.set(location, defaultCoords);
        return defaultCoords;
        
    } catch (error) {
        console.error(`❌ Geocoding error for "${location}":`, error.message);
    }
    
    console.log(`❌ Could not geocode "${location}"`);
    locationCache.set(location, null);
    return null;
}

// Update map markers
async function updateMapMarkers() {
    const bounds = map.getBounds();
    const developersToShow = getDevelopersInBounds(bounds);
    
    console.log(`🎯 Updating markers: ${developersToShow.length}/${allDevelopers.size} developers in view`);
    console.log('📋 Developers to show:', developersToShow.slice(0, 3).map(d => `${d.login} (${d.location}) coords:${!!d.coordinates}`));
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

// List view functionality
let currentView = 'map'; // 'map' or 'list'
let currentSort = 'total_stars';
let searchQuery = '';

function toggleView() {
    const mapContainer = document.getElementById('mapContainer');
    const listContainer = document.getElementById('listContainer');
    const toggleBtn = document.getElementById('toggleViewBtn');
    
    if (currentView === 'map') {
        currentView = 'list';
        mapContainer.classList.add('hidden');
        listContainer.classList.remove('hidden');
        toggleBtn.textContent = '🗺️ Map View';
        renderDeveloperList();
    } else {
        currentView = 'map';
        mapContainer.classList.remove('hidden');
        listContainer.classList.add('hidden');
        toggleBtn.textContent = '📋 List View';
    }
}

function renderDeveloperList() {
    const developerList = document.getElementById('developerList');
    
    if (!developerList) return;
    
    // Get all developers and sort them
    const developers = Array.from(allDevelopers.values());
    
    // Filter by search query
    const filteredDevelopers = developers.filter(dev => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            (dev.name && dev.name.toLowerCase().includes(query)) ||
            (dev.login && dev.login.toLowerCase().includes(query)) ||
            (dev.bio && dev.bio.toLowerCase().includes(query)) ||
            (dev.location && dev.location.toLowerCase().includes(query)) ||
            (dev.company && dev.company.toLowerCase().includes(query))
        );
    });
    
    // Sort developers
    filteredDevelopers.sort((a, b) => {
        const aValue = a[currentSort] || 0;
        const bValue = b[currentSort] || 0;
        return bValue - aValue; // Descending order
    });
    
    // Render the list
    developerList.innerHTML = filteredDevelopers.map((dev, index) => {
        const socialLinks = dev.social || {};
        const languages = dev.top_languages || [];
        
        return `
            <div class="developer-item">
                <div class="rank-badge">#${index + 1}</div>
                
                <div class="developer-header">
                    <img class="developer-avatar" src="${dev.avatar_url}" alt="${dev.name || dev.login}" />
                    <div class="developer-info">
                        <h3>${dev.name || dev.login}</h3>
                        <div class="username">@${dev.login}</div>
                        <div class="location">📍 ${dev.location || 'Unknown'}</div>
                    </div>
                </div>
                
                <div class="developer-stats">
                    <div class="stat-item">
                        <span class="stat-value">⭐${formatNumber(dev.total_stars || 0)}</span>
                        <span class="stat-label">stars</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">👥${formatNumber(dev.followers || 0)}</span>
                        <span class="stat-label">followers</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">📁${dev.public_repos || 0}</span>
                        <span class="stat-label">repos</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">🍴${formatNumber(dev.total_forks || 0)}</span>
                        <span class="stat-label">forks</span>
                    </div>
                </div>
                
                ${dev.bio ? `<div class="developer-bio">${dev.bio}</div>` : ''}
                
                ${languages.length > 0 ? `
                    <div class="developer-languages">
                        ${languages.map(lang => `<span class="language-tag">${lang}</span>`).join('')}
                    </div>
                ` : ''}
                
                <div class="developer-social">
                    <a href="${dev.html_url}" target="_blank" class="social-link github">
                        <span>🐙</span> GitHub
                    </a>
                    ${socialLinks.twitter ? `
                        <a href="${socialLinks.twitter}" target="_blank" class="social-link twitter">
                            <span>🐦</span> Twitter
                        </a>
                    ` : ''}
                    ${socialLinks.linkedin ? `
                        <a href="${socialLinks.linkedin}" target="_blank" class="social-link linkedin">
                            <span>💼</span> LinkedIn
                        </a>
                    ` : ''}
                    ${socialLinks.youtube ? `
                        <a href="${socialLinks.youtube}" target="_blank" class="social-link youtube">
                            <span>📺</span> YouTube
                        </a>
                    ` : ''}
                    ${socialLinks.website && !socialLinks.twitter && !socialLinks.linkedin && !socialLinks.youtube ? `
                        <a href="${socialLinks.website}" target="_blank" class="social-link website">
                            <span>🌐</span> Website
                        </a>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    console.log(`📋 Rendered ${filteredDevelopers.length} developers in list view`);
}

function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

function setupListControls() {
    const toggleBtn = document.getElementById('toggleViewBtn');
    const sortSelect = document.getElementById('sortSelect');
    const searchInput = document.getElementById('searchInput');
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleView);
    }
    
    if (sortSelect) {
        sortSelect.value = currentSort;
        sortSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            if (currentView === 'list') {
                renderDeveloperList();
            }
        });
    }
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            if (currentView === 'list') {
                renderDeveloperList();
            }
        });
    }
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
        
        // Setup list view controls
        setupListControls();
        
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