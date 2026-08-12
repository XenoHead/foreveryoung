#!/usr/bin/env python3
"""Scan all HTML files for image references and compare against the images/ folder.

Extracts src, srcset, background-image url(), poster, and any quoted path ending in an image extension.
"""
import re
import os
import sys
from pathlib import Path

ROOT = Path(__file__).parent
IMG_DIR = ROOT / "images"
HTML_FILES = sorted(ROOT.glob("*.html"))

IMG_EXTS = re.compile(r'\.(png|jpg|jpeg|webp|svg|avif|gif|avif)(\?.*)?$', re.I)

def extract_from_file(path):
    """Return a set of normalized image paths referenced in the HTML."""
    text = path.read_text(errors="replace")
    found = set()
    
    # src="..." and src='...'
    for m in re.finditer(r'(?:src|href|poster)\s*=\s*["\']([^"\']+\.(?:png|jpg|jpeg|webp|svg|avif|gif))["\']', text, re.I):
        found.add(m.group(1))
    
    # srcset="..." (comma-separated)
    for m in re.finditer(r'srcset\s*=\s*["\']([^"\']+)["\']', text, re.I):
        for part in m.group(1).split(','):
            part = part.strip()
            if IMG_EXTS.search(part):
                found.add(part)
    
    # background-image: url("...") and url('...')
    for m in re.finditer(r'url\(["\']([^"\']+\.(?:png|jpg|jpeg|webp|svg|avif|gif))["\']\)', text, re.I):
        found.add(m.group(1))
    
    # Also catch url() without quotes (rare but possible)
    for m in re.finditer(r'url\(\s*([^)"\']+\.(?:png|jpg|jpeg|webp|svg|avif|gif))\s*\)', text, re.I):
        found.add(m.group(1))
    
    # Catch any quoted string that looks like images/foo.ext (catches inline style backgrounds)
    for m in re.finditer(r'["\']([^"\']*images/[^"\']*\.(?:png|jpg|jpeg|webp|svg|avif|gif))["\']', text, re.I):
        found.add(m.group(1))
    
    return found

def main():
    referenced = set()
    file_refs = {}
    
    for html in HTML_FILES:
        refs = extract_from_file(html)
        file_refs[html.name] = refs
        referenced.update(refs)
    
    # Also scan inline CSS styles in HTML (background-image in <style> blocks)
    for html in HTML_FILES:
        text = html.read_text(errors="replace")
        for m in re.finditer(r'\.image:\s*url\(["\']([^"\']+)["\']\)', text, re.I):
            if IMG_EXTS.search(m.group(1)):
                referenced.add(m.group(1))
    
    # Resolve to actual filenames in images/
    used_filenames = set()
    for ref in referenced:
        # Strip leading path if any; we only care about basename for comparison
        # The refs are like "images/foo.png" — strip to basename
        parts = Path(ref).parts
        if parts:
            # If it's already just a filename, use it; otherwise take basename
            fname = parts[-1]
            if fname and IMG_EXTS.search(fname):
                used_filenames.add(fname)
    
    # List actual files in images/
    actual_files = set()
    for p in IMG_DIR.iterdir():
        if p.is_file():
            actual_files.add(p.name)
    
    used = actual_files & used_filenames
    unused = actual_files - used_filenames
    
    print(f"HTML files scanned: {len(HTML_FILES)}")
    print(f"Unique image refs found: {len(referenced)}")
    print(f"Files in images/: {len(actual_files)}")
    print(f"USED ({len(used)}):")
    for f in sorted(used):
        print(f"  {f}")
    print(f"\nUNUSED ({len(unused)}) — candidates for extraneous/:")
    for f in sorted(unused):
        size = (IMG_DIR / f).stat().st_size
        print(f"  {f}  ({size/1024/1024:.1f} MB)")
    
    # Show per-file breakdown
    print("\n--- Per-file references ---")
    for name, refs in sorted(file_refs.items()):
        print(f"\n{name}:")
        for r in sorted(refs):
            print(f"  {r}")
    
    # Write unused list to a file for review
    unused_path = ROOT / "extraneous" / "unused_images_list.txt"
    with open(unused_path, "w") as f:
        f.write("UNUSED IMAGES (candidates for removal to extraneous/)\n")
        f.write("=" * 60 + "\n\n")
        for name, refs in sorted(file_refs.items()):
            f.write(f"\n{name}:\n")
            for r in sorted(refs):
                f.write(f"  {r}\n")
        f.write("\n\nUNUSED FILES:\n")
        for uf in sorted(unused):
            size = (IMG_DIR / uf).stat().st_size
            f.write(f"  {uf}  ({size/1024/1024:.1f} MB)\n")
    print(f"\nDetail written to: {unused_path}")

if __name__ == "__main__":
    main()
