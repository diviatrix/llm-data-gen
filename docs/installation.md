# Installation Guide

## Install from source

```bash
# Clone the repository
git clone https://github.com/diviatrix/llm-data-gen.git
cd llm-data-gen

# Install dependencies
npm install

# Link globally for development
npm link
```

## Development Setup

If you want to contribute or modify the code:

```bash
# Fork the repository on GitHub first
git clone https://github.com/YOUR-USERNAME/llm-data-gen.git
cd llm-data-gen

# Add upstream remote
git remote add upstream https://github.com/diviatrix/llm-data-gen.git

# Install dependencies
npm install

# Create a new branch for your changes
git checkout -b feature/your-feature-name
```

## Troubleshooting

### Command Not Found

If `llmdatagen` command is not found after installation:

1. Check where npm installs global packages:
   ```bash
   npm config get prefix
   ```

2. Add the bin directory to your PATH:
   ```bash
   # For bash
   echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
   source ~/.bashrc
   
   # For zsh
   echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.zshrc
   source ~/.zshrc
   ```

3. Or use npx without global installation:
   ```bash
   npx @1337plus/llmdatagen
   ```

### Permission Errors

If you encounter permission errors during global installation:

```bash
# Configure npm to use a different directory for global packages
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Then install globally
npm install -g @1337plus/llmdatagen
```

### Node Version Issues

This package requires Node.js 18 or higher. Check your version:

```bash
node --version
```

If you need to update Node.js, consider using a version manager like `nvm`:
