const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { execSync } = require('child_process');

const INVENTORY_FILE = '.local_data/MusicStack-Inventory-2026-06-08-Forever-Young-Records.txt';
// D1 supports up to 10,000 statements in a single batch request
const BATCH_SIZE = 9000; 
const OUTPUT_DIR = path.join(__dirname, 'db_batches');
const KEY_FILE = '.local_data/key_map.txt';

// Helper to escape SQL values
function escapeSql(val) {
  if (val === undefined || val === null || val === '') {
    return 'NULL';
  }
  // Double the single quotes
  return "'" + val.replace(/'/g, "''") + "'";
}

// Helper to parse numeric values safely
function parseNum(val, isFloat = false) {
  if (val === undefined || val === null || val === '') {
    return 'NULL';
  }
  const clean = val.trim();
  const num = isFloat ? parseFloat(clean) : parseInt(clean, 10);
  return isNaN(num) ? 'NULL' : num;
}

async function run() {
  console.log('--- Phase 1: Parsing inventory file and generating SQL batches ---');
  
  if (!fs.existsSync(INVENTORY_FILE)) {
    console.error(`Error: File not found: ${INVENTORY_FILE}`);
    process.exit(1);
  }

  // Clear or create batch directory
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(OUTPUT_DIR);

  const fileStream = fs.createReadStream(INVENTORY_FILE);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const keyStream = fs.createWriteStream(KEY_FILE, { encoding: 'utf8' });
  keyStream.write('ID\tSeller_Reference_Number\tArtist\tTitle\n');

  let lineCount = 0;
  let recordId = 0;
  let batchIndex = 1;
  let currentBatchSql = [];
  let allLocalSql = ['PRAGMA foreign_keys=OFF;', 'BEGIN TRANSACTION;'];

  for await (const line of rl) {
    lineCount++;
    if (lineCount === 1) {
      // Skip header line
      continue;
    }

    if (!line.trim()) {
      continue;
    }

    const parts = line.split('\t');
    recordId++;

    // Pad or truncate to ensure exactly 20 columns
    const cols = Array(20).fill('');
    for (let i = 0; i < parts.length && i < 20; i++) {
      cols[i] = parts[i];
    }

    const artist = cols[0];
    const title = cols[1];
    const format = cols[2];
    const discogsId = cols[3];
    const price = cols[4];
    const description = cols[5];
    const condMedia = cols[6];
    const condSleeve = cols[7];
    const sellerRef = cols[8];
    const quantity = cols[9];
    const label = cols[10];
    const catalogNum = cols[11];
    const country = cols[12];
    const date = cols[13];
    const genre = cols[14];
    const frontImg = cols[15];
    const backImg = cols[16];
    const urls = cols[17];
    const barcode = cols[18];
    const numInSet = cols[19];

    // Write to Key File
    keyStream.write(`${recordId}\t${sellerRef || ''}\t${artist || ''}\t${title || ''}\n`);

    // Build SQL INSERT statement
    const sql = `INSERT INTO Online_Inventory (
      id, Artist, Title, Format, Discogs_ID, Price, Description, 
      Condition_Media, Condition_Sleeve, Seller_Reference_Number, Quantity, 
      Label, Release_Catalog_Number, Release_Country, Release_Date, Genre, 
      Front_Image_URL, Back_Image_URL, YouTube_Audio_Image_URLs, Bar_Code, Number_In_Set
    ) VALUES (
      ${recordId},
      ${escapeSql(artist)},
      ${escapeSql(title)},
      ${escapeSql(format)},
      ${escapeSql(discogsId)},
      ${parseNum(price, true)},
      ${escapeSql(description)},
      ${escapeSql(condMedia)},
      ${escapeSql(condSleeve)},
      ${escapeSql(sellerRef)},
      ${parseNum(quantity, false)},
      ${escapeSql(label)},
      ${escapeSql(catalogNum)},
      ${escapeSql(country)},
      ${escapeSql(date)},
      ${escapeSql(genre)},
      ${escapeSql(frontImg)},
      ${escapeSql(backImg)},
      ${escapeSql(urls)},
      ${escapeSql(barcode)},
      ${escapeSql(numInSet)}
    );`;

    currentBatchSql.push(sql);
    allLocalSql.push(sql);

    if (currentBatchSql.length === BATCH_SIZE) {
      writeBatch(batchIndex++, currentBatchSql);
      currentBatchSql = [];
    }
  }

  // Write remaining records for remote batching
  if (currentBatchSql.length > 0) {
    writeBatch(batchIndex++, currentBatchSql);
  }

  allLocalSql.push('COMMIT;');
  
  // Write the single local import SQL file containing all inserts
  const localSqlFile = path.join(OUTPUT_DIR, 'local_all.sql');
  fs.writeFileSync(localSqlFile, allLocalSql.join('\n'), 'utf8');

  keyStream.end();
  console.log(`Generated ${recordId} records.`);
  console.log(`Remote: ${batchIndex - 1} SQL batch files generated under '${OUTPUT_DIR}'.`);
  console.log(`Local: Single SQL file generated at '${localSqlFile}'.`);
  console.log(`Key cross-reference file saved as '${KEY_FILE}'.`);

  // Parse command line arguments
  const mode = process.argv[2];
  if (mode !== '--local' && mode !== '--remote') {
    console.log('\nBatches generated. To import, run:\n  node import_to_d1.js --local\n  node import_to_d1.js --remote');
    return;
  }

  console.log(`\n--- Phase 2: Importing to D1 database (${mode}) ---`);
  
  if (mode === '--local') {
    // For local, run the single large file to avoid Node/CLI startup overhead per batch
    console.log(`Executing single local import from ${localSqlFile}...`);
    const start = Date.now();
    try {
      console.log('Clearing local table Online_Inventory first...');
      execSync(`npx wrangler d1 execute foreveryoung-db --local --command "DELETE FROM Online_Inventory;"`, { stdio: 'inherit' });
      execSync(`npx wrangler d1 execute foreveryoung-db --local --file="${localSqlFile}"`, { stdio: 'inherit' });
      console.log(`Local import completed in ${((Date.now() - start) / 1000).toFixed(2)}s`);
    } catch (err) {
      console.error('Local import error:', err.message);
      process.exit(1);
    }
  } else {
    // For remote, D1 HTTP limit applies, so run the split batches
    const totalBatches = batchIndex - 1;
    const start = Date.now();
    console.log(`Executing remote import of ${totalBatches} batches (each up to ${BATCH_SIZE} rows)...`);
    try {
      console.log('Clearing remote table Online_Inventory first...');
      execSync(`npx wrangler d1 execute foreveryoung-db --remote --command "DELETE FROM Online_Inventory;"`, { stdio: 'inherit' });
    } catch (err) {
      console.error('Failed to clear remote table:', err.message);
      process.exit(1);
    }
    
    for (let i = 1; i <= totalBatches; i++) {
      const batchFile = path.join(OUTPUT_DIR, `batch_${i}.sql`);
      console.log(`[${i}/${totalBatches}] Executing ${batchFile}...`);
      try {
        const cmd = `npx wrangler d1 execute foreveryoung-db --remote --file="${batchFile}"`;
        execSync(cmd, { stdio: 'inherit' });
      } catch (err) {
        console.error(`Error executing remote batch ${i}:`, err.message);
        console.log('Stopping remote import due to error.');
        process.exit(1);
      }
    }
    console.log(`Remote import completed in ${((Date.now() - start) / 1000).toFixed(2)}s`);
  }

  console.log('\nProcess finished successfully!');
}

function writeBatch(index, sqls) {
  const content = [
    'PRAGMA foreign_keys=OFF;',
    ...sqls
  ].join('\n');
  fs.writeFileSync(path.join(OUTPUT_DIR, `batch_${index}.sql`), content, 'utf8');
}

run().catch(console.error);
