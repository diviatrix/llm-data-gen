# Usage Guide

## User Directories

The tool stores all user data in your Documents folder:

- **Configurations**: `~/Documents/llmdatagen/configs/`
- **Generated outputs**: `~/Documents/llmdatagen/output/`
- **Example configs**: `~/Documents/llmdatagen/configs/examples/`

On first install, the tool automatically:
1. Creates these directories
2. Copies example configurations for you to use and modify

## Command Line Options

### Generate Command (default)

Generate data using configuration:

```bash
llmdatagen generate [options]
  -c, --config <path>      Configuration file path
  -m, --model <model>      Override model
  -t, --temperature <val>  Override temperature (0-2)
  -o, --output <path>      Override output path
  --count <number>         Override count for first task
  --max-tokens <number>    Override max tokens
  --no-interactive         Skip interactive prompts
```

Examples:

```bash
# Use a specific configuration with interactive model selection
llmdatagen --config configs/examples/quiz.json

# Skip model selection and use specific model
llmdatagen --model openai/gpt-4o-mini

# Use default model without interactive prompts
llmdatagen --no-interactive

# Override output path
llmdatagen --config configs/examples/products.json --output ./my-data/

# Override temperature for more creative results
llmdatagen --temperature 1.2

# Generate only 10 items instead of configured amount
llmdatagen --count 10
```

### Other Commands

#### Validate

Validate existing JSON data against a schema:

```bash
llmdatagen validate <file> -s <schema>

# Example
llmdatagen validate output/quiz_questions.json -s configs/examples/quiz.json
```

#### Test Connection

Test OpenRouter API connection and display account info:

```bash
llmdatagen test-connection
```

#### List Examples

List all available example configurations:

```bash
llmdatagen list-examples
```

Output shows available example configurations with their properties and task counts.

#### Create Config

Create a new configuration from a template:

```bash
llmdatagen create-config basic -o my-config.json
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
    "format": "json",         // "json" (default) or "text"
    "type": "array",          // For JSON format only
    "outputPath": "./output/",
    "fileNameTemplate": "{category}.json",
    "fileExtension": ".txt"   // For text format only
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

## Advanced Features

### Template Variables

Use placeholders in your configurations:
- `{index}` - Current item index (0-based)
- `{date}` - Current date (YYYY-MM-DD)
- `{datetime}` - Full ISO datetime
- `{timestamp}` - Unix timestamp in milliseconds
- `{theme}`, `{topic}`, `{category}` - Task fields
- `{theme_translit}` - Transliterated theme (Cyrillic to Latin)
- `{topic_translit}`, `{category_translit}` - Other transliterations
- `{field_minus_1}`, `{field_plus_1}` - Numeric field ± 1

Example:
```json
{
  "id": {
    "type": "string",
    "x-llm-generate": {
      "template": "{theme_translit}_{index}"
    }
  }
}
```

### Text Format Generation

The generator supports two formats: JSON (default) and text. Text format allows you to generate any text-based content without JSON structure or validation.

#### Configuration for Text Format

```json
{
  "output": {
    "format": "text",
    "fileExtension": ".md",  // or .txt, .csv, etc.
    "outputPath": "./output/",
    "fileNameTemplate": "{topic_translit}_{index}.md"
  },
  "prompts": {
    "system": "System instructions for the AI",
    "userPrompt": "Generate {type} content about {topic}. Requirements: ..."
  }
  // No schema required for text format
}
```

#### Example Configurations

- **Blog Posts**: `configs/examples/blog-posts.json` - Generates Markdown articles
- **Email Templates**: `configs/examples/emails.json` - Creates professional emails
- **CSV Data**: `configs/examples/csv-data.json` - Produces CSV formatted data

#### Features

- No schema validation required
- Supports any text-based format (Markdown, CSV, SQL, etc.)
- Template variables work in prompts
- Each item saved to separate file when using `{index}` in filename

### Custom Validation

The validator supports (JSON format only):
- JSON Schema validation
- Custom rules via `x-llm-generate`
- Batch validation
- Detailed error reporting

### Progress Tracking

- Real-time progress indicators
- Automatic retry on failures (up to 3 attempts)
- Error collection and reporting
- Incremental saves

### Verbose Mode

Enable verbose mode during interactive parameter configuration. When prompted "Enable verbose mode?", choose Yes.

Verbose mode shows:
- Token usage for each request
- Cost calculation
- Actual model used (when using auto router)
- Preview of generated data

## Configuration Display

When you run the generator, it shows your account info and detailed configuration:

```
👤 Account Info:
  balance: $44.58 of $50.00 (10.8% used)
  usage: $5.42
  tier: Paid
  rate limit: 150 requests per 10s

📋 Configuration:
  name: Quiz Questions Generator
  version: 1.0
  model: openrouter/auto
  temperature: 0.6
  max tokens: 4000
  output path: ./data/quizzes/
  estimated max cost: Free

  Tasks (5):
    1. 30 items: theme=Аниме, difficulty=easy, answers=3
    2. 40 items: theme=Аниме, difficulty=easy, answers=4
    3. 20 items: theme=Аниме, difficulty=medium, answers=3
    4. 20 items: theme=История, difficulty=easy, answers=2
    5. 40 items: theme=PC игры, difficulty=medium, answers=4
```

For paid models, it shows estimated maximum cost based on max tokens × total requests.

## Interactive Model Selection

When you run the generator without specifying a model via `-m/--model` flag, you'll be presented with an interactive menu:

```
🤖 Current model: openrouter/auto
Fetching available models... ✔

? Select LLM model:
Legend: 🆓=Free 💰=Paid | [context] | 🔧=functions 👁️=vision ⚡=streaming | MM/DD/YYYY
❯ 🤖 Auto Router (selects best available model)
  🆓 Free    DeepSeek: R1                             [  64K] 🔧⚡  01/28/2025
  🆓 Free    Meta: Llama 3.2 3B Instruct              [ 128K] 🔧👁️⚡ 01/25/2025
  🆓 Free    Google: Gemma 2 9B                       [   8K] ⚡   01/20/2025
  💰 $0.15/M OpenAI: GPT-4o mini                      [ 128K] 🔧👁️⚡ 01/15/2025
  💰 $2.50/M OpenAI: GPT-4o                           [ 128K] 🔧👁️⚡ 01/10/2025
  💰 $3.00/M Anthropic: Claude 3.5 Sonnet             [ 200K] 🔧👁️⚡ 01/05/2025
  ... (showing 25 newest models)
  📋 Show all models...
  🔍 Enter manually...
```

Features:
- **Auto Router** - Automatically selects the best available model
- **Live model list** - Always up-to-date from OpenRouter API
- **Sorted by newest** - Shows the 25 most recently added models
- **Context window** - Shows token limit in brackets
- **Capabilities** - Icons show model features:
  - 🔧 = Function calling support
  - 👁️ = Vision/image support
  - ⚡ = Streaming support
  - 🧠 = Reasoning support
- **Price display** - 🆓 for free models, 💰 with cost per million tokens
- **Release dates** - Shows when model was added
- **Filters** - Filter by free/paid, capabilities, parameters, modalities
- **Manual entry** - Option to enter any model ID manually

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