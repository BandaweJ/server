#!/bin/bash

# Script to run migration on Render database
# Usage: ./run-render-migration.sh "postgresql://user:pass@host:port/database"

echo "🚀 Running migration on Render database..."
echo ""

# Check if connection string is provided
if [ -z "$1" ]; then
    echo "❌ Error: Database connection string required"
    echo ""
    echo "Usage: ./run-render-migration.sh \"postgresql://user:pass@host:port/database\""
    echo ""
    echo "Or set RENDER_DB_URL environment variable:"
    echo "  export RENDER_DB_URL=\"postgresql://user:pass@host:port/database\""
    echo "  ./run-render-migration.sh"
    exit 1
fi

DB_URL="${1:-$RENDER_DB_URL}"

if [ -z "$DB_URL" ]; then
    echo "❌ Error: No database connection string provided"
    exit 1
fi

# Run the migration
echo "📝 Executing migration script..."
psql "$DB_URL" -f render-migration-script.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Verify the results in the output above"
    echo "2. Restart your backend service on Render (if needed)"
    echo "3. Test your application"
else
    echo ""
    echo "❌ Migration failed. Please check the error messages above."
    exit 1
fi



