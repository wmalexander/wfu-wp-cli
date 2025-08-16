#!/bin/bash

# Script to test various user scenarios and document challenges

echo "==================================================================="
echo "         FRESH USER EXPERIENCE TEST FOR wfuwp CLI                 "
echo "==================================================================="
echo ""

# Helper function to run commands in container
run_in_container() {
    docker exec wfuwp-fresh-test bash -c "export PATH=~/.npm-global/bin:\$PATH && $1"
}

echo "📋 TEST 1: Check initial prerequisites"
echo "----------------------------------------"
echo "Checking Node.js version..."
run_in_container "node --version"
echo "Checking npm version..."
run_in_container "npm --version"
echo "Checking Docker CLI..."
run_in_container "docker --version" || echo "❌ Docker CLI not available"
echo "Checking AWS CLI..."
run_in_container "aws --version 2>&1" || echo "❌ AWS CLI not available"
echo ""

echo "📋 TEST 2: Installation without reading docs"
echo "----------------------------------------"
echo "User tries: wfuwp"
run_in_container "wfuwp" 2>&1 || echo "❌ Command not found initially"
echo ""

echo "📋 TEST 3: Common first commands"
echo "----------------------------------------"
echo "User tries: wfuwp help"
run_in_container "wfuwp help"
echo ""

echo "📋 TEST 4: Trying to use without configuration"
echo "----------------------------------------"
echo "User tries: wfuwp migrate 43 --from prod --to uat"
run_in_container "wfuwp migrate 43 --from prod --to uat" 2>&1 || true
echo ""

echo "📋 TEST 5: Config command discovery"
echo "----------------------------------------"
echo "User tries: wfuwp config"
run_in_container "wfuwp config" 2>&1
echo ""

echo "📋 TEST 6: Config wizard without understanding requirements"
echo "----------------------------------------"
echo "User tries: wfuwp config wizard (and immediately quits)"
echo -e "n\nn\nn\nn\nn\n" | run_in_container "wfuwp config wizard" 2>&1 || true
echo ""

echo "📋 TEST 7: Checking what config is needed"
echo "----------------------------------------"
echo "User tries: wfuwp config verify"
run_in_container "wfuwp config verify"
echo ""

echo "📋 TEST 8: Trying S3 sync without AWS credentials"
echo "----------------------------------------"
echo "User tries: wfuwp syncs3 43 prod uat"
run_in_container "wfuwp syncs3 43 prod uat" 2>&1 || true
echo ""

echo "📋 TEST 9: Trying to list IPs without AWS credentials"
echo "----------------------------------------"
echo "User tries: wfuwp listips prod"
run_in_container "wfuwp listips prod" 2>&1 || true
echo ""

echo "📋 TEST 10: Spoof command (requires sudo)"
echo "----------------------------------------"
echo "User tries: wfuwp spoof test"
run_in_container "wfuwp spoof test" 2>&1 || true
echo ""

echo "📋 TEST 11: Environment migration without setup"
echo "----------------------------------------"
echo "User tries: wfuwp env-migrate prod uat"
run_in_container "wfuwp env-migrate prod uat" 2>&1 || true
echo ""

echo "📋 TEST 12: Looking for examples or documentation"
echo "----------------------------------------"
echo "User looks for README or examples..."
run_in_container "ls -la /tmp/wfu-wp-cli-test/ | grep -E '(README|EXAMPLE|USAGE|DOCS)' | head -5" || echo "No obvious documentation files found"
echo ""

echo "==================================================================="
echo "                     TEST SUMMARY                                  "
echo "==================================================================="