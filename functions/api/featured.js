export async function onRequestGet(context) {
  try {
    const { env } = context;
    const db = env.DB;
    
    // 1. Get the featured references setting
    const setting = await db.prepare("SELECT value FROM Settings WHERE key = ?").bind("featured_items").first();
    
    let items = [];
    if (setting && setting.value) {
      const refs = setting.value.split(',').map(r => r.trim()).filter(r => r.length > 0);
      if (refs.length > 0) {
        const placeholders = refs.map(() => '?').join(',');
        const query = `SELECT * FROM Online_Inventory WHERE Seller_Reference_Number IN (${placeholders}) OR Bar_Code IN (${placeholders})`;
        const result = await db.prepare(query).bind(...refs, ...refs).all();
        items = result.results;
      }
    }
    
    // Fallback: If no items found, return 6 default items
    if (items.length === 0) {
      const fallbackResult = await db.prepare(`
        SELECT * FROM Online_Inventory 
        WHERE Seller_Reference_Number IS NOT NULL AND Seller_Reference_Number != ''
        ORDER BY id DESC LIMIT 6
      `).all();
      items = fallbackResult.results;
    }
    
    return new Response(JSON.stringify({ success: true, results: items }), {
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
