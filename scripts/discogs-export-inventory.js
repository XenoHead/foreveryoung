/**
 * Discogs inventory export script
 *
 * Fetches all marketplace listings for a Discogs user, with polite throttling
 * and retry logic. Writes the raw inventory data to a timestamped JSON file.
 *
 * Required environment variables:
 *   DISCOGS_USER_TOKEN   - Personal access token from
 *                          https://www.discogs.com/settings/developers
 *   DISCOGS_USERNAME     - Your Discogs username
 *
 * Optional environment variables:
 *   DISCOGS_OUTPUT_DIR   - Where to write the JSON file (default: ./data)
 *   DISCOGS_STATUS       - Filter by status: For Sale, Draft, Expired
 *                          (default: For Sale)
 *
 * Usage:
 *   node scripts/discogs-export-inventory.js
 *
 * Rate limits (conservative):
 *   - Inventory endpoint: ~25 req/min
 *   - Other endpoints:     ~60 req/min
 *   This script waits ~2.5s between inventory requests.
 */

const fs = require('fs');
const path = require('path');

const DISCOGS_API_BASE = 'https://api.discogs.com';
const REQUEST_DELAY_MS = 2500; // stay well under the 25/min inventory limit
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;
const USER_AGENT = 'ForeverYoungRecords/1.0 +https://www.foreveryoungrecords.com';

function getEnv(name, required = false) {
  const value = process.env[name];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}, retries = 0) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 429) {
    if (retries < MAX_RETRIES) {
      const wait = RETRY_DELAY_MS * (retries + 1);
      console.warn(`  Rate limited. Waiting ${wait}ms before retry ${retries + 1}/${MAX_RETRIES}...`);
      await sleep(wait);
      return fetchJson(url, options, retries + 1);
    }
    throw new Error(`Discogs API rate limit exceeded after ${MAX_RETRIES} retries.`);
  }

  if (response.status === 401) {
    throw new Error(`Discogs API authentication failed. Check DISCOGS_USER_TOKEN.`);
  }

  if (response.status === 403) {
    throw new Error(`Discogs API forbidden. Ensure your token has marketplace permissions.`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discogs API error ${response.status}: ${response.statusText}\n${text}`);
  }

  return response.json();
}

async function fetchInventoryPage(username, status, token, page = 1, perPage = 100) {
  const params = new URLSearchParams({
    status,
    page: String(page),
    per_page: String(perPage),
  });

  const url = `${DISCOGS_API_BASE}/users/${encodeURIComponent(username)}/inventory?${params}`;
  return fetchJson(url, {
    headers: {
      Authorization: `Discogs token=${token}`,
    },
  });
}

async function exportInventory() {
  const token = getEnv('DISCOGS_TOKEN', true);
  const username = getEnv('DISCOGS_USERNAME', true);
  const status = getEnv('DISCOGS_STATUS') || 'For Sale';
  const outputDir = getEnv('DISCOGS_OUTPUT_DIR') || path.join(__dirname, '..', 'data');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Fetching Discogs inventory for user "${username}" (status: ${status})...`);

  const listings = [];
  let page = 1;
  let totalPages = 1;
  let totalItems = 0;

  do {
    console.log(`  Fetching page ${page}/${totalPages === 1 ? '?' : totalPages}...`);
    const data = await fetchInventoryPage(username, status, token, page);

    if (data.listings && data.listings.length) {
      listings.push(...data.listings);
    }

    totalItems = data.pagination?.items ?? listings.length;
    totalPages = data.pagination?.pages ?? page;
    const perPage = data.pagination?.per_page ?? 0;

    console.log(`  Got ${data.listings?.length ?? 0} listings (running total: ${listings.length}/${totalItems})`);

    if (page < totalPages) {
      await sleep(REQUEST_DELAY_MS);
    }
    page += 1;

    // Safety valve: if per_page * pages diverges from items, stop after a hard cap
    if (page > 1000) {
      console.warn('  Reached hard page limit (1000). Stopping.');
      break;
    }
  } while (page <= totalPages);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `discogs-inventory-${username}-${status.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.json`;
  const outputPath = path.join(outputDir, filename);

  const exportData = {
    exported_at: new Date().toISOString(),
    username,
    status,
    total_items: totalItems,
    returned_items: listings.length,
    listings,
  };

  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));

  console.log('\nExport complete.');
  console.log(`  Total listings: ${listings.length}`);
  console.log(`  Output file: ${outputPath}`);
}

exportInventory().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
