import os
import sys
import glob
import re
import shutil
import zipfile
import subprocess
import xml.etree.ElementTree as ET

# Configuration
FILES_SHARE_DIR = r"F:\FilesShare"
BATCH_SIZE = 9000
DB_NAME = "foreveryoung-db"

def col_to_idx(col_str):
    idx = 0
    for c in col_str:
        if 'A' <= c <= 'Z':
            idx = idx * 26 + (ord(c) - ord('A') + 1)
    return idx - 1

def choose_better_record(rec1, rec2):
    # rec is a list of columns (size 20)
    # Comparison 1: Presence of Discogs ID (idx 3)
    discogs1 = (rec1[3] or "").strip()
    discogs2 = (rec2[3] or "").strip()
    if discogs1 and not discogs2:
        return rec1
    if discogs2 and not discogs1:
        return rec2
        
    # Comparison 2: Description length (idx 5)
    desc1 = (rec1[5] or "").strip()
    desc2 = (rec2[5] or "").strip()
    if len(desc1) > len(desc2):
        return rec1
    if len(desc2) > len(desc1):
        return rec2
        
    # Comparison 3: Price presence or value (idx 4)
    price1 = (rec1[4] or "").strip()
    price2 = (rec2[4] or "").strip()
    if price1 and not price2:
        return rec1
    if price2 and not price1:
        return rec2
        
    return rec1

def escape_sql(val):
    if val is None or val == '':
        return 'NULL'
    # Double the single quotes
    return "'" + str(val).replace("'", "''") + "'"

def parse_num(val, is_float=False):
    if val is None or val == '':
        return 'NULL'
    clean = str(val).strip()
    try:
        if is_float:
            return float(clean)
        else:
            return int(clean)
    except ValueError:
        return 'NULL'

def run_cmd(cmd):
    print(f"Executing: {cmd}")
    try:
        subprocess.run(cmd, shell=True, check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error executing command: {cmd}")
        print(f"Exit code: {e.returncode}")
        sys.exit(1)

def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ('--local', '--remote'):
        print("Usage: python import_to_d1.py < --local | --remote >")
        sys.exit(1)

    mode = sys.argv[1]
    is_local = (mode == '--local')
    mode_flag = "--local" if is_local else "--remote"

    # Find the latest Excel file in FilesShare
    pattern = os.path.join(FILES_SHARE_DIR, "MusicStack-Inventory-Forever_Young_Records-*.xlsx")
    excel_files = glob.glob(pattern)
    if not excel_files:
        print(f"Error: No Excel files found matching: {pattern}")
        sys.exit(1)

    # Sort by modification time to get the latest file
    excel_files.sort(key=os.path.getmtime)
    xlsx_path = excel_files[-1]
    print(f"Found latest Excel file: {xlsx_path} (modified {os.path.getmtime(xlsx_path)})")

    # Define paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(base_dir, 'db_batches')
    key_file_path = os.path.join(base_dir, '.local_data', 'key_map.txt')

    print('--- Phase 1: Parsing inventory and generating SQL batches ---')
    
    # Recreate batch directory
    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)
    os.makedirs(output_dir)

    # Load zip and read sheet1
    with zipfile.ZipFile(xlsx_path) as z:
        # Load shared strings
        shared_strings = []
        if "xl/sharedStrings.xml" in z.namelist():
            with z.open("xl/sharedStrings.xml") as f:
                tree = ET.parse(f)
                root = tree.getroot()
                ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
                for t in root.findall('.//ns:t', ns) or root.findall('.//t'):
                    shared_strings.append(t.text or "")
        print(f"Loaded {len(shared_strings)} shared strings.")
        
        # Load sheet1
        with z.open("xl/worksheets/sheet1.xml") as f:
            tree = ET.parse(f)
            root = tree.getroot()
            ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            
            rows = root.findall('.//ns:row', ns) or root.findall('.//row')
            total_rows = len(rows)
            print(f"Found {total_rows} rows (including header) in sheet1.xml.")

            records_by_ref = {}
            empty_ref_records = []
            
            # Start loop from index 1 (skip first row as header)
            for r_idx in range(1, total_rows):
                row = rows[r_idx]
                cells = row.findall('.//ns:c', ns) or row.findall('.//c')
                cols = [""] * 20
                
                for cell in cells:
                    r_attr = cell.get('r')
                    col_letters = "".join([c for c in r_attr if c.isalpha()])
                    c_idx = col_to_idx(col_letters)
                    if c_idx >= 20:
                        continue
                        
                    t_attr = cell.get('t')
                    v_elem = cell.find('ns:v', ns) if cell.find('ns:v', ns) is not None else cell.find('v')
                    
                    val = ""
                    if v_elem is not None:
                        val = v_elem.text or ""
                        if t_attr == 's':
                            idx = int(val)
                            val = shared_strings[idx] if idx < len(shared_strings) else ""
                    if c_idx == 5: # Description
                        val = re.sub(r'(?:<br\s*/?>\s*)+$', '', val, flags=re.IGNORECASE).strip()
                    cols[c_idx] = val
                
                seller_ref = cols[8].strip()
                
                if not seller_ref:
                    empty_ref_records.append(cols)
                else:
                    if seller_ref in records_by_ref:
                        better_rec = choose_better_record(records_by_ref[seller_ref], cols)
                        records_by_ref[seller_ref] = better_rec
                    else:
                        records_by_ref[seller_ref] = cols
                
                if r_idx % 20000 == 0:
                    print(f"Processed {r_idx} records...")

            # Combine all records
            final_records = list(records_by_ref.values()) + empty_ref_records
            print(f"Deduplicated unique Seller Reference records: {len(records_by_ref)}")
            print(f"Empty Seller Reference records: {len(empty_ref_records)}")
            print(f"Total records to write: {len(final_records)}")

            # Write Key Map File and SQL batch files
            with open(key_file_path, 'w', encoding='utf-8') as key_stream:
                key_stream.write('ID\tSeller_Reference_Number\tArtist\tTitle\n')

                record_id = 0
                batch_index = 1
                current_batch_sql = []
                all_local_sql = ['PRAGMA foreign_keys=OFF;', 'BEGIN TRANSACTION;']

                for cols in final_records:
                    record_id += 1
                    artist = cols[0]
                    title = cols[1]
                    format = cols[2]
                    discogs_id = cols[3]
                    price = cols[4]
                    description = cols[5]
                    cond_media = cols[6]
                    cond_sleeve = cols[7]
                    seller_ref = cols[8]
                    quantity = cols[9]
                    label = cols[10]
                    catalog_num = cols[11]
                    country = cols[12]
                    date = cols[13]
                    genre = cols[14]
                    front_img = cols[15]
                    back_img = cols[16]
                    urls = cols[17]
                    barcode = cols[18]
                    num_in_set = cols[19]

                    # Write to Key File
                    key_stream.write(f"{record_id}\t{seller_ref}\t{artist}\t{title}\n")

                    # Escape for SQL
                    sql = (
                        f"INSERT INTO Online_Inventory ("
                        f"id, Artist, Title, Format, Discogs_ID, Price, Description, "
                        f"Condition_Media, Condition_Sleeve, Seller_Reference_Number, Quantity, "
                        f"Label, Release_Catalog_Number, Release_Country, Release_Date, Genre, "
                        f"Front_Image_URL, Back_Image_URL, YouTube_Audio_Image_URLs, Bar_Code, Number_In_Set"
                        f") VALUES ("
                        f"{record_id}, "
                        f"{escape_sql(artist)}, "
                        f"{escape_sql(title)}, "
                        f"{escape_sql(format)}, "
                        f"{escape_sql(discogs_id)}, "
                        f"{parse_num(price, True)}, "
                        f"{escape_sql(description)}, "
                        f"{escape_sql(cond_media)}, "
                        f"{escape_sql(cond_sleeve)}, "
                        f"{escape_sql(seller_ref)}, "
                        f"{parse_num(quantity, False)}, "
                        f"{escape_sql(label)}, "
                        f"{escape_sql(catalog_num)}, "
                        f"{escape_sql(country)}, "
                        f"{escape_sql(date)}, "
                        f"{escape_sql(genre)}, "
                        f"{escape_sql(front_img)}, "
                        f"{escape_sql(back_img)}, "
                        f"{escape_sql(urls)}, "
                        f"{escape_sql(barcode)}, "
                        f"{escape_sql(num_in_set)}"
                        f");"
                    )

                    current_batch_sql.append(sql)
                    all_local_sql.append(sql)

                    if len(current_batch_sql) == BATCH_SIZE:
                        # Write remote batch
                        batch_file = os.path.join(output_dir, f"batch_{batch_index}.sql")
                        with open(batch_file, 'w', encoding='utf-8') as bf:
                            bf.write("PRAGMA foreign_keys=OFF;\n" + "\n".join(current_batch_sql))
                        batch_index += 1
                        current_batch_sql = []

                # Write remaining remote batch
                if current_batch_sql:
                    batch_file = os.path.join(output_dir, f"batch_{batch_index}.sql")
                    with open(batch_file, 'w', encoding='utf-8') as bf:
                        bf.write("PRAGMA foreign_keys=OFF;\n" + "\n".join(current_batch_sql))
                else:
                    batch_index -= 1 # adjust count

                all_local_sql.append('COMMIT;')
                local_sql_file = os.path.join(output_dir, 'local_all.sql')
                with open(local_sql_file, 'w', encoding='utf-8') as lf:
                    lf.write("\n".join(all_local_sql))

                print(f"Generated {record_id} records.")
                print(f"Remote: {batch_index} SQL batch files generated under '{output_dir}'.")
                print(f"Local: Single SQL file generated at '{local_sql_file}'.")
                print(f"Key cross-reference file saved as '{key_file_path}'.")

    print(f"\n--- Phase 2: Importing to D1 database ({mode}) ---")
    
    # 1. Clear Online_Inventory table
    print("Clearing Online_Inventory first...")
    run_cmd(f'npx wrangler d1 execute {DB_NAME} {mode_flag} --command "DELETE FROM Online_Inventory;"')

    if is_local:
        # For local, execute the single large SQL file
        print(f"Executing single local import from {local_sql_file}...")
        run_cmd(f'npx wrangler d1 execute {DB_NAME} --local --file="{local_sql_file}"')
    else:
        # For remote, execute the batch files sequentially to avoid request limits
        total_batches = batch_index
        print(f"Executing remote import of {total_batches} batches...")
        for i in range(1, total_batches + 1):
            batch_file = os.path.join(output_dir, f"batch_{i}.sql")
            print(f"[{i}/{total_batches}] Executing {batch_file}...")
            run_cmd(f'npx wrangler d1 execute {DB_NAME} --remote --file="{batch_file}"')

    print("\nImport process finished successfully!")

if __name__ == "__main__":
    main()
