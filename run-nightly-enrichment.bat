@echo off
echo Running Nightly Discogs Enrichment Batch...
cd /d "c:\Git\ForeverYoung"
call node enrich_inventory.js --remote --trial --limit 100
echo Batch completed at %date% %time% >> enrichment_log.txt
