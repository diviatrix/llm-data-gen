# LLM Data Generator

Universal JSON data generator using Large Language Models with configurable JSON schemas. Generate any type of structured data with LLM assistance.

## Features

- 🎯 **Schema-driven generation** - Define your data structure using JSON Schema
- 🤖 **LLM-powered** - Uses OpenRouter API to access various LLM models
- 📝 **Custom prompts** - Fine-tune generation with field-specific prompts
- ✅ **Validation** - Built-in JSON Schema validation
- 🔄 **Batch processing** - Generate multiple items with progress tracking
- 🛠️ **CLI interface** - Easy-to-use command line tool
- 📦 **Extensible** - Add your own configurations and schemas

## Installation

```bash
# Clone the repository
git clone https://github.com/diviatrix/llm-data-gen.git
cd llm-data-gen

# Install dependencies
npm install

# Make CLI executable
chmod +x index.js

# Optional: Link globally
npm link
```

## Configuration

Set your OpenRouter API key:
```bash
export OPENROUTER_API_KEY=your-api-key-here
```

## Quick Start

```bash
# Generate data using default config
./index.js

# Use a specific configuration
./index.js --config configs/examples/quiz.json

# List available examples
./index.js list-examples

# Test API connection
./index.js test-connection
```

## Configuration Format

### Basic Structure

```json
{
  "meta": {
    "name": "Configuration name",
    "version": "1.0",
    "description": "Description"
  },
  "api": {
    "provider": "openrouter",
    "model": "openrouter/auto",
    "temperature": 0.6,
    "maxTokens": 4000
  },
  "output": {
    "type": "array",
    "outputPath": "./output/",
    "fileNameTemplate": "{category}.json"
  },
  "schema": {
    "type": "object",
    "properties": {
      // Your JSON Schema here
    }
  },
  "prompts": {
    "system": "System prompt for the LLM"
  },
  "generation": {
    "tasks": [
      // Generation tasks
    ]
  }
}
```

### Extended Schema with x-llm-generate

The `x-llm-generate` extension allows you to control how each field is generated:

```json
{
  "name": {
    "type": "string",
    "x-llm-generate": {
      "prompt": "Generate a creative product name",
      "maxLength": 100
    }
  },
  "id": {
    "type": "string",
    "x-llm-generate": {
      "template": "PROD_{category}_{index}"
    }
  },
  "price": {
    "type": "number",
    "x-llm-generate": {
      "range": [10, 1000],
      "description": "Price in USD"
    }
  }
}
```

### Generation Tasks

Define what data to generate:

```json
{
  "generation": {
    "tasks": [
      {
        "category": "electronics",
        "count": 20,
        "difficulty": "easy"
      }
    ]
  }
}
```

## CLI Commands

### generate (default)
Generate data using configuration:
```bash
./index.js generate [options]
  -c, --config <path>      Configuration file path
  -m, --model <model>      Override model
  -t, --temperature <val>  Override temperature (0-2)
  -o, --output <path>      Override output path
  --count <number>         Override count for first task
  --max-tokens <number>    Override max tokens
```

### validate
Validate existing JSON data:
```bash
./index.js validate <file> -s <schema>
```

### test-connection
Test OpenRouter API connection:
```bash
./index.js test-connection
```

### list-examples
List available example configurations:
```bash
./index.js list-examples
```

### create-config
Create a new example configuration:
```bash
./index.js create-config basic -o my-config.json
```

## Examples

### Quiz Questions Generator

Generate quiz questions with multiple choice answers:

```bash
./index.js --config configs/examples/quiz.json
```

Configuration highlights:
- Generates questions with 2-4 answer options
- Supports difficulty levels
- Adds relevant tags
- Validates answer indices

### Product Catalog

Generate e-commerce product listings:

```bash
./index.js --config configs/examples/products.json
```

### Blog Articles

Generate blog article metadata:

```bash
./index.js --config configs/examples/articles.json
```

## Advanced Features

### Template Variables

Use placeholders in your configurations:
- `{index}` - Current item index
- `{theme}` - Current theme/category
- `{theme_translit}` - Transliterated theme
- `{count}` - Total count
- `{field_minus_1}` - Field value minus 1

### Custom Validation

The validator supports:
- JSON Schema validation
- Custom rules via `x-llm-generate`
- Batch validation
- Detailed error reporting

### Progress Tracking

- Real-time progress indicators
- Automatic retry on failures
- Error collection and reporting
- Incremental saves

## API Reference

### SchemaParser
Parses JSON Schema and extracts generation metadata.

### PromptBuilder
Constructs prompts from schema and configuration.

### OpenRouterClient
Handles communication with OpenRouter API.

### DataGenerator
Main generation engine with validation.

### ConfigManager
Manages configuration files and merging.

## Troubleshooting

### Connection Issues
- Check your API key is set correctly
- Verify internet connection
- Use `test-connection` command

### Generation Errors
- Check schema validity
- Reduce temperature for more consistent results
- Increase max tokens for longer content

### Validation Failures
- Review schema constraints
- Check generated data manually
- Adjust prompts for better compliance

## Contributing

1. Fork the repository
2. Create your feature branch
3. Add tests for new features
4. Submit a pull request

## License

MIT License - see LICENSE file for details