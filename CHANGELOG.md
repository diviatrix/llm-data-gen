# Changelog

All notable changes to this project will be documented in this file.

## [1.1.8] - 2026-03-02

### Added
- **User Preferences**: Added support for saving and loading user preferences (e.g., last used model) in `preferences.json`.
- **API Key Fallback**: Improved API key discovery to fall back to user-specific stored keys if environment variables are missing.
- **Interactive Mode Improvements**: Added `interactive` flag to connection tests to prevent process exit when running within the menu.
- **Default Model Logic**: Automatic selection of free models or last used model when no specific model is configured.
- **Unit Tests**: Added new test suites for CLI commands, configuration wizard, and interactive mode.

### Fixed
- **CLI Process Exit**: Ensured `test` and `generate` commands exit with correct status codes in non-interactive environments.
- **Dependency Cleanup**: Removed redundant self-dependency on `@1337plus/llmdatagen` in `package.json`.
- **Config Path Mapping**: Fixed incorrect directory mapping in `ConfigManager` unit tests.
- **API Validation**: Added fast-fail validation for invalid or too-short API keys during connection tests.

### Removed
- **External Dependencies**: Removed `chalk` as a direct dependency in favor of a lightweight, zero-dependency internal console helper.
- **Legacy Color Module**: Deleted `lib/utils/colors.js` in favor of the optimized `lib/utils/console.js`.

### Security
- **Credential Validation**: Added checks to prevent use of placeholder "test" API keys in production-like runs.
