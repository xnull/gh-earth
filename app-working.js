// GitHub Developers World Map - Working Version
let map;
let markers = [];
let allDevelopers = [];

// Initialize the map
function initMap() {
    try {
        console.log('🗺️ Initializing map...');
        map = L.map('map').setView([20, 0], 2);
        
        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(map);
        
        console.log('✅ Map initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Failed to initialize map:', error);
        showError('Failed to initialize map. Please refresh the page.');
        return false;
    }
}

// Load developer data
async function loadDeveloperData() {
    try {
        console.log('📖 Loading developer data...');
        showLoading(true, 'Loading developer data...');
        
        // Try to load index first
        let developers = [];
        
        try {
            const indexResponse = await fetch('./data/index.json');
            if (indexResponse.ok) {
                const index = await indexResponse.json();
                console.log(`📊 Found ${index.total_developers} developers in ${index.total_batches} batches`);
                
                // Load all batches
                for (let i = 0; i < Math.min(index.total_batches, 3); i++) {
                    console.log(`📥 Loading batch ${i}...`);
                    const batchResponse = await fetch(`./data/developers-batch-${i}.json`);
                    if (batchResponse.ok) {
                        const batch = await batchResponse.json();
                        developers.push(...batch.developers);
                        console.log(`✅ Loaded batch ${i}: ${batch.developers.length} developers`);
                    }
                }
            } else {
                throw new Error('Index not found');
            }
        } catch (e) {
            // Fallback to single file
            console.log('📄 Index not found, trying fallback...');
            const response = await fetch('./developers-data.json');
            if (response.ok) {
                const data = await response.json();
                developers = data.developers || [];
                console.log(`✅ Loaded fallback data: ${developers.length} developers`);
            } else {
                throw new Error('No data files found');
            }
        }
        
        if (developers.length === 0) {
            throw new Error('No developer data loaded');
        }
        
        allDevelopers = developers;
        console.log(`🎉 Total developers loaded: ${allDevelopers.length}`);
        
        // Create markers
        await createMarkers();
        
        return allDevelopers;
        
    } catch (error) {
        console.error('❌ Failed to load developer data:', error);
        showError(`Failed to load developer data: ${error.message}`);
        return [];
    } finally {
        showLoading(false);
    }
}

// Create markers for developers
async function createMarkers() {
    console.log('🎯 Creating markers...');
    showLoading(true, 'Creating markers...');
    
    try {
        // Clear existing markers
        markers.forEach(marker => {
            if (marker && marker.remove) {
                marker.remove();
            }
        });
        markers = [];
        
        let markerCount = 0;
        const maxMarkers = 200; // Limit for performance
        
        for (const dev of allDevelopers.slice(0, maxMarkers)) {
            if (dev.coordinates && dev.coordinates.lat && dev.coordinates.lng) {
                try {
                    const marker = L.marker([dev.coordinates.lat, dev.coordinates.lng])
                        .bindPopup(createPopupContent(dev))
                        .addTo(map);
                    
                    markers.push(marker);
                    markerCount++;
                } catch (markerError) {
                    console.log(`⚠️ Failed to create marker for ${dev.login}:`, markerError.message);
                }
            } else if (dev.location) {
                // For developers without coordinates, add a console log but don't fail
                console.log(`📍 No coordinates for ${dev.login} at ${dev.location}`);
            }
        }
        
        console.log(`✅ Created ${markerCount} markers`);
        updateDeveloperCount(markerCount, allDevelopers.length);
        
    } catch (error) {
        console.error('❌ Error creating markers:', error);
        showError('Failed to create map markers');
    } finally {
        showLoading(false);
    }
}

// Create popup content for developer
function createPopupContent(developer) {
    const company = developer.company ? `<div>🏢 ${developer.company}</div>` : '';
    const bio = developer.bio ? `<div>📝 ${developer.bio.substring(0, 100)}${developer.bio.length > 100 ? '...' : ''}</div>` : '';
    const stars = developer.total_stars ? `<div>⭐ ${developer.total_stars.toLocaleString()} stars</div>` : '';
    const repos = developer.public_repos ? `<div>📦 ${developer.public_repos} repos</div>` : '';
    
    return `
        <div style="min-width: 200px;">
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <img src="${developer.avatar_url}" style="width: 40px; height: 40px; border-radius: 50%; margin-right: 10px;" alt="${developer.login}">
                <div>
                    <h3 style="margin: 0; font-size: 16px;">${developer.name || developer.login}</h3>
                    <div style="color: #666;">👥 ${developer.followers.toLocaleString()} followers</div>
                    <div style="color: #666;">📍 ${developer.location}</div>
                </div>
            </div>
            ${company}
            ${stars}
            ${repos}
            ${bio}
            <div style="margin-top: 10px;">
                <a href="${developer.html_url}" target="_blank" style="color: #0366d6; text-decoration: none;">View on GitHub →</a>
            </div>
        </div>
    `;
}

// Update developer count display
function updateDeveloperCount(shown, total) {
    const countElement = document.getElementById('developerCount');
    if (countElement) {
        countElement.textContent = `${shown.toLocaleString()} developers shown of ${total.toLocaleString()} total`;
    }
}

// Show/hide loading indicator
function showLoading(show, message = 'Loading...') {
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
        if (show) {
            const messageEl = loadingEl.querySelector('p');
            if (messageEl) messageEl.textContent = message;
            loadingEl.classList.remove('hidden');
        } else {
            loadingEl.classList.add('hidden');
        }
    }
}

// Show error message
function showError(message) {
    console.error('Error:', message);
    
    // Try to show in UI
    const countElement = document.getElementById('developerCount');
    if (countElement) {
        countElement.textContent = `Error: ${message}`;
        countElement.style.color = '#ff6b6b';
    }
    
    // Also show alert for now
    alert(`Error: ${message}`);
}

// Refresh data
async function refreshData() {
    console.log('🔄 Refreshing data...');
    allDevelopers = [];
    markers.forEach(marker => {
        if (marker && marker.remove) {
            marker.remove();
        }
    });
    markers = [];
    
    await loadDeveloperData();
}

// List view functionality (simplified)
let currentView = 'map';
let currentSort = 'total_stars';

function toggleView() {
    const mapContainer = document.getElementById('mapContainer');
    const listContainer = document.getElementById('listContainer');
    const toggleBtn = document.getElementById('toggleViewBtn');
    
    if (currentView === 'map') {
        currentView = 'list';
        if (mapContainer) mapContainer.classList.add('hidden');
        if (listContainer) listContainer.classList.remove('hidden');
        if (toggleBtn) toggleBtn.textContent = '🗺️ Map View';
        renderDeveloperList();
    } else {
        currentView = 'map';
        if (mapContainer) mapContainer.classList.remove('hidden');
        if (listContainer) listContainer.classList.add('hidden');
        if (toggleBtn) toggleBtn.textContent = '📋 List View';
    }
}

function renderDeveloperList() {
    const developerList = document.getElementById('developerList');
    if (!developerList) return;
    
    // Sort developers
    const sortedDevelopers = [...allDevelopers].sort((a, b) => {
        const aValue = a[currentSort] || 0;
        const bValue = b[currentSort] || 0;
        return bValue - aValue;
    });
    
    // Render list (first 50 for performance)
    developerList.innerHTML = sortedDevelopers.slice(0, 50).map((dev, index) => {
        const social = dev.social || {};
        const languages = dev.top_languages || [];
        
        return `
            <div style="background: #1c2128; border: 1px solid #30363d; border-radius: 8px; padding: 15px; margin: 10px 0;">
                <div style="display: flex; align-items: center; margin-bottom: 10px;">
                    <span style="background: #238636; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-right: 10px;">#${index + 1}</span>
                    <img src="${dev.avatar_url}" style="width: 40px; height: 40px; border-radius: 50%; margin-right: 10px;" alt="${dev.login}">
                    <div>
                        <h3 style="margin: 0; font-size: 16px;">${dev.name || dev.login}</h3>
                        <div style="color: #7d8590;">@${dev.login}</div>
                        <div style="color: #7d8590;">📍 ${dev.location || 'Unknown'}</div>
                    </div>
                </div>
                
                <div style="display: flex; gap: 15px; margin-bottom: 10px;">
                    <span>⭐ ${(dev.total_stars || 0).toLocaleString()}</span>
                    <span>👥 ${(dev.followers || 0).toLocaleString()}</span>
                    <span>📁 ${dev.public_repos || 0}</span>
                    <span>🍴 ${(dev.total_forks || 0).toLocaleString()}</span>
                </div>
                
                ${dev.bio ? `<div style="margin-bottom: 10px; color: #c9d1d9;">${dev.bio}</div>` : ''}
                
                ${languages.length > 0 ? `
                    <div style="margin-bottom: 10px;">
                        ${languages.map(lang => `<span style="background: #21262d; padding: 2px 6px; border-radius: 4px; font-size: 12px; margin-right: 5px;">${lang}</span>`).join('')}
                    </div>
                ` : ''}
                
                <div style="display: flex; gap: 10px;">
                    <a href="${dev.html_url}" target="_blank" style="color: #58a6ff; text-decoration: none;">🐙 GitHub</a>
                    ${social.twitter ? `<a href="${social.twitter}" target="_blank" style="color: #58a6ff; text-decoration: none;">🐦 Twitter</a>` : ''}
                    ${social.linkedin ? `<a href="${social.linkedin}" target="_blank" style="color: #58a6ff; text-decoration: none;">💼 LinkedIn</a>` : ''}
                    ${social.youtube ? `<a href="${social.youtube}" target="_blank" style="color: #58a6ff; text-decoration: none;">📺 YouTube</a>` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    console.log(`📋 Rendered ${Math.min(sortedDevelopers.length, 50)} developers in list view`);
}

// Setup event listeners
function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshData);
    }
    
    const toggleBtn = document.getElementById('toggleViewBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleView);
    }
    
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            if (currentView === 'list') {
                renderDeveloperList();
            }
        });
    }
}

// Initialize everything when page loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🌍 GitHub Developers World Map - Starting...');
    
    try {
        // Initialize map
        const mapSuccess = initMap();
        if (!mapSuccess) {
            return;
        }
        
        // Setup event listeners
        setupEventListeners();
        
        // Load data
        await loadDeveloperData();
        
        console.log('🎉 Application initialized successfully');
        
    } catch (error) {
        console.error('❌ Failed to initialize application:', error);
        showError('Failed to initialize the application. Please refresh the page.');
    }
});