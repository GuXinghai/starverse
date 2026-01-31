
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function checkSchema(filePath) {
    console.log(`Checking ${filePath}...`);
    try {
        const sql = fs.readFileSync(filePath, 'utf-8');
        const db = new Database(':memory:');
        db.exec(sql);
        console.log(`✅ ${filePath} is valid.`);
        db.close();
    } catch (err) {
        console.error(`❌ Error in ${filePath}:`);
        console.error(err.message);
    }
}

const files = [
    'infra/db/schema.sql',
    'src/next/persistence/schema.sql'
];

files.forEach(f => {
    const fullPath = path.resolve(__dirname, f);
    if (fs.existsSync(fullPath)) {
        checkSchema(fullPath);
    } else {
        console.log(`⚠️  File not found: ${fullPath}`);
    }
});
