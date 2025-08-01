# API Reference

## Overview

The LLM Data Generator API provides endpoints for data generation, configuration management, user authentication, and file operations. The API supports both local (admin) and cloud (multi-tenant) modes.

## Base URL

- Local: `http://localhost:3000/api`
- Production: `https://your-domain.com/api`

## Authentication

### Cloud Mode
All API endpoints (except auth endpoints) require authentication in cloud mode. Include the Bearer token in the Authorization header:

```
Authorization: Bearer <token>
```

### Local Mode (localhost)
No authentication required when accessing from localhost.

## API Endpoints

### Authentication & User Management

#### Login
`POST /api/auth/login`

Request:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:
```json
{
  "success": true,
  "token": "jwt-token",
  "user": {
    "id": 1,
    "email": "user@example.com"
  }
}
```

#### Logout
`POST /api/auth/logout`

Headers:
- `Authorization: Bearer <token>`

Response:
```json
{
  "success": true
}
```

#### Change Password
`POST /api/auth/change-password`

Request:
```json
{
  "email": "user@example.com",
  "currentPassword": "oldpass",
  "newPassword": "newpass"
}
```

### API Key Management

#### Check API Key
`GET /api/user/api-key`

Response:
```json
{
  "success": true,
  "hasKey": true
}
```

#### Save API Key
`POST /api/user/api-key`

Request:
```json
{
  "apiKey": "sk-or-v1-..."
}
```

#### Delete API Key
`DELETE /api/user/api-key`

### Admin Endpoints (localhost only)

#### List Users
`GET /api/admin/users`

#### Create User
`POST /api/admin/users`

Request:
```json
{
  "email": "newuser@example.com",
  "password": "password123"
}
```

#### Toggle User Active Status
`PUT /api/admin/users/:id/toggle`

#### Delete User
`DELETE /api/admin/users/:id`

#### Reset User Password
`POST /api/admin/users/:id/reset-password`

Request:
```json
{
  "newPassword": "newpassword123"
}
```

### Core Functionality

#### Get Account Info
`GET /api/account`

Response:
```json
{
  "success": true,
  "account": {
    "balance": "45.58",
    "limit": "50.00",
    "usage": "4.42",
    "percentUsed": 8.8,
    "tier": "standard"
  }
}
```

#### Get Available Models
`GET /api/models`

Response:
```json
{
  "success": true,
  "models": [
    {
      "id": "openai/gpt-4",
      "name": "GPT-4",
      "context_length": 8192,
      "pricing": {
        "prompt": 0.00003,
        "completion": 0.00006
      },
      "top_provider": "OpenAI",
      "supports_web_search": true,
      "has_native_web_search": false,
      "web_search_pricing": {
        "plugin": 0.02,
        "native": null
      }
    }
  ]
}
```

#### Validate Configuration
`POST /api/validate-config`

Request:
```json
{
  "prompt": "Generate a product",
  "schema": {
    "type": "object",
    "properties": {
      "name": { "type": "string" }
    }
  },
  "output": {
    "format": "json"
  }
}
```

Response:
```json
{
  "success": true,
  "message": "Configuration is valid",
  "config": { /* validated config */ }
}
```

#### Generate Data
`POST /api/generate`

Request:
```json
{
  "prompt": "Generate 5 products",
  "schema": { /* JSON Schema */ },
  "model": {
    "id": "openai/gpt-3.5-turbo",
    "temperature": 0.7
  },
  "output": {
    "format": "json",
    "count": 5
  }
}
```

Response:
```json
{
  "success": true,
  "results": [ /* generated items */ ],
  "stats": {
    "totalGenerated": 5,
    "totalCost": 0.0025,
    "errors": []
  }
}
```

#### Generate Data with Streaming (Server-Sent Events)
`POST /api/generate-stream`

Request:
```json
{
  "config": {
    /* same as POST /api/generate request body */
  }
}
```

Response: Server-Sent Events stream

Event types:
```javascript
// Start event
data: {"type": "start"}

// Progress event
data: {
  "type": "progress",
  "progress": {
    "current": 3,
    "total": 10,
    "percentage": 30,
    "currentItem": "products"
  }
}

// Complete event
data: {
  "type": "complete",
  "results": [ /* generated items */ ],
  "stats": {
    "totalGenerated": 10,
    "totalCost": 0.005,
    "errors": []
  }
}

// Error event
data: {
  "type": "error",
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### File Operations

#### Upload Configuration
`POST /api/upload-config`

Form data:
- `config`: JSON file

Response:
```json
{
  "success": true,
  "config": { /* parsed config */ },
  "filename": "config.json"
}
```

#### Upload Result
`POST /api/upload-result`

Form data:
- `result`: JSON file

#### Get Example Configurations
`GET /api/examples`

Response:
```json
{
  "success": true,
  "examples": {
    "products.json": { /* config */ },
    "articles.json": { /* config */ }
  }
}
```

### Configuration Management

#### List User Configurations
`GET /api/config-files`

Response:
```json
{
  "success": true,
  "configsDir": "/path/to/configs",
  "files": [
    {
      "name": "my-config.json",
      "path": "/full/path",
      "size": 1024,
      "modified": "2024-01-01T00:00:00Z",
      "created": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### Get Configuration
`GET /api/config-file/:filename`

Response:
```json
{
  "success": true,
  "filename": "my-config.json",
  "content": { /* config content */ }
}
```

#### Get Configuration File
`GET /api/config-file/:filename`

Response:
```json
{
  "success": true,
  "filename": "my-config.json",
  "content": { /* config object */ }
}
```

#### Save Configuration
`POST /api/config-files`

Request:
```json
{
  "filename": "my-config.json",
  "content": { /* config object */ }
}
```

#### Delete Configuration
`DELETE /api/config-file/:filename`

### Output Files

#### Save Output File
`POST /api/output-files`

Request:
```json
{
  "filename": "results.json",
  "content": { /* file content */ },
  "path": "optional/relative/path.json"  // Optional, for saving to specific location
}
```

Response:
```json
{
  "success": true,
  "filename": "results.json",
  "path": "outputs/results.json",
  "message": "File saved successfully"
}
```

#### List Output Files
`GET /api/output-files?subpath=optional/path`
`GET /api/result-files?subpath=optional/path` (alias)

Response:
```json
{
  "success": true,
  "outputDir": "/path/to/output",
  "currentPath": "optional/path",
  "files": [
    {
      "name": "results.json",
      "path": "/full/path",
      "relativePath": "optional/path/results.json",
      "size": 2048,
      "modified": "2024-01-01T00:00:00Z",
      "created": "2024-01-01T00:00:00Z",
      "isJson": true,
      "isDirectory": false,
      "extension": ".json"
    }
  ]
}
```

#### Get Result File
`GET /api/result-file/*`

For JSON files, returns:
```json
{
  "success": true,
  "filename": "results.json",
  "content": { /* file content */ }
}
```

For non-JSON files, downloads the file directly.

### Chat

#### Send Chat Message
`POST /api/chat`

Request:
```json
{
  "model": "openai/gpt-3.5-turbo",
  "messages": [
    {
      "role": "user",
      "content": "Hello!"
    }
  ]
}
```

Response:
```json
{
  "success": true,
  "message": "Assistant response",
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30,
    "total_cost": 0.0005
  }
}
```

### System

#### Health Check
`GET /api/health`

Response:
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

#### Mode Detection
`GET /api/mode`

Response:
```json
{
  "isCloud": false,
  "isAdmin": true
}
```

## Error Responses

All endpoints return errors in the following format:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE" // optional
}
```

Common HTTP status codes:
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (missing/invalid auth)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error
- `503` - Service Unavailable (temporary issue)