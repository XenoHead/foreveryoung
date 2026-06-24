// functions/api/inventory-update.js
export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const db = env.DB;

    const data = await request.json();
    const id = data.id;

    if (!id) {
      return new Response(JSON.stringify({ error: "Missing item ID for update." }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Prepare standard SQL UPDATE query for Online_Inventory
    const query = `
      UPDATE Online_Inventory
      SET Artist = ?,
          Title = ?,
          Format = ?,
          Price = ?,
          Quantity = ?,
          Genre = ?,
          Label = ?,
          Release_Catalog_Number = ?,
          Release_Country = ?,
          Release_Date = ?,
          Bar_Code = ?,
          Discogs_ID = ?,
          Seller_Reference_Number = ?,
          Condition_Media = ?,
          Condition_Sleeve = ?,
          Description = ?
      WHERE id = ?
    `;

    const stmt = db.prepare(query);
    const result = await stmt.bind(
      data.Artist || '',
      data.Title || '',
      data.Format || '',
      parseFloat(data.Price) || 0.0,
      parseInt(data.Quantity, 10) || 0,
      data.Genre || '',
      data.Label || '',
      data.Release_Catalog_Number || '',
      data.Release_Country || '',
      data.Release_Date || '',
      data.Bar_Code || '',
      data.Discogs_ID || '',
      data.Seller_Reference_Number || '',
      data.Condition_Media || '',
      data.Condition_Sleeve || '',
      data.Description || '',
      id
    ).run();

    return new Response(JSON.stringify({ success: true, meta: result.meta }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
