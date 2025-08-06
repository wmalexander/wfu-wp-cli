# WFU WordPress CLI Tool

A command-line interface for WFU WordPress management tasks, including S3 synchronization between environments.

## Installation

### Install globally from npm (Recommended)

```bash
npm install -g wfuwp
```

### Install from source

```bash
git clone <repository-url>
cd wfu-wp-cli
npm install
npm run build
npm link
```

## Prerequisites

- Node.js 16.0.0 or higher
- AWS CLI installed and configured with appropriate credentials
- Access to WFU WordPress S3 buckets

### AWS CLI Setup

Make sure you have the AWS CLI installed and configured:

```bash
# Install AWS CLI (if not already installed)
# macOS
brew install awscli

# Configure with your credentials
aws configure
```

## Usage

### Basic Command Structure

```bash
wfuwp <command> [options] [arguments]
```

### Available Commands

#### `syncs3` - Sync WordPress sites between S3 environments

Synchronizes WordPress site files between different S3 environments.

```bash
wfuwp syncs3 <site-id> <from-env> <to-env> [options]
```

**Arguments:**
- `site-id`: Numeric site identifier (e.g., 43)
- `from-env`: Source environment (`dev`, `stg`, `prop`, `pprd`, `prod`)
- `to-env`: Destination environment (`dev`, `stg`, `prop`, `pprd`, `prod`)

**Options:**
- `-d, --dry-run`: Preview what would be synced without making changes
- `-f, --force`: Skip confirmation prompt
- `-h, --help`: Display help for command

**Examples:**

```bash
# Basic sync with confirmation
wfuwp syncs3 43 prop pprd

# Dry run to preview changes
wfuwp syncs3 43 prop pprd --dry-run

# Force sync without confirmation
wfuwp syncs3 43 prop pprd --force
```

## Safety Features

### Input Validation
- Site IDs must be positive integers
- Only valid environment names are accepted
- Source and destination environments cannot be the same

### Confirmation Prompts
- Interactive confirmation before executing sync operations
- Use `--force` flag to bypass confirmations in automated scripts

### Dry Run Mode
- Use `--dry-run` to preview what files would be synced
- No actual changes are made in dry-run mode

### AWS CLI Verification
- Checks if AWS CLI is installed and accessible
- Provides helpful error messages if prerequisites are missing

## Troubleshooting

### Common Issues

**"AWS CLI is not installed or not in PATH"**
- Install AWS CLI: https://aws.amazon.com/cli/
- Ensure it's in your system PATH

**"Site ID must be a positive integer"**
- Ensure you're using a numeric site ID (e.g., 43, not "abc")

**"Invalid source/destination environment"**
- Use only valid environment names: `dev`, `stg`, `prop`, `pprd`, `prod`

**"Source and destination environments cannot be the same"**
- Ensure you're specifying different environments for source and destination

### Getting Help

```bash
# General help
wfuwp --help

# Command-specific help
wfuwp syncs3 --help

# Display version
wfuwp --version
```

## Development

### Building from Source

```bash
git clone <repository-url>
cd wfu-wp-cli
npm install
npm run build
```

### Development Scripts

```bash
npm run build      # Compile TypeScript
npm run dev        # Run with ts-node for development
npm run test       # Run tests
npm run lint       # Run ESLint
npm run format     # Format code with Prettier
```

### Project Structure

```
wfu-wp-cli/
├── src/
│   ├── commands/
│   │   └── syncs3.ts     # S3 sync command implementation
│   └── index.ts          # Main CLI entry point
├── bin/
│   └── wfuwp            # Binary wrapper
├── dist/                # Compiled JavaScript (generated)
├── tests/               # Test files
├── docs/                # Additional documentation
└── package.json         # Package configuration
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Run tests: `npm test`
5. Run linting: `npm run lint`
6. Commit your changes: `git commit -m "feat: add new feature"`
7. Push to the branch: `git push origin feature-name`
8. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Search existing issues in the repository
3. Create a new issue with detailed information about the problem