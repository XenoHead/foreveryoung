export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const db = env.DB;
    const url = new URL(request.url);
    const type = url.searchParams.get('type');

    await db.prepare(`CREATE TABLE IF NOT EXISTS Settings (key TEXT PRIMARY KEY, value TEXT)`).run();

    // Ensure a default crate_config exists so UI doesn't rely on hard-coded defaults
    const existingConfig = await db.prepare(`SELECT value FROM Settings WHERE key='crate_config'`).first();
    if (!existingConfig) {
      const defaultConfig = {
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
      await db.prepare(`INSERT INTO Settings (key, value) VALUES ('crate_config', ?)`).bind(JSON.stringify(defaultConfig)).run();
    }

    if (type === 'config') {
      const row = await db.prepare(`SELECT value FROM Settings WHERE key='crate_config'`).first();
      const config = row ? JSON.parse(row.value || '{}') : {};
      const body = JSON.stringify({ success: true, config });
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "max-age=300" }
      });
    }


    // Fetch values for new, new_releases, instore, online, hot, rare, temp1, temp2, temp3, temp4, temp5, genres crates

    // Serve from a JSON snapshot in Settings if available, so page loads are instant.
    const crateCacheRow = await db.prepare("SELECT value FROM Settings WHERE key = 'featured_cache_snapshot'").first();
    if (crateCacheRow && crateCacheRow.value) {
      try {
        const snapshot = JSON.parse(crateCacheRow.value);
        if (snapshot && snapshot.results) {
          // Refresh snapshot in background
          context.waitUntil(rebuildCrateCache(db, context).catch(() => {}));
          const body = JSON.stringify({ success: true, results: snapshot.results });
          return new Response(body, {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "X-Crate-Cache": "snapshot"
            }
          });
        }
      } catch (e) {
        console.log('Failed to parse snapshot', e);
      }
    }

    // No snapshot yet. Return empty crates immediately so the page never hangs,
    // and trigger a background rebuild so the next refresh serves real data.
    context.waitUntil(rebuildCrateCache(db, context).catch(() => {}));
    const emptyResults = { new: [], new_releases: [], instore: [], online: [], hot: [], rare: [], temp1: [], temp2: [], temp3: [], temp4: [], temp5: [], genres: [] };
    const body = JSON.stringify({ success: true, results: emptyResults });
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "X-Crate-Cache": "empty-warmup"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

async function rebuildCrateCache(db, context) {
  const results = { new: [], new_releases: [], instore: [], online: [], hot: [], rare: [], temp1: [], temp2: [], temp3: [], temp4: [], temp5: [], genres: [] };
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