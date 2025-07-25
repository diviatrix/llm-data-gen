# LLM Data Generator

Universal data generator using Large Language Models. Generate structured JSON data with schemas or any text format (Markdown, CSV, emails, etc.) with LLM assistance.

## Features

- 🎯 **Schema-driven generation** - Define your data structure using JSON Schema
- 📄 **Text format support** - Generate any text format (Markdown, CSV, emails, etc.)
- 🤖 **LLM-powered** - Uses OpenRouter API to access various LLM models
- 📝 **Custom prompts** - Fine-tune generation with field-specific prompts
- ✅ **Validation** - Built-in JSON Schema validation for structured data
- 🔄 **Batch processing** - Generate multiple items with progress tracking
- 🛠️ **CLI interface** - Easy-to-use command line tool
- 📦 **Extensible** - Add your own configurations and schemas

## Installation

```bash
# Install globally
npm install -g @1337plus/llmdatagen

# Or use with npx without installation
npx @1337plus/llmdatagen
```

After global installation, you can use the command:
```bash
llmdatagen
```

For alternative installation methods (from source, development setup, troubleshooting), see [docs/installation.md](docs/installation.md).

## Configuration

Set your OpenRouter API key:
```bash
export OPENROUTER_API_KEY=your-api-key-here
```

For detailed configuration guide, see [docs/configuration.md](docs/configuration.md).

## Output Formats

The generator supports two output formats:

### JSON Format (default)
- ✅ Schema validation with JSON Schema
- ✅ Type-safe structured data
- ✅ Field-level generation control
- ✅ Perfect for APIs, databases, configurations

### Text Format
- ✅ Any text-based format (Markdown, CSV, SQL, etc.)
- ✅ No schema constraints
- ✅ Template variables in prompts
- ✅ Perfect for content, documentation, scripts

## Quick Start

```bash
# Generate data with interactive wizard
llmdatagen
```

This will:
1. Display your account information
2. Let you select a model from live list
3. Guide you through configuration setup
4. Start generating data

For detailed usage instructions, command-line options, and advanced features, see [docs/usage.md](docs/usage.md).




## Examples

### JSON Format (Structured Data)

Generate validated, structured data with JSON schemas:

#### Quiz Questions
```bash
llmdatagen --config configs/examples/quiz.json
```
- Multiple choice questions with 2-4 answers
- Difficulty levels and tags
- Schema validation

#### Product Catalog
```bash
llmdatagen --config configs/examples/products.json
```
- E-commerce product listings
- SKU, pricing, inventory
- Structured metadata

#### Blog Article Metadata
```bash
llmdatagen --config configs/examples/articles.json
```
- Article metadata and summaries
- Author, tags, featured flags
- Publication dates

#### News Digest (Web Search)
```bash
llmdatagen --config configs/examples/news-digest.json
```
- Real-time news search and analysis
- Actual sources, URLs, dates
- Relevance scoring and sentiment
- Uses models with web search (Claude 4)

### Text Format (Freeform Content)

Generate any text format without schema constraints:

#### Blog Posts (Markdown)
```bash
llmdatagen --config configs/examples/blog-posts.json
```
- Full blog articles in Markdown
- Headings, formatting, structure
- 800+ words per article

#### Email Templates
```bash
llmdatagen --config configs/examples/emails.json
```
- Professional email templates
- Business, sales, support styles
- Customizable tone and purpose

#### CSV Data
```bash
llmdatagen --config configs/examples/csv-data.json
```
- Comma-separated data files
- Custom columns and headers
- Realistic data generation

#### News Digest (Markdown)
```bash
llmdatagen --config configs/examples/news-digest-markdown.json
```
- Real-time web search for news
- Professional digest format
- Executive summaries & trend analysis
- Uses models with web search



## Documentation

- [Configuration Guide](docs/configuration.md) - Detailed guide on creating configurations
- [Usage Guide](docs/usage.md) - Command-line options and features
- [Installation](docs/installation.md) - Alternative installation methods
- [Development](docs/CLAUDE.md) - Technical details for developers

## Contributing

1. Fork the repository
2. Create your feature branch
3. Add tests for new features
4. Submit a pull request

## License

MIT License - see LICENSE file for details