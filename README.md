# LLM Data Generator

Universal data generator using Large Language Models. Generate structured JSON data with schemas or any text format (Markdown, CSV, emails, etc.) with LLM assistance.

## Features

### 🎯 Schema-driven JSON generation
```json
// Input schema
{
  "name": { "type": "string" },
  "price": { "type": "number", "minimum": 10, "maximum": 1000 }
}

// Generated output
{
  "name": "Wireless Gaming Mouse Pro X",
  "price": 89.99
}
```

### 📄 Text format generation
```bash
# Generate blog posts, emails, CSV data, SQL scripts, etc.
llmdatagen --config blog-posts.json

# Output: article_1.md
# How AI is Transforming Healthcare in 2025
# 
# The healthcare industry is experiencing a revolutionary...
```

### 🤖 Interactive CLI
```bash
$ llmdatagen

╔════════════════════════════════════════════╗
║       LLM Data Generator v1.0.8            ║
╚════════════════════════════════════════════╝

👤 Account Info:
  balance: $44.58 of $50.00 (10.8% used)
  
? Select LLM model:
  🤖 Auto Router (selects best available model)
❯ 🆓 Free    Meta: Llama 3.2 3B Instruct
  💰 $0.15/M OpenAI: GPT-4o mini
  
? How many items to generate? 20

📊 Generating 20 items...
  ✓ Generated item 1/20
  ✓ Generated item 2/20
  ...
  
✅ Generated 20 items to output/products.json
💰 Total cost: $0.0042
```

- **Live model selection** - Always up-to-date models from OpenRouter
- **Progress tracking** - Real-time generation status
- **Cost estimation** - Know costs before and after generation
- **Validation** - Automatic JSON Schema validation
- **Extensible** - Add custom configurations and templates

## Installation

```bash
# Install globally
npm install -g @1337plus/llmdatagen

# Or use with npx without installation
npx @1337plus/llmdatagen
```

For alternative installation methods (from source, development setup, troubleshooting), see [docs/installation.md](docs/installation.md).

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

**Note**: The tool stores configurations and outputs in your Documents folder:
- Configurations: `~/Documents/llmdatagen/configs/`
- Generated files: `~/Documents/llmdatagen/output/`

For detailed usage instructions, command-line options, and advanced features, see [docs/usage.md](docs/usage.md).

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

## Documentation

- [Configuration Guide](docs/configuration.md) - Detailed guide on creating configurations
- [Usage Guide](docs/usage.md) - Command-line options and features
- [Installation](docs/installation.md) - Alternative installation methods
- [Examples](docs/examples.md) - Technical details for developers

## Contributing

1. Fork the repository
2. Create your feature branch
3. Submit a pull request

## License

MIT License - see LICENSE file for details