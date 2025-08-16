#!/bin/bash

echo "==================================================================="
echo "         TESTING CONFIGURATION SETUP EXPERIENCE                    "
echo "==================================================================="
echo ""

# Helper function
run_in_container() {
    docker exec wfuwp-fresh-test bash -c "export PATH=~/.npm-global/bin:\$PATH && $1"
}

echo "📋 SCENARIO 1: User tries to set config manually"
echo "----------------------------------------"
echo "User doesn't know the structure, tries:"
echo "wfuwp config set host localhost"
run_in_container "wfuwp config set host localhost" 2>&1 || true
echo ""

echo "User tries with environment prefix:"
echo "wfuwp config set prod.host prod-db.example.com"
run_in_container "wfuwp config set prod.host prod-db.example.com" 2>&1 || true
echo ""

echo "📋 SCENARIO 2: User checks what was set"
echo "----------------------------------------"
run_in_container "wfuwp config list"
echo ""

echo "📋 SCENARIO 3: User realizes they need env prefix"
echo "----------------------------------------"
echo "Setting up minimal prod environment..."
run_in_container "wfuwp config set env.prod.host prod-db.example.com"
run_in_container "wfuwp config set env.prod.user wpuser"
run_in_container "wfuwp config set env.prod.password secret123"
run_in_container "wfuwp config set env.prod.database wordpress_prod"
echo ""

echo "📋 SCENARIO 4: User verifies configuration"
echo "----------------------------------------"
run_in_container "wfuwp config verify"
echo ""

echo "📋 SCENARIO 5: User tries to test database connection"
echo "----------------------------------------"
run_in_container "wfuwp db test prod" 2>&1 || true
echo ""

echo "📋 SCENARIO 6: User tries a migration with partial config"
echo "----------------------------------------"
run_in_container "wfuwp migrate 1 --from prod --to uat" 2>&1 || true
echo ""

echo "📋 SCENARIO 7: User looks for example configuration"
echo "----------------------------------------"
echo "Checking for example files..."
run_in_container "find /tmp/wfu-wp-cli-test -name '*example*' -o -name '*sample*' 2>/dev/null | head -5" || echo "No example files found"
echo ""

echo "📋 SCENARIO 8: User tries to understand migration database"
echo "----------------------------------------"
echo "What is migration database?"
run_in_container "wfuwp config get migration" 2>&1 || true
run_in_container "wfuwp config set migration.database wp_migration"
run_in_container "wfuwp config set migration.host localhost"
echo ""

echo "📋 SCENARIO 9: User checks final configuration"
echo "----------------------------------------"
run_in_container "wfuwp config list"
echo ""
run_in_container "wfuwp config verify"
echo ""

echo "==================================================================="
echo "                  CONFIGURATION CHALLENGES SUMMARY                 "
echo "==================================================================="
echo ""
echo "Issues discovered:"
echo "1. No clear documentation on configuration structure (env.*.field)"
echo "2. No example configuration provided"
echo "3. No validation when setting individual fields"
echo "4. Migration database purpose unclear"
echo "5. No way to test connections without full setup"
echo "6. Config wizard requires all environments at once"
echo "7. No partial configuration support"
echo "8. Password stored in plain text (security concern)"