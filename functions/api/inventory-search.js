// functions/api/inventory-search.js
export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const db = env.DB;

    const upc = url.searchParams.get('upc') || '';
    const artist = url.searchParams.get('artist') || '';
    const title = url.searchParams.get('album') || ''; // Map 'album' from UI to 'Title'
    const catalog = url.searchParams.get('catalog') || ''; // Map 'catalog' from UI to 'Vendor_Number' or 'Vendor'
    const generalQuery = url.searchParams.get('query') || '';

    const sortOrder = url.searchParams.get('sort') || 'asc';
    if (!upc && !artist && !title && !catalog && !generalQuery) {
      return new Response(JSON.stringify({ error: "At least one search parameter must be provided." }), { status: 400 });
    }

    let query = "SELECT * FROM Inventory WHERE 1=1 AND Quantity > 0";
    let bindParams = [];

    const exactVal = url.searchParams.get('exact') === 'true';
    const wildcard = exactVal ? '' : '%';

    if (upc) {
      query += " AND UPC LIKE ?";
      bindParams.push(`${wildcard}${upc}${wildcard}`);
    }
    if (artist) {
      query += " AND Artist LIKE ?";
      bindParams.push(`${wildcard}${artist}${wildcard}`);
    }
    if (title) {
      query += " AND Title LIKE ?";
      bindParams.push(`${wildcard}${title}${wildcard}`);
    }
    if (catalog) {
      query += " AND (Vendor LIKE ? OR Vendor_Number LIKE ?)";
      bindParams.push(`${wildcard}${catalog}${wildcard}`, `${wildcard}${catalog}${wildcard}`);
    }
    if (generalQuery) {
      query += " AND (Artist LIKE ? OR Title LIKE ? OR UPC LIKE ? OR Vendor LIKE ?)";
      bindParams.push(`${wildcard}${generalQuery}${wildcard}`, `${wildcard}${generalQuery}${wildcard}`, `${wildcard}${generalQuery}${wildcard}`, `${wildcard}${generalQuery}${wildcard}`);
    }

    // Add sorting logic
    const order = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    query += ` ORDER BY Artist ${order}, Title ${order}`;

    query += " LIMIT 50"; // Limit results for safety and performance

    const stmt = db.prepare(query);
    const finalStmt = bindParams.length > 0 ? stmt.bind(...bindParams) : stmt;
    const results = await finalStmt.all();

    const mappedResults = results.results.map(item => {
      const cleanPrice = (item.SRP) ? parseFloat(item.SRP.replace(/[^0-9.]/g, '')) : 0.00;
      return {
        id: item.id,
        Artist: item.Artist || '',
        Title: item.Title || '',
        Format: item.Format || '',
        Price: isNaN(cleanPrice) ? 0.00 : cleanPrice,
        Quantity: item.Quantity !== null ? item.Quantity : 0,
        Bar_Code: item.UPC || 'N/A',
        Release_Catalog_Number: item.Vendor_Number || 'N/A',
        Vendor: item.Vendor || '',
        Label: item.Vendor || 'N/A',
        Release_Country: 'N/A',
        Release_Date: item.Year || 'N/A',
        Genre: 'N/A',
        Discogs_ID: 'N/A',
        Condition_Media: 'N/A',
        Condition_Sleeve: 'N/A',
        Description: 'N/A',
        Front_Image_URL: '', // No images for in-store items
        Back_Image_URL: '',
        _source: 'instore' // Add source to identify in-store items
      };
    });

    return new Response(JSON.stringify({ success: true, results: mappedResults }), {
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
