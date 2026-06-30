export async function onRequestGet(context) {
  try {
    const { env } = context;
    const db = env.DB;
    
    // Fetch values for new, new_releases, hot, rare, temp1, temp2, genres crates
    const results = { new: [], new_releases: [], hot: [], rare: [], temp1: [], temp2: [], genres: [] };
    const keys = ["new", "new_releases", "hot", "rare", "temp1", "temp2", "genres"];
    
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
              Price: parseFloat(item.SRP) || 0.00,
              Bar_Code: item.UPC,
              Quantity: item.Quantity,
              _source: 'instore'
            }));
          }
          
          items = [...onlineItems, ...instoreItems];
        }
      }
      results[k] = items;
    }
    
    // Fallback logic if any crate is empty
    for (const k of keys) {
      if (results[k].length === 0) {
        // Fallback: load latest 6 items
        const fallbackResult = await db.prepare(`
          SELECT * FROM Online_Inventory 
          WHERE Seller_Reference_Number IS NOT NULL AND Seller_Reference_Number != ''
          ORDER BY id DESC LIMIT 6
        `).all();
        results[k] = (fallbackResult.results || []).map(item => ({ ...item, _source: 'online' }));
      }
    }
    
    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}