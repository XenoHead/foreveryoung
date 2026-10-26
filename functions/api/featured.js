// How long a built snapshot stays valid, in ms. 5 minutes.
const CACHE_TTL_MS = 5 * 60 * 1000;

const DEFAULT_CONFIG = {
  names: {
    new: 'New',
    new_releases: 'New Releases',
    instore: 'In Store',
    online: 'Online',
    hot: 'Hot',
    rare: 'Rare',
    temp1: 'Temp 1',
    temp2: 'Temp 2',
    temp3: 'Temp 3',
    temp4: 'Temp 4',
    temp5: 'Temp 5',
    genres: 'Genres'
  },
  new_enabled: true,
  new_releases_enabled: true,
  instore_enabled: true,
  online_enabled: true,
  hot_enabled: true,
  rare_enabled: true,
  genres_enabled: true,
  temp1_enabled: false,
  temp2_enabled: false,
  temp3_enabled: false,
  temp4_enabled: false,
  temp5_enabled: false
};

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const db = env.DB;
    const url = new URL(request.url);
    const type = url.searchParams.get('type');

    const configJson = await ensureSettings(db);

    if (type === 'config') {
      const config = JSON.parse(configJson || '{}');
      const body = JSON.stringify({ success: true, config });
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "max-age=300" }
      });
    }

    // Serve the snapshot while it is younger than CACHE_TTL_MS; only then rebuild.
    const crateCacheRow = await db.prepare("SELECT value FROM Settings WHERE key = 'featured_cache_snapshot'").first();
    let snapshot = null;
    if (crateCacheRow && crateCacheRow.value) {
      try {
        const parsed = JSON.parse(crateCacheRow.value);
        if (parsed && parsed.results) snapshot = parsed;
      } catch (e) {
        console.log('Failed to parse snapshot', e);
      }
    }

    const age = snapshot && snapshot.updated ? Date.now() - snapshot.updated : Infinity;
    if (snapshot && age < CACHE_TTL_MS) {
      return snapshotResponse(snapshot.results, 'snapshot');
    }

    // Stale or missing. Only one request per TTL window may rebuild, so a burst of
    // traffic after expiry cannot fan out into a dozen rebuilds.
    const claimed = await claimRebuild(db);

    if (snapshot) {
      // Warm but stale: answer immediately, refresh in the background.
      if (claimed) context.waitUntil(rebuildCrateCache(db).catch(() => {}));
      return snapshotResponse(snapshot.results, 'stale-snapshot');
    }

    // Cold cache: nothing to serve, so build inline for this one request.
    if (claimed) {
      const results = await rebuildCrateCache(db).catch(() => null);
      if (results) return snapshotResponse(results, 'rebuilt');
    }

    // No snapshot and we did not win the claim: let this request go empty rather
    // than queue up behind someone else's rebuild.
    return snapshotResponse(EMPTY_RESULTS(), 'empty-warmup');
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// How long a built snapshot stays valid, in ms. 5 minutes.
function EMPTY_RESULTS() {
  return { new: [], new_releases: [], instore: [], online: [], hot: [], rare: [], temp1: [], temp2: [], temp3: [], temp4: [], temp5: [], genres: [] };
}

function snapshotResponse(results, cacheState) {
  return new Response(JSON.stringify({ success: true, results }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "X-Crate-Cache": cacheState
    }
  });
}

// One conditional write acts as a lock: it succeeds only if the last claim is older
// than the TTL. Returns true for the single caller that wins it.
async function claimRebuild(db) {
  const now = Date.now();
  try {
    const res = await db.prepare(
      `INSERT INTO Settings (key, value) VALUES ('featured_cache_lock', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value
       WHERE CAST(Settings.value AS INTEGER) < ?`
    ).bind(now, now - CACHE_TTL_MS).run();
    return !!(res.meta && res.meta.changes > 0);
  } catch (e) {
    console.log('Failed to claim rebuild', e);
    return false;
  }
}

// Reads crate_config, creating the table and the default config only when they are
// actually missing. The old code ran CREATE TABLE + two writes on every request.
async function ensureSettings(db) {
  try {
    const row = await db.prepare("SELECT value FROM Settings WHERE key='crate_config'").first();
    if (row && row.value) return row.value;
  } catch (e) {
    // Settings table not created yet; fall through.
  }

  await db.prepare(`CREATE TABLE IF NOT EXISTS Settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  const seed = JSON.stringify(DEFAULT_CONFIG);
  await db.prepare(`INSERT INTO Settings (key, value) VALUES ('crate_config', ?) ON CONFLICT(key) DO NOTHING`).bind(seed).run();
  const row = await db.prepare("SELECT value FROM Settings WHERE key='crate_config'").first();
  return (row && row.value) || seed;
}

async function rebuildCrateCache(db) {
  const results = EMPTY_RESULTS();
  const keys = ["new", "new_releases", "instore", "online", "hot", "rare", "temp1", "temp2", "temp3", "temp4", "temp5", "genres"];

  for (const k of keys) {
    const setting = await db.prepare("SELECT value FROM Settings WHERE key = ?").bind("featured_" + k).first();
    let items = [];
    if (setting && setting.value) {
      const refs = setting.value.split(',').map(r => r.trim()).filter(r => r.length > 0);
      if (refs.length > 0) {
        // 1. Fetch from Online_Inventory
        const placeholders = refs.map(() => '?').join(',');
        const query = `SELECT * FROM Online_Inventory WHERE Seller_Reference_Number IN (${placeholders}) OR Bar_Code IN (${placeholders})`;
        const result = await db.prepare(query).bind(...refs, ...refs).all();

        const onlineItems = (result.results || []).map(item => ({ ...item, _source: 'online' }));

        // Identify missing references/UPCs
        const foundRefs = new Set();
        onlineItems.forEach(item => {
          if (item.Seller_Reference_Number) foundRefs.add(item.Seller_Reference_Number.toLowerCase());
          if (item.Bar_Code) foundRefs.add(item.Bar_Code.toLowerCase());
        });

        const missingRefs = refs.filter(r => !foundRefs.has(r.toLowerCase()));
        let instoreItems = [];

        if (missingRefs.length > 0) {
          // 2. Fetch from Inventory (In-Store)
          // Guarded: the live Inventory table is a 6-column skeleton without Vendor_Number,
          // so this query fails today. A failure here must not discard the whole snapshot.
          try {
            const instorePlaceholders = missingRefs.map(() => '?').join(',');
            const instoreQuery = `SELECT * FROM Inventory WHERE UPC IN (${instorePlaceholders}) OR Vendor_Number IN (${instorePlaceholders})`;
            const instoreResult = await db.prepare(instoreQuery).bind(...missingRefs, ...missingRefs).all();

            instoreItems = (instoreResult.results || []).map(item => ({
              id: item.id,
              Artist: item.Artist,
              Title: item.Title,
              Format: item.Format,
              Price: parseFloat((item.SRP || '').replace(/[^0-9.]/g, '')) || 0.00,
              SRP: item.SRP || '',
              Bar_Code: item.UPC,
              UPC: item.UPC || '',
              Quantity: item.Quantity,
              Vendor: item.Vendor || '',
              Vendor_Number: item.Vendor_Number || '',
              Year: item.Year || '',
              OOP: item.OOP || '',
              Genre: item.Genre || '',
              Country: item.Country || '',
              Front_Image_URL: item.Image_URL || item.Front_Image_URL || '',
              Image_URL: item.Image_URL || item.Front_Image_URL || '',
              _source: 'instore'
            }));
          } catch (e) {
            console.log('In-store lookup skipped (schema mismatch):', e.message);
            instoreItems = [];
          }
        }

        items = [...onlineItems, ...instoreItems];
      }
    }
    results[k] = items;
  }

  // Persist snapshot
  try {
    await db.prepare(`INSERT INTO Settings (key, value) VALUES ('featured_cache_snapshot', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(JSON.stringify({ results, updated: Date.now() })).run();
  } catch (e) {
    console.log('Failed to save snapshot', e);
  }

  return results;
}
