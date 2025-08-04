# GitHub Developers World Map

An interactive world map showing popular GitHub developers and their locations.

## Features

- 🌍 Interactive map using OpenStreetMap and Leaflet
- 👥 Displays popular GitHub developers (1000+ followers)
- 📍 Geocoded locations with developer information
- 🔄 Refresh button to update data
- 📱 Responsive design

## How it works

1. Fetches popular developers from GitHub API (sorted by followers)
2. Retrieves detailed information including location
3. Geocodes locations using OpenStreetMap's Nominatim service
4. Displays developers on an interactive map with popups

## Live Demo

Visit: `https://[your-username].github.io/gh-earth/`

## Setup

1. Fork or clone this repository
2. Enable GitHub Pages in repository settings
3. Select "Deploy from a branch" and choose "main" branch

## API Limits

- GitHub API: 60 requests/hour (unauthenticated)
- Nominatim: Respects 1 request/second rate limit

## Technologies

- Leaflet.js for mapping
- OpenStreetMap for map tiles
- GitHub API for developer data
- Nominatim for geocoding
