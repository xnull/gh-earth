const fs = require('fs');

// Read the existing developers-data.json
const data = JSON.parse(fs.readFileSync('developers-data.json', 'utf8'));
const developers = data.developers;

console.log(`Found ${developers.length} developers to convert to batches`);

// Create data directory if it doesn't exist
if (!fs.existsSync('data')) {
    fs.mkdirSync('data');
}

// Split into batches of 20 (small for testing)
const batchSize = 20;
const batches = [];

for (let i = 0; i < developers.length; i += batchSize) {
    const batch = developers.slice(i, i + batchSize);
    batches.push(batch);
}

console.log(`Creating ${batches.length} batches...`);

// Create batch files
batches.forEach((batch, index) => {
    const batchData = {
        batch: index,
        generated_at: new Date().toISOString(),
        developers: batch,
        total_in_batch: batch.length
    };
    
    const filename = `data/developers-batch-${index}.json`;
    fs.writeFileSync(filename, JSON.stringify(batchData, null, 2));
    console.log(`Created ${filename} with ${batch.length} developers`);
});

// Create index file
const indexData = {
    total_developers: developers.length,
    total_batches: batches.length,
    batches: batches.map((batch, index) => ({
        batch: index,
        file: `developers-batch-${index}.json`,
        count: batch.length,
        generated_at: new Date().toISOString()
    })),
    last_updated: new Date().toISOString()
};

fs.writeFileSync('data/index.json', JSON.stringify(indexData, null, 2));
console.log(`Created data/index.json with ${batches.length} batch references`);

console.log('✅ Test batches created successfully!');