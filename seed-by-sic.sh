APP_URL=https://sectorlens.cloudstrucc.com \
INGEST_KEY=057eb71826d3e28d97109537d5422282463f5265ac9882dcd70c168940c3530a042b6884aa88575256ae0067ebd9a4fad942b665692856be894728d76570fb27 \
./ingest-all-sics.sh
# az webapp config appsettings set \
#   --name sectorlens-7d07f132 \
#   --resource-group sectorlens-rg \
#   --settings \
#     "FMP_API_KEY=your_new_key" \
#     "INGEST_USER_AGENT=SectorLens/1.0 (fpearson613@gmail.com)"
