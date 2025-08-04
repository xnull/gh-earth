// Initialize map
let map;
let markers = [];

// GitHub API configuration
const GITHUB_API_BASE = 'https://api.github.com';

// Initialize the map
function initMap() {
    map = L.map('map').setView([20, 0], 2);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);
}

// Fetch popular developers from GitHub
async function fetchDevelopers() {
    showLoading(true);
    
    try {
        // Search for users with high follower count
        const response = await fetch(`${GITHUB_API_BASE}/search/users?q=followers:>1000&sort=followers&order=desc&per_page=100`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch data from GitHub');
        }
        
        const data = await response.json();
        const developers = data.items;
        
        // Fetch additional details for each developer (including location)
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
        document.getElementById('developerCount').textContent = `${validDevelopers.length} developers displayed`;
        
        // Add markers to map
        await addDevelopersToMap(validDevelopers);
        
    } catch (error) {
        console.error('Error fetching developers:', error);
        alert('Failed to fetch GitHub developers. Please try again later.');
    } finally {
        showLoading(false);
    }
}

// Geocode location string to coordinates
async function geocodeLocation(location) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`);
        const data = await response.json();
        
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon)
            };
        }
    } catch (error) {
        console.error('Geocoding error:', error);
    }
    return null;
}

// Add developers to the map
async function addDevelopersToMap(developers) {
    // Clear existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    
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
                const offset = index * 0.01;
                const marker = L.marker([coords.lat + offset, coords.lng + offset])
                    .bindPopup(createPopupContent(dev))
                    .addTo(map);
                
                markers.push(marker);
            });
        }
        
        // Add delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
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

// Initialize everything when page loads
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    fetchDevelopers();
    
    // Add refresh button handler
    document.getElementById('refreshBtn').addEventListener('click', fetchDevelopers);
});