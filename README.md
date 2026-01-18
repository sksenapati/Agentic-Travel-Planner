# Travel Planner Chatbot

An intelligent travel planning assistant built with Next.js, React, TypeScript, and LangChain's StateGraph pattern. The chatbot guides users through a structured conversation flow to gather travel requirements, searches for destinations using Tavily API, validates budgets, and generates personalized travel plans.

## Features

- 🎯 **StateGraph Architecture**: 11-node state machine for structured conversation flow
- 🤖 **OpenAI GPT-4o-mini**: Powered by ChatOpenAI for intelligent, context-aware responses
- 🔍 **Tavily Search Integration**: Real-time destination and activity searches
- 💰 **Budget Allocation System**: Intelligent handshaking between user budget and destination costs
- ✅ **Validation Workflow**: Detects budget overruns and prompts users to increase budget
- 📊 **Graph Visualization**: Dynamic mermaid.js visualization of StateGraph structure
- 💬 **Markdown Formatting**: Supports bold text, links, headings, and lists in responses
- 🌓 **Dark Mode Support**: Automatically adapts to system preferences
- 📱 **Fully Responsive**: Works seamlessly on desktop and mobile devices

## Getting Started

### Prerequisites

You'll need:
- Node.js 18+ and npm
- OpenAI API key from [OpenAI Platform](https://platform.openai.com/api-keys)
- Tavily API key from [Tavily](https://tavily.com/)

### Installation

```bash
npm install
```

### Environment Setup

1. Create a `.env.local` file in the root directory:

```env
OPENAI_API_KEY=sk-proj-your-actual-api-key-here
TAVILY_API_KEY=tvly-your-actual-api-key-here
```

2. **Important**: Never commit `.env.local` - it's already in `.gitignore`

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the chatbot.

View the StateGraph visualization at [http://localhost:3000/graph](http://localhost:3000/graph).

### Build for Production

```bash
npm run build
npm run start
```

## Architecture

### StateGraph Flow

The chatbot uses a **StateGraph** pattern with 11 nodes to guide the conversation:

1. **ask_origin** → Asks for departure city
2. **ask_destination** → Asks for destination
3. **ask_start_date** → Asks for start date
4. **ask_end_date** → Asks for end date  
5. **ask_travelers** → Asks for number of travelers
6. **ask_budget** → Asks for budget per person
7. **ask_purpose** → Asks for trip purpose (leisure/business/adventure/cultural)
8. **ask_planning_type** → Asks if user wants "balanced" or "top-rated" planning
9. **search_options** → Searches destinations and activities using Tavily API
10. **handle_validation_issues** → Validates budget allocation, prompts for increase if needed
11. **generate_plan** → Generates final personalized travel plan with LLM

### Conditional Edges

- Each "ask" node has validation logic that routes to next question or retry
- **Budget Allocation Handshaking**: After search, the system validates if budget covers recommendations
- **Validation States**: `VALIDATION_PASSED`, `SEARCH_PENDING`, `TOTAL_BUDGET_EXCEEDED`
- If budget exceeded, user is prompted to increase budget and conversation retries

### Graph Visualization

Visit [/graph](http://localhost:3000/graph) to see a dynamic **Mermaid.js** visualization of the StateGraph. The graph is generated in real-time from the actual `buildStateGraph()` method using the `exportGraphStructure()` API, ensuring it always matches the implementation.

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── chat/
│   │   │   └── route.ts      # Main chat API endpoint
│   │   └── graph/
│   │       └── route.ts      # Graph structure export API
│   ├── graph/
│   │   └── page.tsx          # Graph visualization page
│   ├── layout.tsx            # Root layout
│   ├── page.tsx              # Home page with chatbot
│   └── globals.css           # Global styles
├── components/
│   ├── Chatbot.tsx           # Main chatbot component
│   ├── Message.tsx           # Message display with markdown formatting
│   ├── ChatInput.tsx         # Input field component
│   ├── ConversationEngine.ts # StateGraph implementation (1900+ lines)
│   └── GraphVisualizer.tsx   # Mermaid.js graph renderer
├── .github/
│   └── copilot-instructions.md
├── .env.local                # Environment variables (not committed)
├── .gitignore
├── test-api.js               # Test script (not committed)
└── package.json
```

## How It Works

### 1. User Interaction
User sends messages through the chat interface ([Chatbot.tsx](components/Chatbot.tsx)).

### 2. API Processing
Messages are sent to [/api/chat](app/api/chat/route.ts), which:
- Instantiates `ConversationEngine`
- Invokes the StateGraph with user input
- Returns the chatbot's response

### 3. State Management
[ConversationEngine.ts](components/ConversationEngine.ts) manages:
- **State object**: Tracks conversation data (origin, destination, dates, budget, etc.)
- **Graph nodes**: Each node handles specific tasks (asking questions, searching, validating)
- **Conditional routing**: Validates responses and routes to appropriate next node
- **LLM integration**: Uses ChatOpenAI for personalized responses
- **Search integration**: Uses Tavily API for destination/activity searches

### 4. Budget Validation Flow
1. User provides budget per person
2. System searches for destinations and activities
3. System calculates total costs
4. If `totalCost > (budget * travelers)`:
   - Sets state to `TOTAL_BUDGET_EXCEEDED`
   - Displays validation message with required budget
   - Prompts user to increase budget
   - User can increase or reject
5. If accepted, conversation retries with new budget
6. If rejected, generates plan within original budget

### 5. Response Formatting
[Message.tsx](components/Message.tsx) formats responses with:
- **Bold text**: `**text**` → bold
- **Links**: `[text](url)` → clickable links
- **Headings**: `###`, `##`, `#` → styled headings
- **Lists**: Bullet and numbered lists

### 6. Graph Visualization
[/graph](app/graph/page.tsx) page:
1. Fetches graph structure from [/api/graph](app/api/graph/route.ts)
2. Converts node/edge data to Mermaid syntax
3. Renders interactive flowchart with decision diamonds

## Technologies Used

- **Next.js 15** - React framework with App Router and API routes
- **React 19** - UI library with modern hooks
- **TypeScript** - Type safety and developer experience
- **Tailwind CSS** - Utility-first styling
- **LangChain** - AI orchestration and StateGraph pattern
- **@langchain/openai** - OpenAI integration (gpt-4o-mini)
- **@tavily/core** - Web search API for destinations/activities
- **Mermaid.js** - Dynamic graph visualization
- **StateGraph** - Structured conversation flow management

## API Endpoints

### POST /api/chat
Main conversation endpoint.

**Request:**
```json
{
  "message": "I want to plan a trip to Paris"
}
```

**Response:**
```json
{
  "reply": "That sounds wonderful! Let me help you plan your trip to Paris...",
  "state": { /* current conversation state */ }
}
```

### GET /api/graph
Returns the StateGraph structure for visualization.

**Response:**
```json
{
  "nodes": [
    { "id": "ask_origin", "type": "question" },
    { "id": "search_options", "type": "search" },
    ...
  ],
  "edges": [
    { "from": "ask_origin", "to": "ask_destination", "condition": null },
    ...
  ]
}
```

## Key Implementation Details

### ConversationEngine Methods

- `buildStateGraph()`: Constructs the 11-node StateGraph
- `exportGraphStructure()`: Extracts nodes and edges for visualization
- `invoke(input)`: Processes user input through the graph
- Node handlers: `askOriginNode()`, `searchOptionsNode()`, `handleValidationIssuesNode()`, etc.
- `getPossibleTargets()`: Resolves conditional edge targets

### State Object Properties

```typescript
{
  messages: Message[],
  lastUserInput: string,
  origin?: string,
  destination?: string, 
  startDate?: string,
  endDate?: string,
  numberOfTravelers?: number,
  budgetPerPerson?: number,
  tripPurpose?: string,
  planningType?: string,
  searchResults?: string,
  validationState?: 'VALIDATION_PASSED' | 'SEARCH_PENDING' | 'TOTAL_BUDGET_EXCEEDED',
  validationMessage?: string,
  validationMessageShown?: boolean
}
```

## Configuration

### LLM Settings
- **Model**: gpt-4o-mini
- **Temperature**: 0.8 (creative responses)
- **Token limit**: 500 per response

### Tavily Search
- **Max results**: 10
- **Max tokens per search**: 400
- **Search depth**: basic

## Future Enhancements

- Add streaming responses for real-time text generation
- Implement persistent conversation sessions with database
- Add user authentication and saved trip plans
- Support for flight and hotel booking integrations
- Multi-currency support
- Weather integration for destination recommendations
- Image generation for destinations
- Export trip plans to PDF/calendar
- Multi-language support

## Security Notes

- Never commit your `.env.local` file - it contains sensitive API keys
- API routes run server-side, keeping API keys secure from client exposure
- Consider adding rate limiting for production deployments
- Implement authentication before deploying publicly
- Review and sanitize user inputs to prevent injection attacks

## Cost Considerations

### OpenAI (gpt-4o-mini)
- Input: ~$0.15 per 1M tokens
- Output: ~$0.60 per 1M tokens
- Typical conversation: < $0.01 per complete travel plan

### Tavily API
- Free tier: 1,000 searches/month
- Paid plans available for higher usage
- This app uses ~2-3 searches per conversation

**Estimated cost per travel plan**: < $0.02

## Testing

A test script is included for automated conversation testing:

```bash
node test-api.js
```

The script:
- Simulates a complete travel planning conversation
- Automatically detects and handles budget exceeded scenarios
- Waits for search completion before validation
- Extracts required budget and retries with increased amount

## Troubleshooting

### "API key not configured"
- Ensure `.env.local` exists with valid `OPENAI_API_KEY` and `TAVILY_API_KEY`
- Restart the dev server after adding environment variables

### Graph visualization not loading
- Check browser console for errors
- Ensure Mermaid.js is dynamically imported (SSR compatibility)
- Verify `/api/graph` endpoint is returning valid JSON

### Budget validation not working
- Verify Tavily API key is valid and has available credits
- Check that search results are being returned
- Review `handleValidationIssuesNode` logic in [ConversationEngine.ts](components/ConversationEngine.ts)

### Markdown not formatting
- Check [Message.tsx](components/Message.tsx) `formatMessage()` function
- Verify response contains valid markdown syntax

## License

MIT

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## Support

For issues or questions:
- Open an issue on GitHub
- Check existing documentation in code comments
- Review the StateGraph visualization at `/graph`
