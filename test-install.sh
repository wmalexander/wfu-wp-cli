#!/bin/bash

# Script to test fresh installation inside Docker container

echo "=== Testing Fresh Installation of wfuwp CLI ==="
echo ""

# Copy the project to a writable location in the container
echo "1. Copying project files to container..."
docker exec wfuwp-fresh-test bash -c "cp -r /home/testuser/wfu-wp-cli /tmp/wfu-wp-cli-test"

# Install dependencies
echo ""
echo "2. Installing npm dependencies..."
docker exec wfuwp-fresh-test bash -c "cd /tmp/wfu-wp-cli-test && npm install"

# Install globally
echo ""
echo "3. Installing CLI globally..."
docker exec wfuwp-fresh-test bash -c "cd /tmp/wfu-wp-cli-test && npm install -g ."

# Update PATH
echo ""
echo "4. Updating PATH for npm global packages..."
docker exec wfuwp-fresh-test bash -c "source ~/.bashrc"

# Test basic command
echo ""
echo "5. Testing basic help command..."
docker exec wfuwp-fresh-test bash -c "export PATH=~/.npm-global/bin:\$PATH && wfuwp --help"

# Test config command (should fail without config)
echo ""
echo "6. Testing config verify (should show missing config)..."
docker exec wfuwp-fresh-test bash -c "export PATH=~/.npm-global/bin:\$PATH && wfuwp config verify" || true

# Test config wizard
echo ""
echo "7. Testing if wizard can be launched..."
docker exec wfuwp-fresh-test bash -c "export PATH=~/.npm-global/bin:\$PATH && echo 'q' | wfuwp config wizard" || true

# Check Docker availability
echo ""
echo "8. Testing Docker availability..."
docker exec wfuwp-fresh-test bash -c "docker --version" || echo "Docker CLI not working"

# Test migrate command without config
echo ""
echo "9. Testing migrate command without configuration..."
docker exec wfuwp-fresh-test bash -c "export PATH=~/.npm-global/bin:\$PATH && wfuwp migrate 1 --from prod --to uat" || true

echo ""
echo "=== Installation Test Complete ==="