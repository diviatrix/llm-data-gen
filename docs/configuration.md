# Configuration Guide

This guide provides detailed information on how to create and customize configurations for the LLM Data Generator.

## Table of Contents

1. [Configuration Structure](#configuration-structure)
2. [Format Types](#format-types)
3. [JSON Format Configuration](#json-format-configuration)
4. [Text Format Configuration](#text-format-configuration)
5. [Template Variables](#template-variables)
6. [Advanced Features](#advanced-features)
7. [Examples](#examples)

## Configuration Structure

Every configuration file is a JSON document with the following main sections:

```json
{
  "meta": {},      // Metadata about the configuration
  "api": {},       // API settings for the LLM
  "output": {},    // Output settings and file handling
  "schema": {},    // JSON Schema (JSON format only)
  "prompts": {},   // System and user prompts
  "generation": {} // Generation tasks
}
```

## Format Types

The generator supports two output formats:

### 1. JSON Format (default)
- Structured data generation
- Schema validation
- Type safety
- Best for: APIs, databases, structured datasets

### 2. Text Format
- Freeform text generation
- No schema required
- Flexible output
- Best for: Articles, emails, CSV, SQL, documentation

## JSON Format Configuration

### Basic Structure

```json
{
  "meta": {
    "name": "My Data Generator",
    "version": "1.0",
    "description": "Generates structured data"
  },
  "api": {
    "provider": "openrouter",
    "model": "openrouter/auto",
    "temperature": 0.7,
    "maxTokens": 4000
  },
  "output": {
    "format": "json",
    "type": "array",
    "outputPath": "./output/",
    "fileNameTemplate": "{category}_{date}.json"
  },
  "schema": {
    "type": "object",
    "properties": {
      "id": { "type": "string" },
      "name": { "type": "string" },
      "price": { "type": "number" }
    },
    "required": ["id", "name", "price"]
  },
  "prompts": {
    "system": "Generate realistic product data following the schema."
  },
  "generation": {
    "tasks": [
      {
        "category": "electronics",
        "count": 10
      }
    ]
  }
}
```

### Schema with x-llm-generate Extensions

The `x-llm-generate` extension provides fine control over field generation:

```json
{
  "schema": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "x-llm-generate": {
          "template": "PROD_{category}_{index}"
        }
      },
      "name": {
        "type": "string",
        "minLength": 10,
        "maxLength": 100,
        "x-llm-generate": {
          "prompt": "Generate a creative product name for {category}",
          "requirements": [
            "Use descriptive adjectives",
            "Include the product type"
          ]
        }
      },
      "price": {
        "type": "number",
        "minimum": 10,
        "maximum": 1000,
        "x-llm-generate": {
          "range": [10, 1000],
          "description": "Price in USD"
        }
      },
      "tags": {
        "type": "array",
        "items": { "type": "string" },
        "x-llm-generate": {
          "prompt": "Generate 3-5 relevant tags",
          "minItems": 3,
          "maxItems": 5
        }
      }
    }
  }
}
```

### x-llm-generate Options

- **template**: Fixed template with variables
- **value**: Static value
- **prompt**: Custom generation prompt
- **requirements**: Array of requirements
- **range**: [min, max] for numbers
- **minLength/maxLength**: String length constraints
- **minItems/maxItems**: Array size constraints
- **description**: Field description for the LLM

## Text Format Configuration

### Basic Structure

```json
{
  "meta": {
    "name": "Blog Post Generator",
    "version": "1.0",
    "description": "Generates blog posts in Markdown"
  },
  "api": {
    "provider": "openrouter",
    "model": "openrouter/auto",
    "temperature": 0.8,
    "maxTokens": 3000
  },
  "output": {
    "format": "text",
    "fileExtension": ".md",
    "outputPath": "./output/blog/",
    "fileNameTemplate": "{topic_translit}_{index}.md"
  },
  "prompts": {
    "system": "You are an expert blog writer. Write engaging, informative blog posts.",
    "userPrompt": "Write a blog post about {topic}. Include:\n- Engaging title\n- Introduction\n- 3-5 main sections\n- Conclusion\n- Minimum 800 words"
  },
  "generation": {
    "tasks": [
      {
        "topic": "Artificial Intelligence",
        "count": 3
      }
    ]
  }
}
```

### Text Format Features

- No schema validation
- Flexible content generation
- Support for any text-based format
- Template variables in prompts

## Template Variables

Variables can be used in various places using `{variable}` syntax:

### Built-in Variables

- `{index}` - Current item index (1-based)
- `{date}` - Current date (YYYY-MM-DD)
- `{timestamp}` - Current timestamp

### Task Variables

Any field from the task object:
- `{category}`, `{theme}`, `{topic}` - Main subject
- `{difficulty}`, `{type}`, `{purpose}` - Task attributes
- Custom fields from your tasks

### Derived Variables

- `{theme_translit}` - Transliterated theme (Cyrillic to Latin)
- `{topic_translit}` - Transliterated topic
- `{category_translit}` - Transliterated category
- `{field_minus_1}` - Numeric field minus 1
- `{field_plus_1}` - Numeric field plus 1

### Usage Examples

```json
{
  "output": {
    "fileNameTemplate": "{category}_{difficulty}_{index}.json"
  },
  "schema": {
    "properties": {
      "id": {
        "x-llm-generate": {
          "template": "{category}_{index:04d}"
        }
      }
    }
  }
}
```

## Advanced Features

### Multiple Output Types

For JSON format, you can choose output structure:

```json
{
  "output": {
    "type": "array"    // Outputs: [{}, {}, {}]
    // or
    "type": "object"   // Outputs: { "key": [{}, {}] }
  }
}
```

### Conditional Generation

Use task properties to control generation:

```json
{
  "generation": {
    "tasks": [
      {
        "category": "premium",
        "priceRange": "high",
        "features": "advanced",
        "count": 5
      },
      {
        "category": "budget",
        "priceRange": "low",
        "features": "basic",
        "count": 10
      }
    ]
  }
}
```

### System Prompt Examples

Include examples in your system prompt:

```json
{
  "prompts": {
    "system": "Generate product data.",
    "examples": {
      "good": [
        "Products with detailed, realistic descriptions",
        "Prices that match the product category"
      ],
      "bad": [
        "Generic names like 'Product 1'",
        "Unrealistic price ranges"
      ]
    }
  }
}
```

## Advanced Integration Examples

### News Digest with Web Search

Modern LLM models available through OpenRouter (such as Claude 3.5 Sonnet and newer) have built-in web search capabilities. This allows you to create real-time news digests without additional integrations.

#### How it works:
1. The LLM searches the web for recent news
2. Analyzes and filters relevant articles
3. Extracts key information
4. Formats it according to your schema

#### Example configurations:
- `configs/examples/news-digest.json` - Structured news data (JSON format)
  - Real article titles, summaries, URLs
  - Publication dates and sources
  - Relevance scoring and sentiment analysis
  
- `configs/examples/news-digest-markdown.json` - Readable news digest (Text format)
  - Professional news digest format
  - Executive summaries
  - Trend analysis sections

#### Supported models with web search:
- `anthropic/claude-sonnet-4` - Claude Sonnet 4
- `anthropic/claude-4-opus-20250522` - Claude Opus 4
- Other modern models - check OpenRouter documentation

Note: Web search capabilities depend on the model. Older models may not support this feature.

## Examples

### E-commerce Products (JSON)

```json
{
  "meta": {
    "name": "Product Catalog Generator",
    "version": "1.0"
  },
  "api": {
    "model": "openrouter/auto",
    "temperature": 0.7
  },
  "output": {
    "format": "json",
    "outputPath": "./products/",
    "fileNameTemplate": "{category}_products.json"
  },
  "schema": {
    "type": "object",
    "properties": {
      "sku": {
        "type": "string",
        "x-llm-generate": {
          "template": "SKU-{category}-{index:04d}"
        }
      },
      "name": { "type": "string" },
      "description": { "type": "string" },
      "price": { "type": "number" },
      "inStock": { "type": "boolean" }
    }
  },
  "generation": {
    "tasks": [
      { "category": "electronics", "count": 20 },
      { "category": "clothing", "count": 30 }
    ]
  }
}
```

### Email Templates (Text)

```json
{
  "meta": {
    "name": "Email Generator",
    "version": "1.0"
  },
  "output": {
    "format": "text",
    "fileExtension": ".txt",
    "outputPath": "./emails/",
    "fileNameTemplate": "{type}_{purpose}.txt"
  },
  "prompts": {
    "system": "Write professional emails.",
    "userPrompt": "Write a {type} email for {purpose}. Tone: {tone}"
  },
  "generation": {
    "tasks": [
      {
        "type": "sales",
        "purpose": "product_launch",
        "tone": "enthusiastic",
        "count": 1
      }
    ]
  }
}
```

### CSV Data (Text)

```json
{
  "meta": {
    "name": "CSV Generator",
    "version": "1.0"
  },
  "output": {
    "format": "text",
    "fileExtension": ".csv",
    "fileNameTemplate": "{dataType}_export.csv"
  },
  "prompts": {
    "system": "Generate CSV data with headers.",
    "userPrompt": "Generate {rows} rows of {dataType} data. Columns: {columns}"
  },
  "generation": {
    "tasks": [
      {
        "dataType": "users",
        "rows": 100,
        "columns": "id,name,email,created_date",
        "count": 1
      }
    ]
  }
}
```

## Best Practices

1. **Start Simple**: Begin with basic configurations and add complexity gradually
2. **Use Templates**: For predictable fields like IDs, use templates
3. **Be Specific**: Clear prompts yield better results
4. **Test Small**: Test with small counts before generating large datasets
5. **Validate Output**: Always verify generated data meets your requirements

## Troubleshooting

### Common Issues

1. **Validation Errors**
   - Check schema constraints match your expectations
   - Ensure required fields are defined
   - Verify data types are correct

2. **Poor Quality Output**
   - Adjust temperature (lower = more consistent)
   - Improve prompts with specific requirements
   - Add examples to system prompt

3. **File Naming Issues**
   - Ensure template variables exist in tasks
   - Check for invalid filename characters
   - Verify output path exists

### Tips

- Use verbose mode to see generation details
- Check generated files frequently during development
- Keep configurations in version control
- Document your custom configurations