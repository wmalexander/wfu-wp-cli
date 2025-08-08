# Installation Guide

## Prerequisites

### Required Software

#### Node.js (v18+)
```bash
# Check version
node --version

# Install via nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

#### Docker
```bash
# macOS
brew install --cask docker

# Ubuntu/Debian
sudo apt-get update
sudo apt-get install docker.io
sudo systemctl start docker
sudo systemctl enable docker

# Verify installation
docker --version
docker run hello-world
```

#### AWS CLI
```bash
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS credentials
aws configure
```

### Optional Software

#### MySQL Client
```bash
# macOS
brew install mysql-client

# Ubuntu/Debian
sudo apt-get install mysql-client

# Verify
mysql --version
```

## Installation Methods

### Method 1: NPM Global Install (Recommended for Users)

```bash
# Install globally
npm install -g @wfu/wp-cli

# Verify installation
wfuwp --version
```

### Method 2: From Source (Recommended for Development)

```bash
# Clone repository
git clone https://github.com/wfu/wfu-wp-cli.git
cd wfu-wp-cli

# Install dependencies
npm install

# Build the project
npm run build

# Link globally
npm link

# Verify installation
wfuwp --version
```

### Method 3: Direct Execution (Without Installation)

```bash
# Clone repository
git clone https://github.com/wfu/wfu-wp-cli.git
cd wfu-wp-cli

# Install dependencies
npm install

# Run directly with ts-node
npm run dev -- <command>

# Example
npm run dev -- migrate 43 --from prod --to pprd
```

## Post-Installation Setup

### 1. Run Configuration Wizard

```bash
wfuwp config wizard
```

The wizard will guide you through:
- Database credentials for each environment
- Migration database setup
- S3 bucket configuration (optional)
- Local backup directory (optional)

### 2. Verify Docker Access

```bash
# Pull required WordPress CLI image
docker pull wordpress:cli

# Test Docker permissions
docker run --rm wordpress:cli wp --version
```

If you get permission errors:
```bash
# Linux: Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# macOS: Ensure Docker Desktop is running
open -a Docker
```

### 3. Configure AWS Credentials

```bash
# Configure AWS CLI
aws configure

# Test S3 access
aws s3 ls

# Test EC2 access
aws ec2 describe-instances --region us-east-1
```

### 4. Verify Installation

```bash
# Check all components
wfuwp config verify
```

This command will:
- Test database connections
- Verify Docker access
- Check AWS credentials
- Validate S3 bucket access
- Confirm WP-CLI functionality

## Directory Structure

After installation, the following directories are created:

```
~/.wfuwp/
├── config.json       # Encrypted configuration
├── backups/         # Default local backup directory
│   └── [timestamp]/ # Backup subdirectories
└── logs/           # Application logs
    └── wfuwp.log   # Main log file
```

## Environment Variables

Optional environment variables for advanced configuration:

```bash
# Custom config directory
export WFUWP_CONFIG_DIR="$HOME/.config/wfuwp"

# Custom backup directory
export WFUWP_BACKUP_DIR="/path/to/backups"

# Debug mode
export WFUWP_DEBUG=true

# AWS profile
export AWS_PROFILE=wfu-wordpress

# Docker socket (if non-standard)
export DOCKER_HOST=unix:///var/run/docker.sock
```

## Permissions

### File System Permissions

```bash
# Ensure config directory is secure
chmod 700 ~/.wfuwp
chmod 600 ~/.wfuwp/config.json
```

### AWS IAM Permissions

Required AWS permissions for full functionality:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::wfu-wordpress-*",
        "arn:aws:s3:::wfu-wordpress-*/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:DescribeSecurityGroups"
      ],
      "Resource": "*"
    }
  ]
}
```

## Troubleshooting Installation

### Node.js Issues

```bash
# Clear npm cache
npm cache clean --force

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Docker Issues

```bash
# Reset Docker
docker system prune -a

# Restart Docker service
# macOS
osascript -e 'quit app "Docker"'
open -a Docker

# Linux
sudo systemctl restart docker
```

### Permission Denied Errors

```bash
# Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### AWS CLI Issues

```bash
# Reset AWS credentials
rm -rf ~/.aws/credentials
aws configure

# Test with specific profile
aws s3 ls --profile wfu-wordpress
```

## Updating

### Update Global Installation

```bash
npm update -g @wfu/wp-cli
```

### Update from Source

```bash
cd wfu-wp-cli
git pull origin main
npm install
npm run build
```

## Uninstallation

### Remove Global Installation

```bash
npm uninstall -g @wfu/wp-cli
```

### Clean Configuration

```bash
# Backup configuration first
cp -r ~/.wfuwp ~/.wfuwp.backup

# Remove configuration
rm -rf ~/.wfuwp
```

### Remove Docker Images

```bash
docker rmi wordpress:cli
```

## Next Steps

1. Complete the [Configuration Guide](./configuration.md)
2. Review the [Commands Reference](./commands.md)
3. Learn about [Migration Workflows](./migration.md)
4. Explore [Architecture](./architecture.md) details