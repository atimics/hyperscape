#!/bin/bash
# Setup Railway secrets for GitHub Actions deployment
# Automatically extracts IDs from linked Railway project
#
# Usage: ./scripts/setup-railway-secrets.sh [repo]
# Example: ./scripts/setup-railway-secrets.sh atimics/hyperscape

set -e

REPO="${1:-atimics/hyperscape}"

echo "🚂 Railway GitHub Secrets Setup"
echo "================================"
echo "Repository: $REPO"
echo ""

# Check dependencies
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) not installed. Install with: brew install gh"
    exit 1
fi

if ! gh auth status &> /dev/null; then
    echo "❌ Not logged into GitHub CLI. Run: gh auth login"
    exit 1
fi

if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not installed. Install with: npm install -g @railway/cli"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "❌ jq not installed. Install with: brew install jq"
    exit 1
fi

# Check if railway project is linked
if ! railway status &> /dev/null; then
    echo "❌ No Railway project linked to this directory."
    echo ""
    echo "First, link a project:"
    echo "  railway login"
    echo "  railway init    # Create new project"
    echo "  # OR"
    echo "  railway link    # Link existing project"
    exit 1
fi

echo "📋 Fetching Railway project info..."
echo ""

# Get project info as JSON
STATUS_JSON=$(railway status --json)

# Extract IDs
RAILWAY_PROJECT_ID=$(echo "$STATUS_JSON" | jq -r '.id')
RAILWAY_SERVICE_ID=$(echo "$STATUS_JSON" | jq -r '.services.edges[0].node.id')
RAILWAY_ENVIRONMENT_ID=$(echo "$STATUS_JSON" | jq -r '.environments.edges[0].node.id')
PROJECT_NAME=$(echo "$STATUS_JSON" | jq -r '.name')
SERVICE_NAME=$(echo "$STATUS_JSON" | jq -r '.services.edges[0].node.name // "No service"')
ENV_NAME=$(echo "$STATUS_JSON" | jq -r '.environments.edges[0].node.name // "No environment"')

echo "Found Railway project:"
echo "  Project:     $PROJECT_NAME ($RAILWAY_PROJECT_ID)"
echo "  Service:     $SERVICE_NAME ($RAILWAY_SERVICE_ID)"
echo "  Environment: $ENV_NAME ($RAILWAY_ENVIRONMENT_ID)"
echo ""

# Validate IDs
if [ "$RAILWAY_PROJECT_ID" = "null" ] || [ -z "$RAILWAY_PROJECT_ID" ]; then
    echo "❌ Could not get Project ID"
    exit 1
fi

if [ "$RAILWAY_SERVICE_ID" = "null" ] || [ -z "$RAILWAY_SERVICE_ID" ]; then
    echo "❌ No service found. Create one first:"
    echo "   railway add"
    exit 1
fi

if [ "$RAILWAY_ENVIRONMENT_ID" = "null" ] || [ -z "$RAILWAY_ENVIRONMENT_ID" ]; then
    echo "❌ No environment found"
    exit 1
fi

# Check which secrets already exist
echo "Checking existing secrets..."
EXISTING_SECRETS=$(gh secret list -R "$REPO" 2>/dev/null | awk '{print $1}')

echo ""
echo "Setting secrets on $REPO..."
echo ""

# Railway Token - only prompt if not already set
if echo "$EXISTING_SECRETS" | grep -q "^RAILWAY_TOKEN$"; then
    echo "✅ RAILWAY_TOKEN (already set, skipping)"
else
    echo "🔑 Railway Token"
    echo "   Get from: https://railway.app/account/tokens"
    echo "   (Create a new token if you don't have one)"
    echo ""
    read -sp "   Enter token: " RAILWAY_TOKEN
    echo ""

    if [ -z "$RAILWAY_TOKEN" ]; then
        echo "❌ Token is required"
        exit 1
    fi

    echo "$RAILWAY_TOKEN" | gh secret set RAILWAY_TOKEN -R "$REPO"
    echo "✅ RAILWAY_TOKEN"
fi

# Set IDs (always update these since project may have changed)
if echo "$EXISTING_SECRETS" | grep -q "^RAILWAY_PROJECT_ID$"; then
    echo "⟳  RAILWAY_PROJECT_ID = $RAILWAY_PROJECT_ID (updating)"
else
    echo "✅ RAILWAY_PROJECT_ID = $RAILWAY_PROJECT_ID"
fi
gh secret set RAILWAY_PROJECT_ID -R "$REPO" -b "$RAILWAY_PROJECT_ID"

if echo "$EXISTING_SECRETS" | grep -q "^RAILWAY_SERVICE_ID$"; then
    echo "⟳  RAILWAY_SERVICE_ID = $RAILWAY_SERVICE_ID (updating)"
else
    echo "✅ RAILWAY_SERVICE_ID = $RAILWAY_SERVICE_ID"
fi
gh secret set RAILWAY_SERVICE_ID -R "$REPO" -b "$RAILWAY_SERVICE_ID"

if echo "$EXISTING_SECRETS" | grep -q "^RAILWAY_ENVIRONMENT_ID$"; then
    echo "⟳  RAILWAY_ENVIRONMENT_ID = $RAILWAY_ENVIRONMENT_ID (updating)"
else
    echo "✅ RAILWAY_ENVIRONMENT_ID = $RAILWAY_ENVIRONMENT_ID"
fi
gh secret set RAILWAY_ENVIRONMENT_ID -R "$REPO" -b "$RAILWAY_ENVIRONMENT_ID"

echo ""
echo "🎉 Done! Secrets configured for $REPO"
echo ""
echo "Verify with:"
echo "  gh secret list -R $REPO"
echo ""
echo "Deploy with:"
echo "  git push origin main"
echo "  # OR"
echo "  gh workflow run 'Deploy to Railway' -R $REPO"
