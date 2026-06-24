-- Schema for Online_Inventory table matching MusicStack inventory headers
CREATE TABLE IF NOT EXISTS Online_Inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  Artist TEXT,
  Title TEXT,
  Format TEXT,
  Discogs_ID TEXT,
  Price REAL,
  Description TEXT,
  Condition_Media TEXT,
  Condition_Sleeve TEXT,
  Seller_Reference_Number TEXT,
  Quantity INTEGER DEFAULT 0,
  Label TEXT,
  Release_Catalog_Number TEXT,
  Release_Country TEXT,
  Release_Date TEXT,
  Genre TEXT,
  Front_Image_URL TEXT,
  Back_Image_URL TEXT,
  YouTube_Audio_Image_URLs TEXT,
  Bar_Code TEXT,
  Number_In_Set TEXT
);

-- Schema for Inventory table matching remote/production D1
CREATE TABLE IF NOT EXISTS Inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  UPC TEXT NOT NULL,
  Quantity INTEGER DEFAULT 0,
  Format TEXT,
  Artist TEXT,
  Title TEXT,
  Vendor_Number TEXT,
  OOP TEXT,
  Year TEXT,
  Vendor TEXT,
  Modified TEXT,
  SRP TEXT
);

-- Schema for Online_Inventory_Import table (temporary staging table for imports)
CREATE TABLE IF NOT EXISTS Online_Inventory_Import (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  Artist TEXT,
  Title TEXT,
  Format TEXT,
  Discogs_ID TEXT,
  Price REAL,
  Description TEXT,
  Condition_Media TEXT,
  Condition_Sleeve TEXT,
  Seller_Reference_Number TEXT,
  Quantity INTEGER DEFAULT 0,
  Label TEXT,
  Release_Catalog_Number TEXT,
  Release_Country TEXT,
  Release_Date TEXT,
  Genre TEXT,
  Front_Image_URL TEXT,
  Back_Image_URL TEXT,
  YouTube_Audio_Image_URLs TEXT,
  Bar_Code TEXT,
  Number_In_Set TEXT
);

-- Partial Unique Index on Seller_Reference_Number to support UPSERTs on non-null items
CREATE UNIQUE INDEX IF NOT EXISTS idx_online_inventory_seller_ref 
ON Online_Inventory(Seller_Reference_Number) 
WHERE Seller_Reference_Number IS NOT NULL;


