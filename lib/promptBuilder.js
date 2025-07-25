export class PromptBuilder {
  constructor(config) {
    this.config = config;
    this.systemPrompt = config.prompts?.system || 'Generate valid JSON data according to the schema.';
    this.examples = config.prompts?.examples || {};
  }

  buildPrompt(field, context = {}) {
    const generateConfig = field.generateConfig;
    
    if (!generateConfig) {
      return this._buildDefaultPrompt(field);
    }

    if (generateConfig.value) {
      return this._resolveTemplate(generateConfig.value, context);
    }

    if (generateConfig.template) {
      return this._resolveTemplate(generateConfig.template, context);
    }

    if (generateConfig.prompt) {
      const prompt = this._resolveTemplate(generateConfig.prompt, context);
      return this._enhancePrompt(prompt, field, generateConfig);
    }

    return this._buildDefaultPrompt(field);
  }

  buildSystemPrompt(additionalContext = '') {
    let prompt = this.systemPrompt;
    
    if (this.examples.good && this.examples.good.length > 0) {
      prompt += '\n\nПримеры хороших результатов:\n';
      this.examples.good.forEach((example, i) => {
        prompt += `${i + 1}. ${example}\n`;
      });
    }

    if (this.examples.bad && this.examples.bad.length > 0) {
      prompt += '\n\nПримеры плохих результатов (избегай таких):\n';
      this.examples.bad.forEach((example, i) => {
        prompt += `${i + 1}. ${example}\n`;
      });
    }

    if (additionalContext) {
      prompt += `\n\n${additionalContext}`;
    }

    return prompt;
  }

  buildStructurePrompt(schema, context = {}) {
    const structure = this._schemaToStructure(schema);
    const contextStr = this._formatContext(context);
    
    return `Сгенерируй JSON объект со следующей структурой:\n\n${JSON.stringify(structure, null, 2)}\n\n${contextStr}\n\nВажно: возвращай только валидный JSON без дополнительного текста.`;
  }

  _buildDefaultPrompt(field) {
    const type = field.type;
    const constraints = field.constraints;
    
    let prompt = `Сгенерируй значение типа ${type}`;
    
    if (field.enum) {
      prompt += ` из списка: ${field.enum.join(', ')}`;
    }
    
    if (constraints.minLength || constraints.maxLength) {
      prompt += ` (длина: ${constraints.minLength || 0}-${constraints.maxLength || 'неограничено'})`;
    }
    
    if (constraints.minimum !== undefined || constraints.maximum !== undefined) {
      prompt += ` (диапазон: ${constraints.minimum || 'min'}-${constraints.maximum || 'max'})`;
    }
    
    if (constraints.pattern) {
      prompt += ` (паттерн: ${constraints.pattern})`;
    }
    
    return prompt;
  }

  _enhancePrompt(prompt, field, generateConfig) {
    let enhanced = prompt;
    
    if (generateConfig.requirements && Array.isArray(generateConfig.requirements)) {
      enhanced += '\n\nТребования:\n';
      generateConfig.requirements.forEach((req, i) => {
        enhanced += `${i + 1}. ${req}\n`;
      });
    }
    
    if (generateConfig.minLength || field.constraints.minLength) {
      const min = generateConfig.minLength || field.constraints.minLength;
      enhanced += `\nМинимальная длина: ${min} символов`;
    }
    
    if (generateConfig.maxLength || field.constraints.maxLength) {
      const max = generateConfig.maxLength || field.constraints.maxLength;
      enhanced += `\nМаксимальная длина: ${max} символов`;
    }
    
    if (generateConfig.count) {
      enhanced += `\nКоличество элементов: ${generateConfig.count}`;
    }
    
    if (generateConfig.minItems || generateConfig.maxItems) {
      enhanced += `\nКоличество элементов: ${generateConfig.minItems || 1}-${generateConfig.maxItems || 'неограничено'}`;
    }
    
    return enhanced;
  }

  _resolveTemplate(template, context) {
    return template.replace(/\{([^}]+)\}/g, (match, key) => {
      if (key in context) {
        return context[key];
      }
      
      if (key.includes('_')) {
        const parts = key.split('_');
        if (parts[0] in context) {
          switch (parts[1]) {
            case 'minus':
              return context[parts[0]] - (parseInt(parts[2]) || 1);
            case 'plus':
              return context[parts[0]] + (parseInt(parts[2]) || 1);
            case 'translit':
              return this._transliterate(context[parts[0]]);
            default:
              return match;
          }
        }
      }
      
      return match;
    });
  }

  _transliterate(text) {
    const map = {
      'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd',
      'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z', 'и': 'i',
      'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
      'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
      'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch',
      'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '',
      'э': 'e', 'ю': 'yu', 'я': 'ya',
      'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D',
      'Е': 'E', 'Ё': 'Yo', 'Ж': 'Zh', 'З': 'Z', 'И': 'I',
      'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N',
      'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T',
      'У': 'U', 'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch',
      'Ш': 'Sh', 'Щ': 'Sch', 'Ъ': '', 'Ы': 'Y', 'Ь': '',
      'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
    };
    
    return text.split('').map(char => map[char] || char).join('')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .toLowerCase();
  }

  _schemaToStructure(schema) {
    if (schema.type === 'object' && schema.properties) {
      const obj = {};
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (prop['x-llm-generate']) {
          obj[key] = prop['x-llm-generate'].description || `<${prop.type}>`;
        } else {
          obj[key] = this._schemaToStructure(prop);
        }
      }
      return obj;
    }
    
    if (schema.type === 'array' && schema.items) {
      return [this._schemaToStructure(schema.items)];
    }
    
    if (schema['x-llm-generate']) {
      return schema['x-llm-generate'].description || `<${schema.type}>`;
    }
    
    return `<${schema.type || 'any'}>`;
  }

  _formatContext(context) {
    if (Object.keys(context).length === 0) return '';
    
    let str = 'Контекст:\n';
    for (const [key, value] of Object.entries(context)) {
      str += `- ${key}: ${value}\n`;
    }
    
    return str;
  }
}