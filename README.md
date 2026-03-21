# LLM Data Generator

Sometimes you just need to prepare the DATA.
And it's very often JSON, MD, csv, or just plain text with exact formatting and structure.

Well, you can create fine prompt and prepare 100 rows of text or so, but when you need hundreds of validated objects? 

## Overview

LLM Data Generator is a tool to batch your llm text processing with templates, fine model selection, JSON validation and different output formats. (Examples and wizard included!)

## Features

### 🎯 **Multi-Format Data Generation**
- **JSON/JSONL**: Schema-validated structured data generation
- **CSV/TSV**: Tabular data with custom columns and relationships
- **XML**: Hierarchical data structures
- **YAML**: Configuration files and data serialization
- **SQL**: Database schemas and sample data
- **Markdown**: Documentation, articles, and formatted content
- **Text**: Custom formats and unstructured content

### 🖥️ **Dual Interface Design**
- **Interactive CLI**: Terminal-based wizard with model selection and progress tracking
- **Web Interface**: Full-featured (but laggy af, sry this one full vibe code) browser-based application with visual editors

### 🤖 Integrations**
- **Openrouter**

### 🖥️ Batching **
- **Real-time Cost Tracking**: Know costs before and after generation
- **Progress Monitoring**: Live generation status and error handling

### 👥 **Web User Management & Authentication**
- **Role-based Access**: Admin and user roles with different permissions
- **Multi-tenant Support**: Isolated user data and configurations
- **API Key Management**: Personal and system-wide key management
- **Storage Quotas**: Configurable limits and usage tracking

### 📊 **Advanced Features**
- **Queue System**: Batch processing for large-scale generation
- **Generation History**: Track and revisit previous generations
- **File Management**: Upload, organize, and manage data files
- **Chat Interface**: Interactive conversations with AI models
- **Data Viewer/Editor**: Visual editing of generated content
- **Configuration Wizard**: Step-by-step setup for complex scenarios

## Installation

### NPM Package (Recommended)
```bash
# Install globally
npm install -g @1337plus/llmdatagen

# Or use with npx without installation
npx @1337plus/llmdatagen
```

### From Source
```bash
# Clone the repository
git clone https://github.com/diviatrix/llm-data-gen.git
cd llm-data-gen

# Install dependencies
npm install

# Run locally
npm start
```

### System Requirements
- **Node.js**: 18.0.0 or higher
- **Platform**: Windows, macOS, Linux
- **Memory**: 512MB RAM minimum
- **Storage**: 100MB available space

## Quick Start

### CLI Interface

```bash
# Start interactive mode
llmdatagen

# Direct generation with config file
llmdatagen generate --config myconfig.json

# Test API connection
llmdatagen test

# Validate configuration
llmdatagen validate config.json
```

### Web Interface

```bash
# Start web server (default port 3000)
npm run web

# Start on custom port
PORT=8080 npm run web

# Development mode with hot reload
npm run dev:web
```

Open `http://localhost:3000` in your browser to access the full web interface.

## Usage Examples

### Schema-driven JSON Generation
```json
{
  "type": "json",
  "count": 50,
  "schema": {
    "name": { "type": "string" },
    "email": { "type": "string", "format": "email" },
    "age": { "type": "number", "minimum": 18, "maximum": 80 },
    "skills": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 2,
      "maxItems": 5
    }
  }
}
```

### CSV Data Generation
```json
{
  "type": "csv",
  "count": 100,
  "prompt": "Generate customer data with columns: name, email, phone, city, purchase_amount",
  "output": {
    "format": "csv",
    "filename": "customers.csv"
  }
}
```

### Content Creation
```json
{
  "type": "text",
  "count": 10,
  "prompt": "Write technical blog post titles about AI and machine learning trends in 2025",
  "output": {
    "format": "markdown",
    "filename": "blog_titles.md"
  }
}
```

## Web Interface Features

### 🏠 **Dashboard**
- System status and health monitoring
- Quick access to recent projects
- Usage statistics and quotas

### 💬 **Chat Interface**
- Interactive conversations with AI models
- File attachment support (images, documents, code)
- Conversation history and export
- Model switching mid-conversation

### 🔧 **Configuration Manager**
- Visual JSON editor with syntax highlighting
- Template library with examples
- Validation and testing tools
- Import/export configurations

### 📈 **Data Generator**
- Batch generation with progress tracking
- Multiple output format support
- Preview and validation
- Download and sharing options

### 📂 **File Manager**
- Upload and organize data files
- Preview and edit capabilities
- Bulk operations and organization
- Integration with generation workflows

### 🎛️ **Admin Panel** (Local Mode)
- User creation and management
- Role assignment and permissions
- System configuration
- Usage monitoring and quotas

### ⚙️ **Settings**
- API key management
- Model preferences and defaults
- Output directory configuration
- Notification preferences

## Configuration

### Environment Variables
```bash
# OpenRouter API configuration
OPENROUTER_API_KEY=your_api_key_here

# Server configuration
PORT=3000
NODE_ENV=production

# Authentication (optional)
JWT_SECRET=your_jwt_secret
SESSION_TIMEOUT=24h

# Storage (optional)
DATA_DIR=./user-data
MAX_FILE_SIZE=10485760
```

### Directory Structure
```
~/Documents/llmdatagen/
├── configs/           # Configuration files
│   └── examples/      # Template configurations
├── output/           # Generated data files
│   └── data/         # Organized by date/project
└── uploads/          # User uploaded files
```

## API Reference

### Authentication Endpoints
- `POST /api/auth/login` - User authentication
- `POST /api/auth/logout` - Session termination
- `GET /api/auth/me` - Current user info

### Generation Endpoints
- `POST /api/generate` - Start data generation
- `GET /api/generate/status/:id` - Check generation status
- `GET /api/generate/history` - Generation history

### Configuration Endpoints
- `GET /api/configs` - List configurations
- `POST /api/configs` - Create configuration
- `PUT /api/configs/:id` - Update configuration
- `DELETE /api/configs/:id` - Delete configuration

### File Management Endpoints
- `GET /api/files` - List files
- `POST /api/files/upload` - Upload file
- `GET /api/files/:id` - Download file
- `DELETE /api/files/:id` - Delete file

For detailed API documentation, see [docs/api_reference.md](docs/api_reference.md).

## Advanced Features

### Queue System
Process multiple generation tasks in background:
- Batch processing for large datasets
- Priority-based task scheduling
- Progress tracking and notifications
- Error handling and retry logic

### Model Management
- Dynamic model selection based on task complexity
- Cost optimization with model routing
- Performance monitoring and analytics
- Custom model preferences per user

### Data Processing
- Multi-format export capabilities
- Data validation and cleanup
- Transformation and filtering
- Integration with external tools

## Development

### Setup Development Environment
```bash
# Clone and install
git clone https://github.com/diviatrix/llm-data-gen.git
cd llm-data-gen
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Run tests
npm test
npm run test:coverage

# Start development servers
npm run dev:web    # Web interface
npm start          # CLI interface
```

### Available Scripts
- `npm start` - Run CLI tool
- `npm run web` - Start web server
- `npm run lint` - Check code style
- `npm test` - Run test suite
- `npm run test:coverage` - Coverage report
- `npm run build-css` - Build stylesheets

### Project Structure
```
llm-data-gen/
├── lib/                    # Core libraries
│   ├── cli/               # CLI interface components
│   ├── streaming/         # Data streaming utilities
│   ├── utils/            # Shared utilities
│   └── workers/          # Background processing
├── public/                # Web interface assets
│   ├── css/              # Stylesheets
│   ├── js/               # Frontend JavaScript
│   └── pages/            # HTML templates
├── test/                  # Test suites
│   ├── unit/             # Unit tests
│   └── integration/      # Integration tests
├── docs/                  # Documentation
└── configs/              # Example configurations
```

## Documentation

- **[Installation Guide](docs/installation.md)** - Detailed installation instructions
- **[Usage Guide](docs/usage.md)** - Complete feature walkthrough
- **[Configuration Guide](docs/configuration.md)** - Schema and setup reference
- **[API Reference](docs/api_reference.md)** - REST API documentation
- **[Examples](docs/examples.md)** - Real-world use cases and templates

## Contributing

We welcome contributions from the community! Please read our contributing guidelines:

1. **Fork** the repository on GitHub
2. **Create** a feature branch from `main`
3. **Make** your changes with appropriate tests
4. **Ensure** all tests pass and code follows style guidelines
5. **Submit** a pull request with clear description

### Development Guidelines
- Follow existing code style and conventions
- Add tests for new functionality
- Update documentation for user-facing changes
- Use semantic commit messages

### Reporting Issues
- Use GitHub Issues for bug reports and feature requests
- Include system information and steps to reproduce
- Check existing issues to avoid duplicates

## License

This project is licensed under the [LICENSE](LICENSE).

## Support

- **GitHub Issues**: Bug reports and feature requests
- **Documentation**: Comprehensive guides and examples
- **Community**: Share configurations and use cases

---

Built with ❤️ by [1337.plus](https://github.com/diviatrix)
