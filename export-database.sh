#!/bin/bash
# Simple script to export the database

echo "Exporting database..."
pg_dump $DATABASE_URL > database_export.sql
echo "Done! Database exported to database_export.sql"
echo "Use the download button in the Replit files panel to download this file."