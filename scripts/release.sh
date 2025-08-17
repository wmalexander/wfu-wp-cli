#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}WFU WordPress CLI Release Script${NC}"

# Check if we're on main branch
current_branch=$(git branch --show-current)
if [ "$current_branch" != "main" ]; then
    echo -e "${RED}Error: You must be on the main branch to create a release${NC}"
    exit 1
fi

# Check if working directory is clean
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}Error: Working directory is not clean. Please commit or stash changes.${NC}"
    exit 1
fi

# Pull latest changes
echo -e "${YELLOW}Pulling latest changes...${NC}"
git pull origin main

# Run tests (skip if SKIP_TESTS=1)
if [ "$SKIP_TESTS" = "1" ]; then
    echo -e "${YELLOW}Skipping tests (SKIP_TESTS=1)...${NC}"
else
    echo -e "${YELLOW}Running tests...${NC}"
    npm test
fi

# Run linting (skip if SKIP_LINT=1)
if [ "$SKIP_LINT" = "1" ]; then
    echo -e "${YELLOW}Skipping linting (SKIP_LINT=1)...${NC}"
else
    echo -e "${YELLOW}Running linter...${NC}"
    npm run lint
fi

# Build project
echo -e "${YELLOW}Building project...${NC}"
npm run build

# Ask for version bump type
echo -e "${BLUE}What type of release is this?${NC}"
echo "1) patch (0.1.0 -> 0.1.1)"
echo "2) minor (0.1.0 -> 0.2.0)"  
echo "3) major (0.1.0 -> 1.0.0)"
read -p "Enter choice (1-3): " choice

case $choice in
    1)
        version_type="patch"
        ;;
    2)
        version_type="minor"
        ;;
    3)
        version_type="major"
        ;;
    *)
        echo -e "${RED}Invalid choice. Exiting.${NC}"
        exit 1
        ;;
esac

# Bump version
echo -e "${YELLOW}Bumping version (${version_type})...${NC}"
npm version $version_type --no-git-tag-version

# Get new version
new_version=$(node -p "require('./package.json').version")
echo -e "${GREEN}New version: v${new_version}${NC}"

# Update CHANGELOG
echo -e "${YELLOW}Please update CHANGELOG.md with the new version and changes.${NC}"
echo -e "${YELLOW}Press any key when done...${NC}"
read -n 1 -s

# Commit changes
echo -e "${YELLOW}Committing version bump...${NC}"
git add package.json CHANGELOG.md
git commit -m "chore: bump version to v${new_version}"

# Create and push tag
echo -e "${YELLOW}Creating and pushing tag...${NC}"
git tag "v${new_version}"
git push origin main --tags

echo -e "${GREEN}✓ Release v${new_version} created successfully!${NC}"
echo -e "${BLUE}GitHub Actions will now handle the npm publish and GitHub release.${NC}"