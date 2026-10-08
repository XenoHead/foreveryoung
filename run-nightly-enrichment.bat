@echo off
echo Running Nightly Discogs Image Backfill Batch...
cd /d "c:\Git\ForeverYoung"
call node scripts/backfill_images.js --remote --limit 500
echo Batch completed at %date% %time% >> enrichment_log.txt
