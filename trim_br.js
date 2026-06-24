const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

const dbName = 'foreveryoung-db';
const tableName = 'Online_Inventory';
const keyColumn = 'id';
const columnToClean = 'Description';
const pageSize = 500;

async function processItems(items) {
    const updates = [];
    const trailingBrRegex = /(<br>\s*)+$/i; // Case-insensitive for <BR>

    for (const item of items) {
        let { [keyColumn]: id, [columnToClean]: description } = item;
        let changed = false;
        
        let newDescription = description;
        if (newDescription && trailingBrRegex.test(newDescription)) {
            newDescription = newDescription.replace(trailingBrRegex, '');
            changed = true;
        }

        if (changed) {
            console.log(`\n--- Item ID ${id} ---`);
            console.log(`  Description old: "${description}"`);
            console.log(`  Description new: "${newDescription}"`);

            const newDescForSql = (newDescription === null || newDescription === undefined) ? "NULL" : `'${(newDescription || '').replace(/'/g, "''")}'`;

            updates.push(`UPDATE ${tableName} SET ${columnToClean} = ${newDescForSql} WHERE ${keyColumn} = ${id};`);
        }
    }

    if (updates.length > 0) {
        console.log(`\nFound ${updates.length} items to update in this batch.`);
        console.log("I will now perform the updates for this batch.");
        
        for (const update of updates) {
            console.log(`Executing: ${update}`);
            try {
                const { stdout: updateOut, stderr: updateErr } = await execPromise(`wrangler d1 execute ${dbName} --command "${update}"`);
                if (updateErr && !updateErr.includes("🌀") && !updateErr.includes("D1_EXEC")) {
                     console.error(`Error updating item: ${updateErr}`);
                     console.log(`Failed command: ${update}`);
                } else {
                    console.log("Success.");
                }
            } catch(e) {
                console.error("Error executing update command:", e);
                console.log(`Failed command: ${update}`);
            }
        }
        console.log('\nFinished updating batch.');
        return updates.length;
    } else {
        console.log('No items needed updating in this batch.');
        return 0;
    }
}


async function run() {
    console.log(`Fetching data from ${tableName} table in pages of ${pageSize}...`);
    
    let offset = 0;
    let totalUpdated = 0;
    let keepFetching = true;

    while(keepFetching) {
        console.log(`\nFetching page with offset ${offset}...`);
        const command = `wrangler d1 execute ${dbName} --json --command "SELECT ${keyColumn}, ${columnToClean} FROM ${tableName} WHERE ${columnToClean} IS NOT NULL AND ${columnToClean} != '' ORDER BY ${keyColumn} LIMIT ${pageSize} OFFSET ${offset}"`;

        let stdout, stderr;
        try {
            // Increase maxBuffer as a fallback, but pagination should prevent hitting it.
            const result = await execPromise(command, { maxBuffer: 1024 * 1024 * 10 }); 
            stdout = result.stdout;
            stderr = result.stderr;
        } catch(e) {
            console.error("Error executing wrangler command:", e);
            keepFetching = false;
            break;
        }

        if (stderr && !stderr.includes("🌀") && !stderr.includes("D1_EXEC")) {
            console.error(`Wrangler error: ${stderr}`);
        }

        let results;
        try {
            results = JSON.parse(stdout);
        } catch(e) {
            console.error("Failed to parse JSON from wrangler output:", stdout);
            console.error(e);
            keepFetching = false;
            break;
        }
        
        if (!results || !results[0] || !results[0].results) {
            console.log("No results found or unexpected response structure.");
            console.log("Response:", JSON.stringify(results, null, 2));
            keepFetching = false;
            break;
        }

        const items = results[0].results;

        if (items.length === 0) {
            console.log("No more items to process.");
            keepFetching = false;
            break;
        }

        console.log(`Processing ${items.length} items from this page...`);
        const updatedInBatch = await processItems(items);
        totalUpdated += updatedInBatch;

        offset += pageSize;
    }

    console.log(`\n\nFinished processing all pages. Total items updated: ${totalUpdated}`);
}

run().catch(err => console.error(err));
