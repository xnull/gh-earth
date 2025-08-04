const fs = require('fs');
const https = require('https');
const path = require('path');

// Extract social networks from GitHub profile
function extractSocialLinks(userDetails) {
    const social = {};
    
    // GitHub provides these fields directly
    if (userDetails.blog) {
        const blog = userDetails.blog.startsWith('http') ? userDetails.blog : `https://${userDetails.blog}`;
        social.website = blog;
        
        // Try to detect social networks from website URL
        if (blog.includes('twitter.com') || blog.includes('x.com')) {
            social.twitter = blog;
        } else if (blog.includes('linkedin.com')) {
            social.linkedin = blog;
        } else if (blog.includes('youtube.com') || blog.includes('youtu.be')) {
            social.youtube = blog;
        }
    }
    
    if (userDetails.twitter_username) {
        social.twitter = `https://twitter.com/${userDetails.twitter_username}`;
    }
    
    // Parse bio for social links
    if (userDetails.bio) {
        const bio = userDetails.bio;
        
        // Twitter patterns
        const twitterMatch = bio.match(/(?:twitter\.com\/|@)([a-zA-Z0-9_]+)/i);
        if (twitterMatch && !social.twitter) {
            social.twitter = `https://twitter.com/${twitterMatch[1]}`;
        }
        
        // LinkedIn patterns
        const linkedinMatch = bio.match(/linkedin\.com\/in\/([a-zA-Z0-9-]+)/i);
        if (linkedinMatch) {
            social.linkedin = `https://linkedin.com/in/${linkedinMatch[1]}`;
        }
        
        // YouTube patterns
        const youtubeMatch = bio.match(/(?:youtube\.com\/(?:c\/|channel\/|@)|youtu\.be\/)([a-zA-Z0-9_-]+)/i);
        if (youtubeMatch) {
            social.youtube = `https://youtube.com/@${youtubeMatch[1]}`;
        }
    }
    
    return social;
}

// Get additional GitHub stats (stars, etc.)
async function getGitHubStats(username) {
    try {
        const reposResponse = await apiRequest(`/users/${username}/repos?per_page=100&sort=updated`);
        const repos = reposResponse.data || [];
        
        const totalStars = repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
        const totalForks = repos.reduce((sum, repo) => sum + (repo.forks_count || 0), 0);
        const languages = repos.map(repo => repo.language).filter(Boolean);
        const topLanguages = [...new Set(languages)].slice(0, 5);
        
        return {
            total_stars: totalStars,
            total_forks: totalForks,
            top_languages: topLanguages,
            public_repos_count: repos.length
        };
    } catch (error) {
        console.log(`Failed to get stats for ${username}: ${error.message}`);
        return {
            total_stars: 0,
            total_forks: 0,
            top_languages: [],
            public_repos_count: 0
        };
    }
}

// Simple geocoding function using Nominatim (OpenStreetMap)
async function geocodeLocation(location) {
    if (!location || location.trim() === '') return null;
    
    try {
        const query = encodeURIComponent(location.trim());
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`;
        
        const response = await new Promise((resolve, reject) => {
            https.get(url, { headers: { 'User-Agent': 'GitHub-Developers-Map' } }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ data, status: res.statusCode }));
            }).on('error', reject);
        });
        
        if (response.status === 200 && response.data) {
            const results = JSON.parse(response.data);
            if (results && results.length > 0) {
                const result = results[0];
                return {
                    lat: parseFloat(result.lat),
                    lng: parseFloat(result.lon)
                };
            }
        }
    } catch (error) {
        console.log(`❌ Geocoding failed for "${location}": ${error.message}`);
    }
    
    return null;
}

// GitHub API configuration
const GITHUB_API_BASE = 'https://api.github.com';

// Your GitHub token (required for higher rate limits)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
    console.error('Error: GITHUB_TOKEN environment variable is required');
    console.error('Please set it: export GITHUB_TOKEN=your_token_here');
    process.exit(1);
}

// Headers for API requests
const headers = {
    'User-Agent': 'GitHub-Developers-Map',
    'Accept': 'application/vnd.github.v3+json',
    'Authorization': `token ${GITHUB_TOKEN}`
};

// Configuration
const CONFIG = {
    developersPerFile: 500,           // Max developers per JSON file
    maxDevelopersPerSearch: 100,      // Max developers to fetch per search query
    requestDelayMs: 50,               // Delay between requests (ms)
    searchDelayMs: 1000,              // Delay between search queries (ms)
    dataDir: './data',                // Directory to store JSON files
    maxPages: 10,                     // Max pages per search query
    minFollowers: 50                  // Minimum followers for inclusion
};

// Comprehensive search queries with different strategies
const SEARCH_STRATEGIES = [
    // Top developers globally
    { type: 'followers', queries: [
        'followers:>100000',
        'followers:50000..100000',
        'followers:20000..50000',
        'followers:10000..20000',
        'followers:5000..10000',
        'followers:2000..5000',
        'followers:1000..2000',
        'followers:500..1000',
        'followers:200..500',
        'followers:100..200'
    ]},
    
    // By programming language
    { type: 'language', queries: [
        'language:javascript followers:>100',
        'language:python followers:>100',
        'language:java followers:>100',
        'language:typescript followers:>100',
        'language:go followers:>100',
        'language:rust followers:>100',
        'language:cpp followers:>100',
        'language:c followers:>100',
        'language:php followers:>100',
        'language:ruby followers:>100',
        'language:swift followers:>100',
        'language:kotlin followers:>100',
        'language:scala followers:>100',
        'language:clojure followers:>100',
        'language:elixir followers:>100',
        'language:haskell followers:>100'
    ]},
    
    // Major cities worldwide
    { type: 'location', queries: [
        // North America
        'location:"San Francisco" followers:>50',
        'location:"New York" followers:>50',
        'location:"Seattle" followers:>50',
        'location:"Austin" followers:>50',
        'location:"Boston" followers:>50',
        'location:"Toronto" followers:>50',
        'location:"Vancouver" followers:>50',
        'location:"Montreal" followers:>50',
        'location:"Los Angeles" followers:>50',
        'location:"Chicago" followers:>50',
        'location:"Washington" followers:>50',
        'location:"Denver" followers:>50',
        'location:"Portland" followers:>50',
        'location:"Miami" followers:>50',
        'location:"Atlanta" followers:>50',
        
        // Europe
        'location:"London" followers:>50',
        'location:"Berlin" followers:>50',
        'location:"Paris" followers:>50',
        'location:"Amsterdam" followers:>50',
        'location:"Stockholm" followers:>50',
        'location:"Munich" followers:>50',
        'location:"Barcelona" followers:>50',
        'location:"Madrid" followers:>50',
        'location:"Dublin" followers:>50',
        'location:"Copenhagen" followers:>50',
        'location:"Helsinki" followers:>50',
        'location:"Oslo" followers:>50',
        'location:"Zurich" followers:>50',
        'location:"Vienna" followers:>50',
        'location:"Prague" followers:>50',
        'location:"Warsaw" followers:>50',
        'location:"Budapest" followers:>50',
        'location:"Rome" followers:>50',
        'location:"Milan" followers:>50',
        'location:"Brussels" followers:>50',
        
        // Asia
        'location:"Tokyo" followers:>50',
        'location:"Seoul" followers:>50',
        'location:"Beijing" followers:>50',
        'location:"Shanghai" followers:>50',
        'location:"Shenzhen" followers:>50',
        'location:"Hong Kong" followers:>50',
        'location:"Singapore" followers:>50',
        'location:"Bangalore" followers:>50',
        'location:"Mumbai" followers:>50',
        'location:"Delhi" followers:>50',
        'location:"Hyderabad" followers:>50',
        'location:"Pune" followers:>50',
        'location:"Chennai" followers:>50',
        'location:"Tel Aviv" followers:>50',
        'location:"Bangkok" followers:>50',
        'location:"Jakarta" followers:>50',
        'location:"Manila" followers:>50',
        'location:"Kuala Lumpur" followers:>50',
        
        // Other regions
        'location:"Sydney" followers:>50',
        'location:"Melbourne" followers:>50',
        'location:"São Paulo" followers:>50',
        'location:"Rio de Janeiro" followers:>50',
        'location:"Buenos Aires" followers:>50',
        'location:"Mexico City" followers:>50',
        'location:"Dubai" followers:>50',
        'location:"Cairo" followers:>50',
        'location:"Cape Town" followers:>50',
        'location:"Lagos" followers:>50'
    ]},
    
    // By company/organization
    { type: 'company', queries: [
        'company:google followers:>50',
        'company:microsoft followers:>50',
        'company:facebook followers:>50',
        'company:amazon followers:>50',
        'company:apple followers:>50',
        'company:netflix followers:>50',
        'company:uber followers:>50',
        'company:airbnb followers:>50',
        'company:spotify followers:>50',
        'company:github followers:>50',
        'company:twitter followers:>50',
        'company:linkedin followers:>50',
        'company:adobe followers:>50',
        'company:salesforce followers:>50'
    ]},
    
    // By repository count (active developers)
    { type: 'repos', queries: [
        'repos:>1000 followers:>50',
        'repos:500..1000 followers:>50',
        'repos:200..500 followers:>50',
        'repos:100..200 followers:>50',
        'repos:50..100 followers:>50'
    ]}
];

// Create data directory if it doesn't exist
if (!fs.existsSync(CONFIG.dataDir)) {
    fs.mkdirSync(CONFIG.dataDir, { recursive: true });
}

// Load existing progress
function loadProgress() {
    const progressFile = path.join(CONFIG.dataDir, 'progress.json');
    if (fs.existsSync(progressFile)) {
        return JSON.parse(fs.readFileSync(progressFile, 'utf8'));
    }
    return {
        currentBatch: 0,
        processedQueries: {},
        totalDevelopers: 0,
        lastUpdate: new Date().toISOString()
    };
}

// Save progress
function saveProgress(progress) {
    const progressFile = path.join(CONFIG.dataDir, 'progress.json');
    progress.lastUpdate = new Date().toISOString();
    fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
}

// Load existing developers from current batch
function loadCurrentBatch(batchNumber) {
    const batchFile = path.join(CONFIG.dataDir, `developers-batch-${batchNumber}.json`);
    if (fs.existsSync(batchFile)) {
        return JSON.parse(fs.readFileSync(batchFile, 'utf8'));
    }
    return {
        batch: batchNumber,
        generated_at: new Date().toISOString(),
        developers: [],
        total_in_batch: 0
    };
}

// Save batch to file
function saveBatch(batchData) {
    const batchFile = path.join(CONFIG.dataDir, `developers-batch-${batchData.batch}.json`);
    batchData.total_in_batch = batchData.developers.length;
    batchData.generated_at = new Date().toISOString();
    fs.writeFileSync(batchFile, JSON.stringify(batchData, null, 2));
    console.log(`Saved batch ${batchData.batch} with ${batchData.developers.length} developers`);
}

// Create index file with all batches info
function createIndex() {
    const indexFile = path.join(CONFIG.dataDir, 'index.json');
    const batches = [];
    let totalDevelopers = 0;
    
    // Find all batch files
    const files = fs.readdirSync(CONFIG.dataDir);
    const batchFiles = files.filter(f => f.startsWith('developers-batch-') && f.endsWith('.json'));
    
    batchFiles.sort((a, b) => {
        const aBatch = parseInt(a.match(/developers-batch-(\d+)\.json/)[1]);
        const bBatch = parseInt(b.match(/developers-batch-(\d+)\.json/)[1]);
        return aBatch - bBatch;
    });
    
    for (const file of batchFiles) {
        const batchPath = path.join(CONFIG.dataDir, file);
        const batchData = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
        batches.push({
            batch: batchData.batch,
            file: file,
            count: batchData.total_in_batch,
            generated_at: batchData.generated_at
        });
        totalDevelopers += batchData.total_in_batch;
    }
    
    const index = {
        total_developers: totalDevelopers,
        total_batches: batches.length,
        batches: batches,
        last_updated: new Date().toISOString()
    };
    
    fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
    console.log(`Created index with ${totalDevelopers} total developers across ${batches.length} batches`);
}

// Make API request
function apiRequest(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: path,
            method: 'GET',
            headers: headers
        };

        https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve({
                        data: JSON.parse(data),
                        headers: res.headers
                    });
                } else {
                    reject(new Error(`API request failed: ${res.statusCode} - ${data}`));
                }
            });
        }).on('error', reject);
    });
}

// Delay function
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Check rate limit
async function checkRateLimit() {
    try {
        const response = await apiRequest('/rate_limit');
        const remaining = response.data.rate.remaining;
        const reset = new Date(response.data.rate.reset * 1000);
        console.log(`Rate limit: ${remaining}/5000 remaining, resets at ${reset.toLocaleTimeString()}`);
        return { remaining, reset };
    } catch (error) {
        console.error('Error checking rate limit:', error.message);
        return { remaining: 0, reset: new Date() };
    }
}

// Fetch developers for a search query with pagination
async function fetchDevelopersForQuery(query, existingLogins, maxPages = CONFIG.maxPages) {
    const developers = [];
    let page = 1;
    
    while (page <= maxPages) {
        try {
            console.log(`  Page ${page}: Searching "${query}"...`);
            const searchPath = `/search/users?q=${encodeURIComponent(query)}&sort=followers&order=desc&per_page=100&page=${page}`;
            const searchResult = await apiRequest(searchPath);
            
            if (searchResult.data.items.length === 0) {
                console.log(`  No more results for "${query}"`);
                break;
            }
            
            console.log(`  Found ${searchResult.data.items.length} users on page ${page}`);
            
            // Fetch detailed info for each developer
            for (const user of searchResult.data.items) {
                // Skip if we already have this developer
                if (existingLogins.has(user.login)) {
                    continue;
                }
                
                try {
                    console.log(`    Fetching details for ${user.login}...`);
                    const userResponse = await apiRequest(`/users/${user.login}`);
                    const userDetails = userResponse.data;
                    
                    // Only include developers with location and minimum followers
                    if (userDetails.location && userDetails.followers >= CONFIG.minFollowers) {
                        // Geocode the location to get coordinates
                        console.log(`      🌍 Geocoding "${userDetails.location}"...`);
                        const coordinates = await geocodeLocation(userDetails.location);
                        
                        // Extract social links
                        console.log(`      🔗 Extracting social links...`);
                        const social = extractSocialLinks(userDetails);
                        
                        // Get GitHub stats (stars, languages, etc.)
                        console.log(`      ⭐ Fetching GitHub stats...`);
                        const stats = await getGitHubStats(userDetails.login);
                        
                        const developer = {
                            login: userDetails.login,
                            name: userDetails.name,
                            avatar_url: userDetails.avatar_url,
                            html_url: userDetails.html_url,
                            location: userDetails.location,
                            coordinates: coordinates, // Add geocoded coordinates
                            company: userDetails.company,
                            bio: userDetails.bio,
                            blog: userDetails.blog,
                            followers: userDetails.followers,
                            following: userDetails.following,
                            public_repos: userDetails.public_repos,
                            public_gists: userDetails.public_gists,
                            created_at: userDetails.created_at,
                            updated_at: userDetails.updated_at,
                            downloaded_at: new Date().toISOString(),
                            
                            // Enhanced data
                            social: social,
                            total_stars: stats.total_stars,
                            total_forks: stats.total_forks,
                            top_languages: stats.top_languages,
                            public_repos_count: stats.public_repos_count
                        };
                        
                        developers.push(developer);
                        existingLogins.add(userDetails.login);
                        
                        const coordsStr = coordinates ? `${coordinates.lat.toFixed(4)}, ${coordinates.lng.toFixed(4)}` : 'no coords';
                        const socialStr = Object.keys(social).length > 0 ? `social: ${Object.keys(social).join(', ')}` : 'no social';
                        console.log(`      ✅ Added ${userDetails.login} (${userDetails.followers} followers, ⭐${stats.total_stars} stars, ${socialStr}) [${coordsStr}]`);
                        
                        // Add small delay between requests to be respectful
                        await delay(300);
                    } else {
                        console.log(`      ✗ Skipped ${userDetails.login} (no location or <${CONFIG.minFollowers} followers)`);
                    }
                    
                    await delay(CONFIG.requestDelayMs);
                } catch (error) {
                    console.error(`    Error fetching ${user.login}:`, error.message);
                    await delay(CONFIG.requestDelayMs * 2);
                }
            }
            
            page++;
            await delay(CONFIG.requestDelayMs);
            
        } catch (error) {
            console.error(`  Error searching page ${page} of "${query}":`, error.message);
            if (error.message.includes('403')) {
                const { remaining } = await checkRateLimit();
                if (remaining < 10) {
                    console.log('  Rate limit low, stopping this query');
                    break;
                }
            }
            await delay(CONFIG.searchDelayMs);
        }
    }
    
    return developers;
}

// Main download function
async function downloadDevelopers() {
    console.log('🚀 Starting incremental developer data download...');
    
    // Check rate limit
    const { remaining } = await checkRateLimit();
    if (remaining < 100) {
        console.error('❌ Rate limit too low. Please wait for reset.');
        return;
    }
    
    // Load progress
    const progress = loadProgress();
    console.log(`📊 Current progress: Batch ${progress.currentBatch}, ${progress.totalDevelopers} total developers`);
    
    // Load current batch
    let currentBatch = loadCurrentBatch(progress.currentBatch);
    const existingLogins = new Set(currentBatch.developers.map(dev => dev.login));
    
    console.log(`📁 Working on batch ${progress.currentBatch} (${currentBatch.developers.length}/${CONFIG.developersPerFile} developers)`);
    
    // Process each search strategy
    for (const strategy of SEARCH_STRATEGIES) {
        console.log(`\n🔍 Processing ${strategy.type} searches...`);
        
        for (const query of strategy.queries) {
            const queryKey = `${strategy.type}:${query}`;
            
            // Skip if already processed
            if (progress.processedQueries[queryKey]) {
                console.log(`  ⏭️  Skipped already processed: ${query}`);
                continue;
            }
            
            console.log(`\n  🔎 Processing: ${query}`);
            
            const newDevelopers = await fetchDevelopersForQuery(query, existingLogins);
            
            // Add to current batch
            currentBatch.developers.push(...newDevelopers);
            progress.totalDevelopers += newDevelopers.length;
            
            console.log(`  ✅ Added ${newDevelopers.length} new developers from "${query}"`);
            console.log(`  📈 Batch progress: ${currentBatch.developers.length}/${CONFIG.developersPerFile}`);
            
            // Mark query as processed
            progress.processedQueries[queryKey] = {
                processed_at: new Date().toISOString(),
                developers_found: newDevelopers.length
            };
            
            // Save progress
            saveProgress(progress);
            
            // Check if batch is full
            if (currentBatch.developers.length >= CONFIG.developersPerFile) {
                console.log(`\n💾 Batch ${progress.currentBatch} is full, saving...`);
                saveBatch(currentBatch);
                
                // Start new batch
                progress.currentBatch++;
                currentBatch = loadCurrentBatch(progress.currentBatch);
                existingLogins.clear();
                
                console.log(`📁 Started new batch ${progress.currentBatch}`);
                saveProgress(progress);
            }
            
            await delay(CONFIG.searchDelayMs);
            
            // Check rate limit periodically
            const { remaining: currentRemaining } = await checkRateLimit();
            if (currentRemaining < 50) {
                console.log('⚠️  Rate limit getting low, saving and exiting...');
                saveBatch(currentBatch);
                createIndex();
                return;
            }
        }
    }
    
    // Save final batch if it has developers
    if (currentBatch.developers.length > 0) {
        saveBatch(currentBatch);
    }
    
    // Create index file
    createIndex();
    
    console.log(`\n🎉 Download session complete!`);
    console.log(`📊 Total developers: ${progress.totalDevelopers}`);
    console.log(`📁 Current batch: ${progress.currentBatch}`);
    
    await checkRateLimit();
}

// Run the download
if (require.main === module) {
    downloadDevelopers().catch(console.error);
}

module.exports = { downloadDevelopers, CONFIG };