# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-08-06

### Added
- Initial release of WFU WordPress CLI tool
- `syncs3` command for synchronizing WordPress sites between S3 environments
- Support for environments: dev, stg, prop, pprd, prod
- Input validation and safety features
- Dry-run mode for previewing changes
- Interactive confirmation prompts
- Comprehensive documentation
- Unit tests and CI/CD pipeline

### Features
- AWS CLI dependency checking
- Colorful CLI output with chalk
- TypeScript support
- ESLint and Prettier for code quality
- Jest for testing
- GitHub Actions for automated testing and releases

[Unreleased]: https://github.com/alexandw/wfu-wp-cli/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/alexandw/wfu-wp-cli/releases/tag/v0.1.0