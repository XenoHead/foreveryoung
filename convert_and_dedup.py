import zipfile
import xml.etree.ElementTree as ET
import os

xlsx_path = r"F:\FilesShare\MusicStack-Inventory-Forever_Young_Records-725319-2026-06-24.xlsx"
tsv_output_path = r"d:\Git\Xeno\foreveryoung\MusicStack-Inventory-2026-06-24-Forever-Young-Records.txt"

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

def main():
    if not os.path.exists(xlsx_path):
        print(f"Error: Excel file not found at {xlsx_path}")
        return

    print(f"Reading Excel file: {xlsx_path}")
    with zipfile.ZipFile(xlsx_path) as z:
        # Load shared strings
        shared_strings = []
        if "xl/sharedStrings.xml" in z.namelist():
            with z.open("xl/sharedStrings.xml") as f:
                tree = ET.parse(f)
                root = tree.getroot()
                ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
                # Support namespaces and no-namespaces
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
            
            header_cols = [
                "Artist", "Title", "Format", "Discogs ID", "Price", "Description", 
                "Condition", "Condition", "Seller Reference Number", "Quantity", 
                "Label", "Release/Catalog Number", "Release Country", "Release Date", 
                "Genre", "Front Image URL", "Back Image URL", "YouTube/Audio/Image URL(s)", 
                "Bar Code", "Number In Set"
            ]
            
            records_by_ref = {}
            empty_ref_records = []
            
            # Start loop from index 1 (skip first row as header)
            for r_idx in range(1, total_rows):
                row = rows[r_idx]
                cells = row.findall('.//ns:c', ns) or row.findall('.//c')
                cols = [""] * 20
                
                for cell in cells:
                    r_attr = cell.get('r') # e.g. A2, B2
                    col_letters = "".join([c for c in r_attr if c.isalpha()])
                    c_idx = col_to_idx(col_letters)
                    if c_idx >= 20:
                        continue
                        
                    t_attr = cell.get('t') # cell type
                    v_elem = cell.find('ns:v', ns) if cell.find('ns:v', ns) is not None else cell.find('v')
                    
                    val = ""
                    if v_elem is not None:
                        val = v_elem.text or ""
                        if t_attr == 's': # shared string index
                            idx = int(val)
                            val = shared_strings[idx] if idx < len(shared_strings) else ""
                    cols[c_idx] = val
                
                seller_ref = cols[8].strip()
                
                if not seller_ref:
                    # Keep records with empty reference numbers as separate items
                    empty_ref_records.append(cols)
                else:
                    if seller_ref in records_by_ref:
                        # Decide which one is better to keep
                        better_rec = choose_better_record(records_by_ref[seller_ref], cols)
                        records_by_ref[seller_ref] = better_rec
                    else:
                        records_by_ref[seller_ref] = cols
                
                if r_idx % 20000 == 0:
                    print(f"Processed {r_idx} rows...")

            # Combine all records
            final_records = list(records_by_ref.values()) + empty_ref_records
            print(f"Deduplicated unique Seller Reference records: {len(records_by_ref)}")
            print(f"Empty Seller Reference records: {len(empty_ref_records)}")
            print(f"Total records to write: {len(final_records)}")

            # Write to TSV file
            print(f"Writing deduplicated TSV output to: {tsv_output_path}")
            with open(tsv_output_path, "w", encoding="utf-8") as out:
                # Write header
                out.write("\t".join(header_cols) + "\n")
                
                for cols in final_records:
                    # Clean up tabs/newlines from columns to avoid breaking TSV format
                    cleaned_cols = [c.replace("\t", " ").replace("\n", " ").replace("\r", " ") for c in cols]
                    out.write("\t".join(cleaned_cols) + "\n")
            
            print("Successfully finished conversion and deduplication!")

if __name__ == "__main__":
    main()
