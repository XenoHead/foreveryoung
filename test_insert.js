const https = require("https");
const token = "cfat_0pOJm0tuSNvfuduZW685JWONz2njcUrDE4ZEuLA6ce4632d3";
const accountId = "5ea78a3d3e41e851763e229630e62c94";
const dbId = "93ac3813-324e-4ee5-b6d8-68f31955e06b";

function doD1(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ sql });
    const opts = {
      hostname: "api.cloudflare.com",
      port: 443,
      path: "/accounts/" + accountId + "/d1/database/" + dbId,
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    };
    const req = https.request(opts, (res) => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => resolve(JSON.parse(body)));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const testSql = "INSERT INTO Online_Inventory (Artist, Title, Format, Price, Listing_ID, Status, Accept_Offer, Weight, Format_Quantity) VALUES ('Test', 'Test', 'CD', 9.99, 'L123', 'Used', 'N', 0.5, 1)";
  console.log("Testing INSERT...");
  let r = await doD1(testSql);
  console.log("Result:", JSON.stringify(r, null, 2));
  
  r = await doD1("SELECT COUNT(*) as cnt FROM Online_Inventory");
  console.log("Count:", JSON.stringify(r));
  
  r = await doD1("SELECT Artist, Title, Price, Listing_ID, Status, Accept_Offer, Weight, Format_Quantity FROM Online_Inventory LIMIT 1");
  console.log("Row:", JSON.stringify(r));
}

main().catch(e => console.error(e.stack));
