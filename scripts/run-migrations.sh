#!/bin/bash
# Safe migration runner for Render deployments
# Exits with code 0 if migrations succeed or if there are no pending migrations
# Exits with code 1 only if there's an actual error

set -e  # Exit on error

echo "🔄 Checking for pending migrations..."

# Run migrations - this will:
# - Run all pending migrations
# - Exit with code 0 if successful
# - Exit with code 0 if no migrations to run
# - Exit with code 1 if there's an error
npm run migration:run || {
  EXIT_CODE=$?
  if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ No pending migrations or migrations completed successfully"
    exit 0
  else
    echo "❌ Migration failed with exit code $EXIT_CODE"
    exit 1
  fi
}

echo "✅ Migrations completed successfully"

