# GitHub Codespaces Configuration

This project is configured to work with GitHub Codespaces.

## Getting Started

1. Open this repository in GitHub Codespaces
2. Wait for the container to build and dependencies to install
3. A `.env.local` file will be automatically created from the template
4. **Important**: Add your API keys to `.env.local`:
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `TAVILY_API_KEY` - Your Tavily API key
5. Run `npm run dev` to start the development server
6. The app will be available on port 3000 (automatically forwarded)

## Included Features

- Node.js 20
- GitHub CLI
- VS Code extensions for TypeScript, React, Tailwind CSS
- GitHub Copilot (if you have access)

## Development

The development server starts on port 3000. GitHub Codespaces will automatically forward this port and notify you when the server is ready.

### Available Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
