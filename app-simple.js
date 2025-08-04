// Simple geocoding function - now uses pre-stored coordinates from download script
async function geocodeLocation(location) {
    if (locationCache.has(location)) {
        return locationCache.get(location);
    }
    
    console.log(`⚠️ No pre-geocoded coordinates found for "${location}" - using fallback`);
    
    // Simple fallback to San Francisco for unknown locations
    const fallbackCoords = { lat: 37.7749, lng: -122.4194 };
    locationCache.set(location, fallbackCoords);
    return fallbackCoords;
}

// Update map markers to use pre-stored coordinates
async function updateMapMarkers() {
    const bounds = map.getBounds();
    const developersToShow = getDevelopersInBounds(bounds);
    
    console.log(`🎯 Updating markers: ${developersToShow.length}/${allDevelopers.size} developers in view`);
    showLoading(true, `Updating ${developersToShow.length} markers...`);
    
    try {
        // Clear existing markers
        markerLayers.all.clearLayers();
        markers = [];
        
        for (const developer of developersToShow) {
            // Use pre-stored coordinates if available
            let coordinates = developer.coordinates;
            
            if (!coordinates && developer.location) {
                // Fallback to old geocoding for legacy data
                coordinates = await geocodeLocation(developer.location);
            }
            
            if (coordinates) {
                const marker = L.marker([coordinates.lat, coordinates.lng])
                    .bindPopup(createPopupContent(developer));
                
                markerLayers.all.addLayer(marker);
                markers.push({
                    marker,
                    developer,
                    coordinates
                });
                
                // Store coordinates for future use
                if (!developer.coordinates) {
                    developer.coordinates = coordinates;
                }
            }
        }
        
        console.log(`✅ Created ${markers.length} markers`);
        updateDeveloperCount();
        
    } catch (error) {
        console.error('Error updating markers:', error);
        showError('Failed to update map markers');
    } finally {
        showLoading(false);
    }
}