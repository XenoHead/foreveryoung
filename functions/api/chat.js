export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    if (!env.AI) {
      return new Response(JSON.stringify({ error: "Workers AI binding 'AI' not found in environment." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await request.json().catch(() => ({}));
    const { messages, pageContext } = body;
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Invalid request payload. Expected an array of 'messages'." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Build page context instructions if provided
    let contextPrompt = "";
    if (pageContext) {
      if (pageContext.viewingAlbum) {
        const album = pageContext.viewingAlbum;
        contextPrompt += `\n\n[Active Screen Context: The user is currently looking at the details for the album "${album.title}" by "${album.artist}". Detail info: format ${album.format}, price $${album.price.toFixed(2)}, genre ${album.genre}, record label ${album.label}, released in ${album.year}, in-store stock quantity: ${album.quantity}, location source: ${album.source === 'instore' ? 'In-Store Physical Inventory' : 'Online Catalog'}. If they ask questions about "this album," "this record," "this artist," or details shown on their screen, use this context to answer accurately!]`;
      } else if (pageContext.searchQuery) {
        contextPrompt += `\n\n[Active Screen Context: The user has searched the Forever Young Records catalog for "${pageContext.searchQuery}".]`;
      }
    }

    // Set system instructions to enforce the Little Dave music expert persona
    const systemPrompt = {
      role: "system",
      content: `You are Little Dave, the legendary owner, lead buyer, and record crate digger for Forever Young Records in Grand Prairie, Texas (family-owned and operated since 1984!). Your motto is: "We dont sell records, we sell a service."
You have a warm, Texan, music-obsessed personality. Start or sprinkle responses with friendly Texan/digger slang (e.g., "Howdy y'all," "Howdy partner," "rock 'n' roll," "crate digger," "groove," "spun," "mighty fine").
You know everything about music history, classic rock, punk, metal, country, obscure session musicians, pop culture memorabilia, and vinyl care.
If asked about buying or selling records at the store, mention that you're the lead buyer and they should check the 'Buying Hours' page because condition matters (clean sleeves, no deep scratches!).
Keep responses friendly, highly enthusiastic, and concise (typically 2-4 sentences). Use markdown formatting for emphasis.
If the user asks about in-store stock, finding items in our 11,000 sq ft warehouse, or directions, kindly direct them to our main search bar or Aisle GPS page.${contextPrompt}`
    };

    // Keep history clean and limit length
    const cleanedHistory = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content || ''
    }));
    
    const truncatedHistory = cleanedHistory.slice(-8); // Limit history to last 8 messages
    const apiMessages = [systemPrompt, ...truncatedHistory];

    const model = "@cf/meta/llama-3.1-8b-instruct-fast";
    const result = await env.AI.run(model, {
      messages: apiMessages
    });

    // Handle different response structures returned by AI.run
    let responseText = "";
    if (result && result.response) {
      responseText = result.response;
    } else if (typeof result === 'string') {
      responseText = result;
    } else {
      responseText = JSON.stringify(result);
    }

    return new Response(JSON.stringify({ success: true, response: responseText }), {
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
