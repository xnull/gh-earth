const fs = require('fs');
const https = require('https');

// GitHub API configuration
const GITHUB_API_BASE = 'https://api.github.com';

// Your GitHub token (optional but increases rate limit to 5000/hour)
// Set this as environment variable: export GITHUB_TOKEN=your_token_here
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Headers for API requests
const headers = {
    'User-Agent': 'GitHub-Developers-Map',
    'Accept': 'application/vnd.github.v3+json'
};

if (GITHUB_TOKEN) {
    headers['Authorization'] = `token ${GITHUB_TOKEN}`;
}

// Cities and search terms to collect developers from
const SEARCH_QUERIES = [
    // By follower count (most popular developers)
    { query: 'followers:>50000', name: 'Top developers worldwide' },
    { query: 'followers:>20000', name: 'Very popular developers' },
    { query: 'followers:>10000', name: 'Popular developers' },
    
    // Major tech hubs
    { query: 'location:"San Francisco" followers:>100', name: 'San Francisco' },
    { query: 'location:"Bay Area" followers:>100', name: 'Bay Area' },
    { query: 'location:"New York" followers:>100', name: 'New York' },
    { query: 'location:"NYC" followers:>100', name: 'NYC' },
    { query: 'location:"Seattle" followers:>100', name: 'Seattle' },
    { query: 'location:"Austin" followers:>100', name: 'Austin' },
    { query: 'location:"Boston" followers:>100', name: 'Boston' },
    { query: 'location:"Los Angeles" followers:>100', name: 'Los Angeles' },
    { query: 'location:"Chicago" followers:>100', name: 'Chicago' },
    { query: 'location:"Toronto" followers:>100', name: 'Toronto' },
    { query: 'location:"Vancouver" followers:>100', name: 'Vancouver' },
    
    // Europe
    { query: 'location:"London" followers:>100', name: 'London' },
    { query: 'location:"UK" followers:>200', name: 'UK' },
    { query: 'location:"Berlin" followers:>100', name: 'Berlin' },
    { query: 'location:"Germany" followers:>200', name: 'Germany' },
    { query: 'location:"Paris" followers:>100', name: 'Paris' },
    { query: 'location:"France" followers:>200', name: 'France' },
    { query: 'location:"Amsterdam" followers:>100', name: 'Amsterdam' },
    { query: 'location:"Netherlands" followers:>200', name: 'Netherlands' },
    { query: 'location:"Stockholm" followers:>100', name: 'Stockholm' },
    { query: 'location:"Switzerland" followers:>100', name: 'Switzerland' },
    { query: 'location:"Barcelona" followers:>100', name: 'Barcelona' },
    { query: 'location:"Madrid" followers:>100', name: 'Madrid' },
    { query: 'location:"Dublin" followers:>100', name: 'Dublin' },
    
    // Asia
    { query: 'location:"Tokyo" followers:>100', name: 'Tokyo' },
    { query: 'location:"Japan" followers:>200', name: 'Japan' },
    { query: 'location:"Beijing" followers:>100', name: 'Beijing' },
    { query: 'location:"Shanghai" followers:>100', name: 'Shanghai' },
    { query: 'location:"China" followers:>500', name: 'China' },
    { query: 'location:"Bangalore" followers:>100', name: 'Bangalore' },
    { query: 'location:"Bengaluru" followers:>100', name: 'Bengaluru' },
    { query: 'location:"Mumbai" followers:>100', name: 'Mumbai' },
    { query: 'location:"Delhi" followers:>100', name: 'Delhi' },
    { query: 'location:"India" followers:>500', name: 'India' },
    { query: 'location:"Singapore" followers:>100', name: 'Singapore' },
    { query: 'location:"Seoul" followers:>100', name: 'Seoul' },
    { query: 'location:"Korea" followers:>200', name: 'Korea' },
    { query: 'location:"Hong Kong" followers:>100', name: 'Hong Kong' },
    { query: 'location:"Taiwan" followers:>100', name: 'Taiwan' },
    
    // Other regions
    { query: 'location:"Sydney" followers:>100', name: 'Sydney' },
    { query: 'location:"Melbourne" followers:>100', name: 'Melbourne' },
    { query: 'location:"Australia" followers:>200', name: 'Australia' },
    { query: 'location:"São Paulo" followers:>100', name: 'São Paulo' },
    { query: 'location:"Brazil" followers:>200', name: 'Brazil' },
    { query: 'location:"Tel Aviv" followers:>100', name: 'Tel Aviv' },
    { query: 'location:"Israel" followers:>200', name: 'Israel' },
    { query: 'location:"Dubai" followers:>100', name: 'Dubai' },
    { query: 'location:"Russia" followers:>200', name: 'Russia' },
    { query: 'location:"Moscow" followers:>100', name: 'Moscow' },
    
    // Remote workers
    { query: 'location:"remote" followers:>500', name: 'Remote' },
];

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
                    resolve(JSON.parse(data));
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

// Fetch developers for a search query
async function fetchDevelopersForQuery(searchQuery, perPage = 100) {
    try {
        console.log(`Searching: ${searchQuery.name}...`);
        const searchPath = `/search/users?q=${encodeURIComponent(searchQuery.query)}&sort=followers&order=desc&per_page=${perPage}`;
        const searchResult = await apiRequest(searchPath);
        
        console.log(`Found ${searchResult.items.length} developers for ${searchQuery.name}`);
        
        // Fetch detailed info for each developer
        const developers = [];
        for (let i = 0; i < Math.min(searchResult.items.length, 30); i++) {
            const user = searchResult.items[i];
            try {
                console.log(`  Fetching details for ${user.login}...`);
                const userDetails = await apiRequest(`/users/${user.login}`);
                
                if (userDetails.location) {
                    developers.push({
                        login: userDetails.login,
                        name: userDetails.name,
                        avatar_url: userDetails.avatar_url,
                        html_url: userDetails.html_url,
                        location: userDetails.location,
                        company: userDetails.company,
                        bio: userDetails.bio,
                        followers: userDetails.followers,
                        public_repos: userDetails.public_repos,
                        created_at: userDetails.created_at
                    });
                }
                
                // Rate limit: 1 request per second without token, faster with token
                await delay(GITHUB_TOKEN ? 100 : 1000);
            } catch (error) {
                console.error(`  Error fetching ${user.login}:`, error.message);
            }
        }
        
        return developers;
    } catch (error) {
        console.error(`Error searching ${searchQuery.name}:`, error.message);
        return [];
    }
}

// Main function
async function downloadDevelopers() {
    console.log('Starting developer data download...');
    console.log(GITHUB_TOKEN ? 'Using authenticated requests (5000/hour limit)' : 'Using unauthenticated requests (60/hour limit)');
    
    const allDevelopers = new Map(); // Use Map to avoid duplicates
    
    for (const searchQuery of SEARCH_QUERIES) {
        const developers = await fetchDevelopersForQuery(searchQuery);
        
        // Add to map (using login as key to avoid duplicates)
        developers.forEach(dev => {
            allDevelopers.set(dev.login, dev);
        });
        
        console.log(`Total unique developers so far: ${allDevelopers.size}`);
        
        // Add delay between searches
        await delay(2000);
    }
    
    // Convert map to array
    const developersArray = Array.from(allDevelopers.values());
    
    // Sort by followers
    developersArray.sort((a, b) => b.followers - a.followers);
    
    // Save to file
    const outputData = {
        generated_at: new Date().toISOString(),
        total_developers: developersArray.length,
        developers: developersArray
    };
    
    fs.writeFileSync('developers-data.json', JSON.stringify(outputData, null, 2));
    console.log(`\nDownload complete! Saved ${developersArray.length} developers to developers-data.json`);
    
    // Show statistics
    const locations = {};
    developersArray.forEach(dev => {
        const loc = dev.location || 'Unknown';
        locations[loc] = (locations[loc] || 0) + 1;
    });
    
    console.log('\nTop 10 locations:');
    Object.entries(locations)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([loc, count]) => {
            console.log(`  ${loc}: ${count} developers`);
        });
}

// Check rate limit
async function checkRateLimit() {
    try {
        const data = await apiRequest('/rate_limit');
        console.log('\nRate Limit Status:');
        console.log(`  Remaining: ${data.rate.remaining}/${data.rate.limit}`);
        console.log(`  Resets at: ${new Date(data.rate.reset * 1000).toLocaleString()}`);
        return data.rate.remaining;
    } catch (error) {
        console.error('Error checking rate limit:', error.message);
        return 0;
    }
}

// Run the download
(async () => {
    const remaining = await checkRateLimit();
    
    if (!GITHUB_TOKEN && remaining < 10) {
        console.error('\nError: GitHub API rate limit is too low.');
        console.error('Please wait for rate limit reset or set GITHUB_TOKEN environment variable.');
        console.error('\nTo use with token:');
        console.error('  export GITHUB_TOKEN=your_github_token_here');
        console.error('  node download-developers.js');
        process.exit(1);
    }
    
    await downloadDevelopers();
    await checkRateLimit();
})();