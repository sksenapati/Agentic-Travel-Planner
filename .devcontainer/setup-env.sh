#!/bin/bash

# Script to initialize .env.local if it doesn't exist
ENV_FILE=".env.local"
ENV_EXAMPLE=".env.example"

if [ ! -f "$ENV_FILE" ]; then
    echo "📝 Creating $ENV_FILE from template..."
    
    if [ -f "$ENV_EXAMPLE" ]; then
        cp "$ENV_EXAMPLE" "$ENV_FILE"
        echo "✅ $ENV_FILE created successfully!"
        echo ""
        echo "⚠️  IMPORTANT: Please add your API keys to $ENV_FILE:"
        echo "   - OPENAI_API_KEY"
        echo "   - TAVILY_API_KEY"
        echo ""
    else
        # Fallback: create a basic .env.local file
        cat > "$ENV_FILE" << 'EOF'
# Environment Variables
# Add your API keys below

# OpenAI API Key (required for AI chat functionality)
OPENAI_API_KEY=

# Tavily API Key (required for travel search functionality)
TAVILY_API_KEY=
EOF
        echo "✅ $ENV_FILE created successfully!"
        echo ""
        echo "⚠️  IMPORTANT: Please add your API keys to $ENV_FILE"
        echo ""
    fi
else
    echo "✅ $ENV_FILE already exists"
fi
