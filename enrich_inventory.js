/**
 * enrich_inventory.js
 * 
 * Nightly batch script to search and enrich Online_Inventory items with Discogs metadata.
 * 
 * Usage:
 *   node enrich_inventory.js --local [--trial] [--limit 100]
 *   node enrich_inventory.js --remote [--trial] [--limit 100]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load environment variables if a .env file exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      process.env[key] = val;
    }
  });
}

const DISCOGS_TOKEN = (process.env.DISCOGS_TOKEN || '').trim();

// Parse CLI Arguments
const args = process.argv.slice(2);
const isLocal = args.includes('--local');
const isRemote = args.includes('--remote');
const isTrial = args.includes('--trial');

let limit = 100;
const limitIndex = args.indexOf('--limit');
if (limitIndex !== -1 && args[limitIndex + 1]) {
  const parsedLimit = parseInt(args[limitIndex + 1], 10);
  if (!isNaN(parsedLimit)) {
    limit = parsedLimit;
  }
}

if (!isLocal && !isRemote) {
  console.error('Error: Please specify database target using --local or --remote');
  console.log('Usage:\n  node enrich_inventory.js < --local | --remote > [--trial] [--limit 100]');
  process.exit(1);
}

const dbFlag = isLocal ? '--local' : '--remote';

// SQL escaping helper
function escapeSql(val) {
  if (val === undefined || val === null || val === '') {
    return 'NULL';
  }
  return "'" + String(val).replace(/'/g, "''") + "'";
}

// Fetch with automatic retry for 429 rate limits
async function fetchWithRetry(url, options = {}, retries = 3, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    const resp = await fetch(url, options);
    if (resp.status === 429) {
      const retryAfter = resp.headers.get('Retry-After');
      // Discogs Retry-After is in seconds, fallback to exponential backoff if not present
      const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay * Math.pow(2, i);
      console.warn(`  [429 Too Many Requests] Rate limited. Waiting ${waitTime / 1000}s before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }
    return resp;
  }
  throw new Error(`Rate limited by Discogs API after ${retries} retries.`);
}

// Fetch and get first release ID helper
async function fetchAndGetFirstReleaseId(url, headers, token) {
  if (token) {
    const resp = await fetchWithRetry(url, { headers });
    if (!resp.ok) {
      console.error(`  Discogs Search API returned status: ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    if (data.results && data.results.length > 0) {
      return data.results[0].id;
    }
  } else {
    // Fallback web scraper for search
    const resp = await fetchWithRetry(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!resp.ok) {
      console.error(`  Public Discogs search page returned status: ${resp.status}`);
      return null;
    }
    const html = await resp.text();
    // Match links like "/release/6872273-Adeva-Love-Or-Lust"
    const match = html.match(/\/release\/(\d+)/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

// Search Discogs release ID by criteria
async function searchDiscogs(artist, title, format, barcode, description, token) {
  const headers = {
    'User-Agent': 'ForeverYoungStaffPortal/1.0 +https://www.foreveryoungrecords.com'
  };

  // 1. Try Barcode search if available
  if (barcode) {
    const cleanBarcode = barcode.replace(/[^0-9X]/gi, '');
    if (cleanBarcode) {
      console.log(`  Searching Discogs by barcode: "${cleanBarcode}"...`);
      let url;
      if (token) {
        url = `https://api.discogs.com/database/search?barcode=${encodeURIComponent(cleanBarcode)}&token=${token}`;
      } else {
        url = `https://www.discogs.com/search/?q=${encodeURIComponent(cleanBarcode)}&type=release`;
      }
      try {
        const releaseId = await fetchAndGetFirstReleaseId(url, headers, token);
        if (releaseId) return releaseId;
      } catch (e) {
        console.error(`  Barcode search error:`, e.message);
      }
    }
  }

  // 2. Try to extract catalog number from description
  let catno = '';
  if (description && description.includes(' - ')) {
    const parts = description.split(' - ');
    const lastPart = parts[parts.length - 1].trim();
    if (!/out of print/i.test(lastPart) && !/factory sealed/i.test(lastPart) && lastPart.length < 30) {
      const words = lastPart.split(' ');
      const possibleCat = words[words.length - 1].trim();
      if (possibleCat && possibleCat.length > 2 && /[0-9A-Z]/i.test(possibleCat)) {
        catno = possibleCat;
      }
    }
  }

  if (catno) {
    console.log(`  Searching Discogs by extracted catalog number: "${catno}"...`);
    let url;
    if (token) {
      url = `https://api.discogs.com/database/search?catno=${encodeURIComponent(catno)}&token=${token}`;
    } else {
      url = `https://www.discogs.com/search/?q=${encodeURIComponent(catno)}&type=release`;
    }
    try {
      const releaseId = await fetchAndGetFirstReleaseId(url, headers, token);
      if (releaseId) return releaseId;
    } catch (e) {
      console.error(`  Catalog number search error:`, e.message);
    }
  }

  // 3. Try Artist + Title Search
  console.log(`  Searching Discogs by Artist + Title + Format: "${artist} - ${title} [${format}]"...`);
  let query = `${artist} ${title}`;
  let url;
  if (token) {
    url = `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=release&format=${encodeURIComponent(format)}&token=${token}`;
  } else {
    url = `https://www.discogs.com/search/?q=${encodeURIComponent(query + ' ' + format)}&type=release`;
  }
  try {
    const releaseId = await fetchAndGetFirstReleaseId(url, headers, token);
    if (releaseId) return releaseId;
  } catch (e) {
    console.error(`  Artist + Title search error:`, e.message);
  }

  return null;
}

// Fetch full details of a release ID
async function fetchReleaseDetails(releaseId, token) {
  const url = `https://api.discogs.com/releases/${releaseId}${token ? `?token=${token}` : ''}`;
  const resp = await fetchWithRetry(url, {
    headers: {
      'User-Agent': 'ForeverYoungStaffPortal/1.0 +https://www.foreveryoungrecords.com'
    }
  });

  if (!resp.ok) {
    throw new Error(`Discogs Release details API returned: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();

  // Map fields (aligns 100% with functions/api/discogs-lookup.js logic)
  const artistStr = data.artists 
    ? data.artists.map(a => a.name.replace(/\s*\(\d+\)$/, '')).join(', ') 
    : '';

  const titleStr = data.title || '';

  let formatStr = '';
  if (data.formats && data.formats.length > 0) {
    formatStr = data.formats.map(f => {
      const qtyPrefix = f.qty && parseInt(f.qty, 10) > 1 ? `${f.qty}x ` : '';
      const descSuffix = f.descriptions ? ` (${f.descriptions.join(', ')})` : '';
      return `${qtyPrefix}${f.name}${descSuffix}`;
    }).join(', ');
  }

  const genreList = [];
  if (data.genres) genreList.push(...data.genres);
  if (data.styles) genreList.push(...data.styles);
  const genreStr = [...new Set(genreList)].join(', ');

  const labelStr = data.labels ? data.labels.map(l => l.name).join(', ') : '';
  const catalogStr = data.labels ? data.labels.map(l => l.catno).join(', ') : '';
  const countryStr = data.country || '';
  const dateStr = data.released || (data.year ? String(data.year) : '');

  let barcodeStr = '';
  if (data.identifiers) {
    const barcodeObj = data.identifiers.find(i => i.type === 'barcode');
    if (barcodeObj && barcodeObj.value) {
      barcodeStr = barcodeObj.value.replace(/[^0-9X]/gi, '');
    }
  }

  let frontImg = '';
  let backImg = '';
  if (data.images && data.images.length > 0) {
    const primary = data.images.find(img => img.type === 'primary');
    frontImg = primary ? primary.resource_url : data.images[0].resource_url;
    
    const secondary = data.images.filter(img => img.type !== 'primary');
    if (secondary.length > 0) {
      backImg = secondary[0].resource_url;
    }
  }

  let youtubeStr = '';
  if (data.videos) {
    youtubeStr = data.videos.map(v => v.uri).join(', ');
  }

  let numInSet = '';
  if (data.formats) {
    const totalQty = data.formats.reduce((sum, f) => sum + (parseInt(f.qty, 10) || 0), 0);
    if (totalQty > 0) {
      numInSet = String(totalQty);
    }
  }

  const descLines = [];
  if (data.tracklist && data.tracklist.length > 0) {
    descLines.push("TRACKLIST:");
    data.tracklist.forEach(t => {
      if (t.title) {
        const pos = t.position ? `${t.position}. ` : '';
        const dur = t.duration ? ` (${t.duration})` : '';
        descLines.push(`${pos}${t.title}${dur}`);
      }
    });
  }
  if (data.notes) {
    if (descLines.length > 0) descLines.push("");
    descLines.push("RELEASE NOTES:");
    descLines.push(data.notes);
  }
  const descriptionStr = descLines.join('\n');

  return {
    Discogs_ID: String(data.id),
    Discogs_url: `https://www.discogs.com/release/${data.id}`,
    Bar_Code: barcodeStr,
    Front_Image_URL: frontImg,
    Back_Image_URL: backImg,
    Label: labelStr,
    Release_Catalog_Number: catalogStr,
    Release_Country: countryStr,
    Release_Date: dateStr,
    Genre: genreStr,
    YouTube_Audio_Image_URLs: youtubeStr,
    Number_In_Set: numInSet,
    Description: descriptionStr
  };
}

async function run() {
  console.log(`--- Running Discogs Batch Enrichment (${isLocal ? 'Local' : 'Remote'} DB) ---`);
  if (isTrial) {
    console.log(`Trial Mode active: Only targeting rows where id <= 2100`);
  }
  console.log(`Batch size limit: ${limit}`);
  
  if (DISCOGS_TOKEN) {
    console.log('Discogs Token: Configured (Official search API will be used).');
  } else {
    console.log('Discogs Token: NOT configured. Falling back to public web scraper lookup.');
  }

  // 1. Query items that need enrichment
  let query = 'SELECT id, Artist, Title, Format, Seller_Reference_Number, Description, Bar_Code FROM Online_Inventory WHERE Discogs_ID IS NULL';
  if (isTrial) {
    query += ' AND id <= 2100';
  }
  query += ` LIMIT ${limit};`;

  let items = [];
  try {
    const rawOutput = execSync(`npx wrangler d1 execute foreveryoung-db ${dbFlag} --command "${query}" --json`, { encoding: 'utf8' });
    const parsed = JSON.parse(rawOutput);
    items = parsed[0]?.results || [];
  } catch (err) {
    console.error('Failed to query Online_Inventory from D1:', err.message);
    process.exit(1);
  }

  console.log(`Found ${items.length} items requiring Discogs enrichment.`);
  if (items.length === 0) {
    console.log('No work to do. Exiting.');
    return;
  }

  const updatesSql = [];
  let successfulEnrichments = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`\n[${i + 1}/${items.length}] Processing ID: ${item.id} - ${item.Artist} - ${item.Title} (${item.Format})...`);

    try {
      // Lookup release on Discogs
      const releaseId = await searchDiscogs(
        item.Artist, 
        item.Title, 
        item.Format, 
        item.Bar_Code, 
        item.Description, 
        DISCOGS_TOKEN
      );

      if (!releaseId) {
        console.log(`  x No match found on Discogs for ID: ${item.id}`);
        continue;
      }

      console.log(`  ✓ Found Release ID: ${releaseId}. Fetching details...`);
      
      // Delay to respect rate limit before detail fetch
      await new Promise(resolve => setTimeout(resolve, 2500));

      const details = await fetchReleaseDetails(releaseId, DISCOGS_TOKEN);
      console.log(`  ✓ Details fetched. Mapping metadata...`);

      // Write UPDATE query
      const sql = `UPDATE Online_Inventory SET 
        Discogs_ID = ${escapeSql(details.Discogs_ID)},
        Discogs_url = ${escapeSql(details.Discogs_url)},
        Bar_Code = COALESCE(NULLIF(NULLIF(Bar_Code, ''), 'NULL'), ${escapeSql(details.Bar_Code)}),
        Front_Image_URL = COALESCE(NULLIF(NULLIF(Front_Image_URL, ''), 'NULL'), ${escapeSql(details.Front_Image_URL)}),
        Back_Image_URL = COALESCE(NULLIF(NULLIF(Back_Image_URL, ''), 'NULL'), ${escapeSql(details.Back_Image_URL)}),
        Label = COALESCE(NULLIF(NULLIF(Label, ''), 'NULL'), ${escapeSql(details.Label)}),
        Release_Catalog_Number = COALESCE(NULLIF(NULLIF(Release_Catalog_Number, ''), 'NULL'), ${escapeSql(details.Release_Catalog_Number)}),
        Release_Country = COALESCE(NULLIF(NULLIF(Release_Country, ''), 'NULL'), ${escapeSql(details.Release_Country)}),
        Release_Date = COALESCE(NULLIF(NULLIF(Release_Date, ''), 'NULL'), ${escapeSql(details.Release_Date)}),
        Genre = COALESCE(NULLIF(NULLIF(Genre, ''), 'NULL'), ${escapeSql(details.Genre)}),
        YouTube_Audio_Image_URLs = COALESCE(NULLIF(NULLIF(YouTube_Audio_Image_URLs, ''), 'NULL'), ${escapeSql(details.YouTube_Audio_Image_URLs)}),
        Number_In_Set = COALESCE(NULLIF(NULLIF(Number_In_Set, ''), 'NULL'), ${escapeSql(details.Number_In_Set)}),
        Description = COALESCE(NULLIF(NULLIF(Description, ''), 'NULL'), ${escapeSql(details.Description)})
      WHERE id = ${item.id};`;

      updatesSql.push(sql);
      successfulEnrichments++;

    } catch (err) {
      console.error(`  x Error processing item ID ${item.id}:`, err.message);
    }
  }

  console.log(`\nEnrichment phase complete. ${successfulEnrichments} of ${items.length} items successfully matched.`);

  if (updatesSql.length > 0) {
    // Write updates SQL to a file and execute it in a single wrangler call
    const updatesFile = path.join(__dirname, 'db_batches', 'temp_updates.sql');
    
    // Ensure db_batches folder exists
    if (!fs.existsSync(path.dirname(updatesFile))) {
      fs.mkdirSync(path.dirname(updatesFile), { recursive: true });
    }

    fs.writeFileSync(updatesFile, `${updatesSql.join('\n')}`, 'utf8');

    console.log(`Executing batch updates file (${updatesFile}) on D1 database...`);
    try {
      execSync(`npx wrangler d1 execute foreveryoung-db ${dbFlag} --file="${updatesFile}"`, { stdio: 'inherit' });
      console.log('✓ Database updated successfully!');
      fs.unlinkSync(updatesFile); // Clean up temp file
    } catch (err) {
      console.error('x Failed to execute updates on D1:', err.message);
    }
  } else {
    console.log('No updates to perform.');
  }

  console.log('\nProcess finished successfully!');
}

run().catch(console.error);
