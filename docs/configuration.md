# Configuration Guide

Practical guide for creating LLM Data Generator configurations.

## Manual Configuration
Set your OpenRouter API key:
```bash
export OPENROUTER_API_KEY=your-api-key-here
```

Create a simple configuration to generate product data:

## Quick Start

```json
{
  "meta": {
    "name": "Product Generator",
    "version": "1.0"
  },
  "api": {
    "model": "openrouter/auto",
    "temperature": 0.7
  },
  "output": {
    "outputPath": "./output/",
    "fileNameTemplate": "{category}_{index}.json"
  },
  "schema": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "price": { "type": "number" }
    }
  },
  "generation": {
    "tasks": [
      { "category": "electronics", "count": 10 }
    ]
  }
}
```

Given the configuration, the generator will create 10 product items in the "electronics" category. Each item will have a `name` (string) and a `price` (number). Output files will be saved in the `./output/` directory, with filenames like `electronics_0.json`, `electronics_1.json`, etc.

**Sample Output (`electronics_0.json`):**
```json
{
  "name": "Wireless Bluetooth Headphones",
  "price": 59.99
}
```

**Sample Output (`electronics_1.json`):**
```json
{
  "name": "Smart Fitness Tracker",
  "price": 39.95
}
```

## Configuration Blocks

### meta
- `name` (string): Configuration name
- `version` (string): Version identifier
- `description` (string, optional): Description

### api
- `provider` (string): Always "openrouter"
- `model` (string): Model ID or "openrouter/auto"
- `temperature` (number): 0-2, controls randomness
- `maxTokens` (number): Max tokens per request
- `batchDelay` (number, optional): Delay between requests in ms

### output
- `format` (string): "json" (default) or "text"
- `type` (string): "array" or "object" (JSON format only)
- `outputPath` (string): Output directory
- `fileNameTemplate` (string): Filename with variables
- `fileExtension` (string): For text format only

### schema (JSON format only)
Standard JSON Schema with `x-llm-generate` extensions:
- `template`: Fixed template with variables
- `value`: Static value
- `prompt`: Custom generation prompt
- `requirements`: Array of requirements
- `range`: [min, max] for numbers
- `description`: Field description

### prompts
- `system` (string): System prompt
- `userPrompt` (string): For text format, supports variables
- `examples` (object, optional): Good/bad examples

### generation
- `tasks` (array): List of generation tasks
  - `count` (number): Items to generate
  - Any custom fields become variables

## Template Variables

### Built-in
- `{index}` - Item index (0-based)
- `{date}` - YYYY-MM-DD
- `{datetime}` - ISO datetime
- `{timestamp}` - Unix timestamp

### From Tasks
- Any task field: `{category}`, `{theme}`, `{topic}`
- Transliterated: `{theme_translit}`, `{topic_translit}`
- Numeric modifiers: `{field_minus_1}`, `{field_plus_1}`

### Usage
- In `fileNameTemplate`: `"{category}_{index}.json"`
- In `x-llm-generate.template`: `"PROD_{category}_{index}"`
- In `userPrompt` (text format): `"Write about {topic}"`

## Output Formats

### JSON Format (default)
- Requires `schema` block
- Validates against JSON Schema
- Supports `x-llm-generate` extensions
- Output types: "array" or "object"

### Text Format
- Set `output.format: "text"`
- No schema required
- Uses `prompts.userPrompt` with variables
- Specify `output.fileExtension`

## Web Search Models

To enable web search, add `:online` suffix:
- `anthropic/claude-sonnet-4:online`
- `anthropic/claude-4-opus-20250522:online`

Note: Not all models support web search.

## Validation

### JSON Format
- Validates against JSON Schema
- Checks required fields
- Validates types, formats, constraints
- Returns detailed error messages

### Text Format
- No content validation
- Returns LLM output as-is
- Only checks for API errors

## Example Configurations

### JSON Format Examples
- `configs/examples/quiz.json` - Quiz questions with validation
- `configs/examples/products.json` - E-commerce products
- `configs/examples/articles.json` - Blog metadata
- `configs/examples/news-digest.json` - News with web search

### Text Format Examples
- `configs/examples/blog-posts.json` - Markdown articles
- `configs/examples/emails.json` - Email templates
- `configs/examples/csv-data.json` - CSV generation
- `configs/examples/news-digest-markdown.json` - News digest

## Tips

- Lower temperature (0.3-0.5) for consistent data
- Higher temperature (0.8-1.2) for creative content
- Use `x-llm-generate.template` for predictable fields
- Test with small counts first
- Enable verbose mode for debugging