/**
 * Travel Planning ConversationEngine
 * Implements StateGraph pattern similar to LangGraph with LLM-powered personalization
 * - Shared state flows through all nodes
 * - Nodes are pure functions that return state updates
 * - Conditional edges based on state
 * - LLM generates personalized questions based on context
 */

import { ChatOpenAI } from "@langchain/openai";
import { tavily } from "@tavily/core";
import { TavilySearchPrompts } from "./TavilySearchPrompts";

// State definition - the shared state that flows through the graph
interface TravelPlannerState {
  // User inputs
  originCity?: string;
  destinationCity?: string;
  startDate?: string;
  endDate?: string;
  travelers?: number;
  budget?: string;
  purpose?: 'business' | 'vacation';
  planningType?: string[];
  interests?: string;
  
  // Search results
  transportationResults?: any[];
  accommodationResults?: any[];
  activitiesResults?: any[];
  searchValidationIssues?: string[];
  budgetIssues?: string[];
  scheduleIssues?: string[];
  searchRetryCount?: number;
  transportationType?: 'flights' | 'buses';
  flightsBudgetExceeded?: boolean;
  totalBudgetExceeded?: boolean;
  accommodationBudgetExceeded?: boolean;
  validationMessageShown?: boolean; // Track if we've shown the validation message
  
  // Budget allocation (handshaking between nodes)
  budgetAllocation?: {
    transportation: number;
    accommodation: number;
    activities: number;
    food: number;
    contingency: number;
  };
  
  // Control flow
  currentNode: string;
  lastUserInput?: string;
  validationError?: string;
  conversationComplete: boolean;
  responseMessage?: string;
}

// Node function type - takes state, returns state updates (can be async)
type NodeFunction = (state: TravelPlannerState) => Partial<TravelPlannerState> | Promise<Partial<TravelPlannerState>>;

// Edge condition function type
type EdgeCondition = (state: TravelPlannerState) => string;

interface GraphEdge {
  source: string;
  target: string | EdgeCondition;
}

interface GraphNode {
  id: string;
  execute: NodeFunction;
}

// Special node identifiers
const START = '__start__';
const END = '__end__';

export class ConversationEngine {
  private state: TravelPlannerState;
  private nodes: Map<string, GraphNode> = new Map();
  private edges: GraphEdge[] = [];
  private llm: ChatOpenAI;
  private tavilyClient: any;

  constructor() {
    this.state = this.createInitialState();
    this.llm = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.8,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
    this.tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY });
    this.buildStateGraph();
  }

  isSearching(): boolean {
    // Return true if we're in the search_options node or about to enter it
    return this.state.currentNode === 'search_options' || 
           (this.state.responseMessage?.includes('Let me search') || false);
  }

  private createInitialState(): TravelPlannerState {
    return {
      currentNode: START,
      conversationComplete: false,
      transportationType: 'flights', // Always start with flights
    };
  }

  private buildStateGraph(): void {
    // Define all nodes
    this.addNode('ask_origin', this.askOriginNode);
    this.addNode('ask_destination', this.askDestinationNode);
    this.addNode('ask_start_date', this.askStartDateNode);
    this.addNode('ask_end_date', this.askEndDateNode);
    this.addNode('ask_travelers', this.askTravelersNode);
    this.addNode('ask_budget', this.askBudgetNode);
    this.addNode('ask_purpose', this.askPurposeNode);
    this.addNode('ask_planning_type', this.askPlanningTypeNode);
    this.addNode('search_options', this.searchOptionsNode);
    this.addNode('handle_validation_issues', this.handleValidationIssuesNode);
    this.addNode('generate_plan', this.generatePlanNode);

    // Define edges (graph structure)
    this.addEdge(START, 'ask_origin');
    this.addEdge('ask_origin', 'ask_destination');
    this.addEdge('ask_destination', 'ask_start_date');
    this.addEdge('ask_start_date', 'ask_end_date');
    this.addEdge('ask_end_date', 'ask_travelers');
    this.addEdge('ask_travelers', 'ask_budget');
    this.addEdge('ask_budget', 'ask_purpose');
    this.addEdge('ask_purpose', 'ask_planning_type');
    this.addEdge('ask_planning_type', 'search_options');
    // Conditional edge: if validation issues, go to handler, otherwise generate plan
    this.addEdge('search_options', (state: TravelPlannerState) => {
      if (state.scheduleIssues && state.scheduleIssues.length > 0) {
        return 'handle_validation_issues';
      }
      if (state.budgetIssues && state.budgetIssues.length > 0) {
        return 'handle_validation_issues';
      }
      return 'generate_plan';
    });
    this.addEdge('handle_validation_issues', 'search_options');
    this.addEdge('generate_plan', END);
  }

  private addNode(id: string, execute: NodeFunction): void {
    this.nodes.set(id, { id, execute });
  }

  private addEdge(source: string, target: string | EdgeCondition): void {
    this.edges.push({ source, target });
  }

  /**
   * Export the graph structure for visualization
   */
  public exportGraphStructure(): { nodes: string[], edges: { source: string, target: string | string[], condition?: boolean }[] } {
    const nodeIds = Array.from(this.nodes.keys());
    const edgeList = this.edges.map(edge => {
      if (typeof edge.target === 'function') {
        // For conditional edges, we need to evaluate possible targets
        // Return multiple possible targets
        return {
          source: edge.source,
          target: this.getPossibleTargets(edge.source, edge.target),
          condition: true
        };
      }
      return {
        source: edge.source,
        target: edge.target,
        condition: false
      };
    });

    return { nodes: nodeIds, edges: edgeList };
  }

  /**
   * Get all possible target nodes for a conditional edge
   */
  private getPossibleTargets(source: string, edgeFunction: EdgeCondition): string[] {
    // For search_options node, we know it can go to either handle_validation_issues or generate_plan
    if (source === 'search_options') {
      return ['handle_validation_issues', 'generate_plan'];
    }
    // For handle_validation_issues, it can loop back to search_options or other nodes
    if (source === 'handle_validation_issues') {
      return ['search_options', 'generate_plan', 'ask_start_date', 'ask_planning_type'];
    }
    return [];
  }

  private getNextNode(currentNode: string): string | null {
    const edge = this.edges.find(e => e.source === currentNode);
    if (!edge) return null;
    
    if (typeof edge.target === 'function') {
      return edge.target(this.state);
    }
    return edge.target;
  }

  // Generate personalized question using LLM
  private async generatePersonalizedQuestion(
    baseQuestion: string,
    context: string,
    nextStep: string
  ): Promise<string> {
    try {
      const prompt = `You are a friendly travel planning assistant. Generate a warm, personalized question for the user.

Context: ${context}
Base Question Goal: ${baseQuestion}
Next Information Needed: ${nextStep}

Requirements:
- Keep it conversational and warm
- Reference the context naturally
- Make it feel personal, not robotic
- Use appropriate travel emojis
- Keep it concise (1-2 sentences max)
- Ask for: ${nextStep}

Generate the personalized question:`;

      const response = await this.llm.invoke(prompt);
      return response.content as string;
    } catch (error) {
      console.error('Error generating personalized question:', error);
      // Fallback to base question if LLM fails
      return baseQuestion;
    }
  }

  // Node implementations - pure functions that return state updates

  private askOriginNode = (state: TravelPlannerState): Partial<TravelPlannerState> => {
    console.log('🔵 askOriginNode called, lastUserInput:', state.lastUserInput);
    // If no user input yet, just return the question
    if (!state.lastUserInput) {
      return {
        responseMessage: "Hello! ✈️ I'm your Travel Planning Assistant! Let's plan your perfect trip. What city will you be traveling from?",
      };
    }

    // Validate input
    const input = state.lastUserInput.trim();
    if (input.length < 2) {
      return {
        validationError: "Please provide a valid city name for your origin.",
        responseMessage: "I need a city name with at least 2 characters. 🌍 What city will you be traveling from?",
      };
    }
    
    // Check if input looks like a city name (letters, spaces, hyphens, commas)
    if (!/^[a-zA-Z\s,\-]+$/.test(input)) {
      return {
        validationError: "Please provide a valid city name (letters only).",
        responseMessage: "That doesn't look like a city name. 🌍 Please provide the city you'll be traveling from (e.g., Dallas, New York, Los Angeles).",
      };
    }

    // Valid input - update state and move to next node
    const nextNode = this.getNextNode('ask_origin');
    console.log('✅ askOriginNode valid, moving to:', nextNode);
    return {
      originCity: input,
      validationError: undefined,
      currentNode: nextNode || 'ask_destination',
    };
  };

  private askDestinationNode = (state: TravelPlannerState): Partial<TravelPlannerState> => {
    console.log('🔵 askDestinationNode called, lastUserInput:', state.lastUserInput);
    if (!state.lastUserInput) {
      // Use personalized question
      const context = `The user is traveling from ${state.originCity}`;
      const baseQuestion = `Great! You'll be traveling from ${state.originCity}. 🌍 Now, which city are you planning to visit?`;
      
      // Mark this as needing personalization
      return {
        responseMessage: baseQuestion,
        validationError: undefined,
      };
    }

    const input = state.lastUserInput.trim();
    if (input.length < 2) {
      return {
        validationError: "Please provide a valid destination city name.",
        responseMessage: "I need a city name with at least 2 characters. 🌍 Where are you planning to visit?",
      };
    }
    
    // Check if input looks like a city name
    if (!/^[a-zA-Z\s,\-]+$/.test(input)) {
      return {
        validationError: "Please provide a valid city name (letters only).",
        responseMessage: "That doesn't look like a city name. 🌍 Please provide your destination city (e.g., Orlando, Miami, San Francisco).",
      };
    }
    
    // Check if destination is same as origin
    if (input.toLowerCase() === state.originCity?.toLowerCase()) {
      return {
        validationError: "Destination should be different from origin.",
        responseMessage: `You're already in ${state.originCity}! 😄 Where would you like to travel to from there?`,
      };
    }

    const nextNode = this.getNextNode('ask_destination');
    console.log('✅ askDestinationNode valid, moving to:', nextNode);
    return {
      destinationCity: input,
      validationError: undefined,
      currentNode: nextNode || 'ask_start_date',
    };
  };

  private askStartDateNode = async (state: TravelPlannerState): Promise<Partial<TravelPlannerState>> => {
    console.log('🔵 askStartDateNode called, lastUserInput:', state.lastUserInput);
    if (!state.lastUserInput) {
      return {
        responseMessage: `Wonderful! ${state.destinationCity} sounds exciting! 📅 When would you like to start your trip? (Please provide the start date)`,
      };
    }

    const input = state.lastUserInput.trim();
    
    // Use LLM to parse date intelligently
    try {
      const dateParsePrompt = `Parse this date string into a standard date format.

User's input: "${input}"
Current date: January 17, 2026

Rules:
- If no year is mentioned, assume 2026
- Convert to format: YYYY-MM-DD
- Handle ordinals (16th, 1st, 22nd, etc.)
- Handle month names (March, Mar, January, etc.)

Respond with ONLY the date in YYYY-MM-DD format, nothing else.
Example: 2026-03-16`;

      console.log('📅 Using LLM to parse date:', input);
      const response = await this.llm.invoke(dateParsePrompt);
      const parsedDateStr = (response.content as string).trim();
      console.log('✨ LLM parsed date to:', parsedDateStr);
      
      // Try to parse the LLM result
      const parsedDate = new Date(parsedDateStr);
      
      if (!isNaN(parsedDate.getTime())) {
        // Check if date is in the past
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (parsedDate < today) {
          return {
            validationError: "The start date should be in the future.",
            responseMessage: "It looks like that date is in the past! 📅 When in the future would you like to start your trip?",
          };
        }

        const nextNode = this.getNextNode('ask_start_date');
        console.log('✅ askStartDateNode valid, moving to:', nextNode);
        
        // Store the normalized date format (YYYY-MM-DD) for comparison
        return {
          startDate: parsedDateStr,
          validationError: undefined,
          currentNode: nextNode || 'ask_end_date',
        };
      }
    } catch (error) {
      console.error('❌ Error parsing date with LLM:', error);
    }
    
    // Fallback: Try standard parsing
    let dateInput = input;
    const currentYear = new Date().getFullYear();
    if (!/(\d{4})/.test(input)) {
      dateInput = `${input}, ${currentYear}`;
    }
    
    const parsedDate = new Date(dateInput);
    if (isNaN(parsedDate.getTime())) {
      return {
        validationError: "That doesn't seem like a valid date. Please provide a proper date.",
        responseMessage: "That doesn't seem like a valid date. 📅 Could you provide your departure date in a format like MM/DD/YYYY or Jan 15, 2026?",
      };
    }
    
    // Check if date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsedDate < today) {
      return {
        validationError: "The start date should be in the future.",
        responseMessage: "It looks like that date is in the past! 📅 When in the future would you like to start your trip?",
      };
    }

    const nextNode = this.getNextNode('ask_start_date');
    console.log('✅ askStartDateNode valid, moving to:', nextNode);
    return {
      startDate: input,
      validationError: undefined,
      currentNode: nextNode || 'ask_end_date',
    };
  };

  private askEndDateNode = async (state: TravelPlannerState): Promise<Partial<TravelPlannerState>> => {
    if (!state.lastUserInput) {
      return {
        responseMessage: `Got it! Starting ${state.startDate}. 📅 And when will you be returning? (Please provide the end date)`,
      };
    }

    const input = state.lastUserInput.trim();
    
    // Use LLM to parse date intelligently
    try {
      const dateParsePrompt = `Parse this date string into a standard date format.

User's input: "${input}"
Current date: January 17, 2026
Trip start date: ${state.startDate}

Rules:
- If no year is mentioned, assume 2026
- Convert to format: YYYY-MM-DD
- Handle ordinals (16th, 1st, 22nd, etc.)
- Handle month names (March, Mar, January, etc.)

Respond with ONLY the date in YYYY-MM-DD format, nothing else.
Example: 2026-03-18`;

      console.log('📅 Using LLM to parse end date:', input);
      const response = await this.llm.invoke(dateParsePrompt);
      const parsedDateStr = (response.content as string).trim();
      console.log('✨ LLM parsed end date to:', parsedDateStr);
      
      const endDate = new Date(parsedDateStr);
      
      if (!isNaN(endDate.getTime())) {
        // Check if end date is after start date
        if (state.startDate) {
          console.log('🔍 Comparing dates - Start:', state.startDate, 'End:', parsedDateStr);
          const startDateParsed = new Date(state.startDate);
          console.log('🔍 Start date parsed:', startDateParsed, 'End date parsed:', endDate);
          
          if (!isNaN(startDateParsed.getTime()) && endDate <= startDateParsed) {
            return {
              validationError: "End date should be after the start date.",
              responseMessage: `Your return date should be after ${state.startDate}. 📅 When will you be coming back?`,
            };
          }
          
          // Check if duration is reasonable (not more than 1 year)
          const duration = Math.ceil((endDate.getTime() - startDateParsed.getTime()) / (1000 * 60 * 60 * 24));
          console.log('🔍 Trip duration:', duration, 'days');
          if (duration > 365) {
            return {
              validationError: "That trip duration seems unusually long (over a year).",
              responseMessage: `A trip of ${duration} days seems quite long! 😅 Could you confirm your return date?`,
            };
          }
        }

        const nextNode = this.getNextNode('ask_end_date');
        return {
          endDate: parsedDateStr,
          validationError: undefined,
          currentNode: nextNode || 'ask_travelers',
        };
      }
    } catch (error) {
      console.error('❌ Error parsing end date with LLM:', error);
    }
    
    // Fallback: Try standard parsing
    let dateInput = input;
    const currentYear = new Date().getFullYear();
    if (!/(\d{4})/.test(input)) {
      dateInput = `${input}, ${currentYear}`;
    }
    
    const endDate = new Date(dateInput);
    if (isNaN(endDate.getTime())) {
      return {
        validationError: "That doesn't seem like a valid date. Please provide a proper return date.",
        responseMessage: "That doesn't seem like a valid date. 📅 Could you provide your return date in a format like MM/DD/YYYY or Jan 20, 2026?",
      };
    }
    
    // Validate end date is after start date
    const startDate = new Date(state.startDate!);
    if (endDate <= startDate) {
      return {
        validationError: "The return date must be after the start date.",
        responseMessage: `Your return date should be after ${state.startDate}. 📅 When would you like to return from your trip?`,
      };
    }
    
    // Check if trip duration is reasonable (not too long)
    const daysDiff = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 365) {
      return {
        validationError: "That's quite a long trip! Please confirm your return date.",
        responseMessage: `Wow, that's over a year! 📅 Just to confirm, you'll be traveling for ${daysDiff} days? If that's correct, please re-enter the same date, or provide a different return date.`,
      };
    }

    const nextNode = this.getNextNode('ask_end_date');
    return {
      endDate: input,
      validationError: undefined,
      currentNode: nextNode || 'ask_travelers',
    };
  };

  private askTravelersNode = (state: TravelPlannerState): Partial<TravelPlannerState> => {
    if (!state.lastUserInput) {
      return {
        responseMessage: `Excellent! So you'll be traveling from ${state.startDate} to ${state.endDate}. 👥 How many people will be traveling?`,
      };
    }

    const input = state.lastUserInput.trim();
    
    // Try to parse the number, handling words like "two", "three", etc.
    let travelers: number;
    const numberWords: { [key: string]: number } = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
    };
    
    if (numberWords[input.toLowerCase()]) {
      travelers = numberWords[input.toLowerCase()];
    } else {
      travelers = parseInt(input);
    }
    
    if (isNaN(travelers) || travelers < 1) {
      return {
        validationError: "Please provide a valid number of travelers.",
        responseMessage: "I need a valid number! 👥 How many people will be traveling? (e.g., 1, 2, 3, or type 'two', 'three', etc.)",
      };
    }
    
    if (travelers > 50) {
      return {
        validationError: "That's quite a large group!",
        responseMessage: `Wow, ${travelers} people! 👥 That's a big group! Just to confirm, is that correct? If yes, please re-enter the number.`,
      };
    }

    const nextNode = this.getNextNode('ask_travelers');
    return {
      travelers,
      validationError: undefined,
      currentNode: nextNode || 'ask_budget',
    };
  };

  private askBudgetNode = (state: TravelPlannerState): Partial<TravelPlannerState> => {
    if (!state.lastUserInput) {
      return {
        responseMessage: `Got it! ${state.travelers} ${state.travelers === 1 ? 'person' : 'people'} traveling. 💰 What's your budget for this trip? (You can provide an amount or range)`,
      };
    }

    const input = state.lastUserInput.trim().toLowerCase();
    
    if (input.length < 1) {
      return {
        validationError: "Please provide your budget for the trip.",
        responseMessage: "I need to know your budget to help plan better! 💰 What's your budget for this trip? (e.g., $2000, 1500-2000, 3000 USD)",
      };
    }
    
    // Validate budget format - should contain numbers and optionally currency symbols
    const budgetPatterns = [
      /\$?\d+[\d,]*(\s*-\s*\$?\d+[\d,]*)?/,  // $1000 or $1000-$2000 or 1000-2000
      /\d+[\d,]*\s*(usd|dollars?|euros?|gbp|pounds?)/i,  // 1000 USD, 2000 dollars
      /flexible|no\s*limit|unlimited/i  // Flexible budget
    ];
    
    const isValidBudget = budgetPatterns.some(pattern => pattern.test(input));
    
    if (!isValidBudget) {
      return {
        validationError: "Please provide a valid budget amount.",
        responseMessage: "I need a valid budget amount. 💰 You can say something like: $2000, 1500-2000, flexible, or no limit. What's your budget?",
      };
    }
    
    // Extract numbers to provide feedback
    const numbers = input.match(/\d+[\d,]*/g);
    if (numbers && numbers.length > 0) {
      const amount = parseInt(numbers[0].replace(/,/g, ''));
      if (amount < 100) {
        return {
          validationError: "That budget seems quite low. Are you sure?",
          responseMessage: `Just checking - did you mean $${amount}? That might be a bit tight for a ${state.destinationCity} trip. 💰 Could you confirm or provide your actual budget?`,
        };
      }
    }

    const nextNode = this.getNextNode('ask_budget');
    return {
      budget: state.lastUserInput.trim(), // Store original format
      validationError: undefined,
      currentNode: nextNode || 'ask_purpose',
    };
  };

  private askPurposeNode = (state: TravelPlannerState): Partial<TravelPlannerState> => {
    if (!state.lastUserInput) {
      return {
        responseMessage: `Perfect! I've noted your budget of ${state.budget}. 🎯 Is this trip for business or vacation?`,
      };
    }

    const input = state.lastUserInput.toLowerCase();
    if (!input.includes('business') && 
        !input.includes('vacation') && 
        !input.includes('leisure') && 
        !input.includes('holiday') &&
        !input.includes('work') &&
        !input.includes('pleasure')) {
      return {
        validationError: "Please specify if this is a 'business' or 'vacation' trip.",
        responseMessage: "Please specify if this is a 'business' or 'vacation' trip.",
      };
    }

    const purpose = (input.includes('business') || input.includes('work')) ? 'business' : 'vacation';
    const nextNode = this.getNextNode('ask_purpose');
    
    return {
      purpose,
      validationError: undefined,
      currentNode: nextNode || 'ask_planning_type',
    };
  };

  private askPlanningTypeNode = async (state: TravelPlannerState): Promise<Partial<TravelPlannerState>> => {
    if (!state.lastUserInput) {
      return {
        responseMessage: `Great! This is a ${state.purpose} trip. 🗺️ What would you like help planning? You can mention:\n1. Transportation (flights, local transport)\n2. Accommodation (hotels, stays)\n3. Activities & sightseeing\n\nJust tell me what interests you!`,
      };
    }

    const input = state.lastUserInput.toLowerCase();
    if (input.trim().length < 2) {
      return {
        validationError: "Please tell me what you'd like help planning (transportation, accommodation, activities, or all).",
        responseMessage: "Please tell me what you'd like help planning (transportation, accommodation, activities, or all).",
      };
    }

    // Use LLM to intelligently parse planning types
    try {
      const parsePrompt = `You are parsing a user's response about what they want help planning for their trip.

User's response: "${state.lastUserInput}"

Determine which planning categories they want help with. Categories are:
- transportation (flights, getting there, local transport, rental cars)
- accommodation (hotels, stays, lodging, places to stay)
- activities (things to do, sightseeing, attractions, experiences)

Respond ONLY with a JSON object in this exact format:
{
  "planningTypes": ["transportation", "accommodation", "activities"],
  "interests": "optional comma-separated interests like adventure, culture, food, nature"
}

Rules:
- If they mention all three or say "all" or "everything", include all three
- If they list multiple (like "transportation, accommodation and activities"), include all mentioned
- If they only mention one or two, only include those
- For interests, extract any specific themes mentioned (adventure, culture, food, nature, relaxation, shopping)
- Keep the exact category names: "transportation", "accommodation", "activities"

Respond with ONLY the JSON, no explanation.`;

      console.log('🤖 Using LLM to parse planning types...');
      const response = await this.llm.invoke(parsePrompt);
      const llmResponse = response.content as string;
      console.log('✨ LLM parsing result:', llmResponse);
      
      // Parse LLM response
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const planningTypes = parsed.planningTypes || [];
        const interests = parsed.interests || '';
        
        if (planningTypes.length === 0) {
          // Fallback: include all if nothing parsed
          planningTypes.push('transportation', 'accommodation', 'activities');
        }
        
        console.log('📋 Parsed planning types:', planningTypes);
        console.log('🎨 Parsed interests:', interests);
        
        const planningText = planningTypes.length === 3 ? 'all three' : planningTypes.join(', ');
        const nextNode = this.getNextNode('ask_planning_type');
        return {
          planningType: planningTypes,
          interests: interests,
          validationError: undefined,
          currentNode: nextNode || 'search_options',
          transportationType: state.transportationType || 'flights', // Ensure flights is set
          responseMessage: `Perfect! I'll help you plan ${planningText}. 🔍 Let me search for the best options for your trip from ${state.originCity} to ${state.destinationCity}...`,
        };
      }
    } catch (error) {
      console.error('❌ Error parsing with LLM, falling back to keyword matching:', error);
    }

    // Fallback to keyword matching if LLM fails
    const planningTypes: string[] = [];
    let interests = '';

    // Parse planning types
    if (input.includes('transportation') || input.includes('transport') || input.includes('flight')) {
      planningTypes.push('transportation');
    }
    if (input.includes('accommodation') || input.includes('hotel') || input.includes('stay') || input.includes('lodging')) {
      planningTypes.push('accommodation');
    }
    if (input.includes('activit') || input.includes('sightseeing') || input.includes('things to do')) {
      planningTypes.push('activities');
    }
    if (input.includes('all') || input.includes('everything') || input.includes('three') || input.includes('both')) {
      planningTypes.push('transportation', 'accommodation', 'activities');
    }

    // If none matched, include all
    if (planningTypes.length === 0) {
      planningTypes.push('transportation', 'accommodation', 'activities');
    }

    // Parse interests
    if (input.includes('adventure')) interests += 'adventure, ';
    if (input.includes('culture') || input.includes('history')) interests += 'culture, ';
    if (input.includes('food') || input.includes('dining')) interests += 'food, ';
    if (input.includes('nature') || input.includes('outdoor')) interests += 'nature, ';
    if (input.includes('shopping')) interests += 'shopping, ';
    if (input.includes('relax') || input.includes('spa')) interests += 'relaxation, ';

    const planningText = planningTypes.length === 3 ? 'all three' : planningTypes.join(', ');
    const nextNode = this.getNextNode('ask_planning_type');
    return {
      planningType: planningTypes,
      interests: interests.slice(0, -2),
      validationError: undefined,
      currentNode: nextNode || 'search_options',
      transportationType: state.transportationType || 'flights', // Ensure flights is set
      responseMessage: `Perfect! I'll help you plan ${planningText}. 🔍 Let me search for the best options for your trip from ${state.originCity} to ${state.destinationCity}...`,
    };
  };

  private searchOptionsNode = async (state: TravelPlannerState): Promise<Partial<TravelPlannerState>> => {
    console.log('🔍 searchOptionsNode called');
    
    // Check if we have planningType set and haven't searched yet
    if (state.planningType && state.planningType.length > 0 && !state.transportationResults && !state.accommodationResults && !state.activitiesResults) {
      
      try {
        // STEP 1: Intelligently allocate budget across all categories using LLM
        console.log('💰 STEP 1: Allocating budget intelligently across categories...');
        let budgetAllocation;
        try {
          budgetAllocation = await this.allocateBudget(state);
          console.log('💰 Budget Allocation:', JSON.stringify(budgetAllocation, null, 2));
        } catch (allocError) {
          console.error('❌ Budget allocation error:', allocError);
          // Use fallback allocation
          const budgetMatch = state.budget?.match(/\d+/);
          const totalBudget = budgetMatch ? parseInt(budgetMatch[0]) : 1000;
          const isFlights = state.transportationType === 'flights';
          budgetAllocation = {
            transportation: Math.round(totalBudget * (isFlights ? 0.40 : 0.12)),
            accommodation: Math.round(totalBudget * 0.30),
            food: Math.round(totalBudget * 0.20),
            activities: Math.round(totalBudget * 0.08),
            contingency: Math.round(totalBudget * 0.02)
          };
          console.log('💰 Using fallback allocation:', JSON.stringify(budgetAllocation, null, 2));
        }
        
        // Perform searches with allocated budgets
        console.log('🚀 STEP 2: Starting parallel Tavily searches with allocated budgets...');
      
        const searchPromises: Promise<any>[] = [];
        const { originCity, destinationCity, startDate, endDate, travelers, budget, planningType } = state;
        // Build search queries based on planning types with allocated budgets
        const searchParams = { 
          originCity, 
          destinationCity, 
          startDate, 
          endDate, 
          travelers, 
          budget, 
          interests: state.interests, 
          purpose: state.purpose,
          budgetAllocation // Pass allocation to search queries
        };
        
        // Check if Tavily client is available
        if (!this.tavilyClient) {
          throw new Error('Tavily API client not initialized. Check TAVILY_API_KEY environment variable.');
        }
        
        if (planningType?.includes('transportation')) {
          const transportType = state.transportationType || 'flights'; // Default to flights
          console.log(`🚨 DEBUG: state.transportationType = ${state.transportationType}, using: ${transportType}`);
          const transportQuery = TavilySearchPrompts.getTransportationQuery(searchParams, transportType);
          const config = TavilySearchPrompts.getSearchConfig('transportation');
          console.log(`${transportType === 'buses' ? '🚌' : '✈️'} Transport query (${transportType}):`, transportQuery);
          searchPromises.push(
            this.tavilyClient.search(transportQuery, config)
              .then((result: any) => ({ type: 'transportation', data: result }))
          );
        }
        
        if (planningType?.includes('accommodation')) {
          const accomQuery = TavilySearchPrompts.getAccommodationQuery(searchParams);
          const config = TavilySearchPrompts.getSearchConfig('accommodation');
          console.log('🏨 Accommodation query:', accomQuery);
          searchPromises.push(
            this.tavilyClient.search(accomQuery, config)
              .then((result: any) => ({ type: 'accommodation', data: result }))
          );
        }
        
        if (planningType?.includes('activities')) {
          const activitiesQuery = TavilySearchPrompts.getActivitiesQuery(searchParams);
          const config = TavilySearchPrompts.getSearchConfig('activities');
          console.log('🎨 Activities query:', activitiesQuery);
          searchPromises.push(
            this.tavilyClient.search(activitiesQuery, config)
              .then((result: any) => ({ type: 'activities', data: result }))
          );
        }
        
        // Execute all searches in parallel
        const results = await Promise.all(searchPromises);
        console.log('✅ All searches completed');
        
        // Extract results by type
        const stateUpdates: Partial<TravelPlannerState> = {
          searchRetryCount: (state.searchRetryCount || 0) + 1,
          transportationType: state.transportationType || 'flights', // Preserve transport type
          budgetAllocation: budgetAllocation, // Store allocation for validation
        };
        
        results.forEach(result => {
          if (result.type === 'transportation') {
            stateUpdates.transportationResults = result.data.results || [];
          } else if (result.type === 'accommodation') {
            stateUpdates.accommodationResults = result.data.results || [];
          } else if (result.type === 'activities') {
            stateUpdates.activitiesResults = result.data.results || [];
          }
        });
        
        // Use LLM to comprehensively validate results against budget
        console.log('🤖 Using LLM to validate search results against budget...');
        const llmValidation = await this.validateWithLLM(state, stateUpdates);
        
        stateUpdates.budgetIssues = llmValidation.budgetIssues;
        stateUpdates.scheduleIssues = llmValidation.scheduleIssues;
        stateUpdates.searchValidationIssues = llmValidation.allIssues;
        
        // If LLM detected flights are too expensive, mark it
        if (llmValidation.flightsBudgetExceeded) {
          stateUpdates.flightsBudgetExceeded = true;
        }
        
        // Determine next node
        if (llmValidation.scheduleIssues.length > 0 || llmValidation.budgetIssues.length > 0) {
          stateUpdates.currentNode = 'handle_validation_issues';
        } else {
          stateUpdates.currentNode = 'generate_plan';
        }
        
        return stateUpdates;
        
      } catch (error) {
        console.error('❌ Tavily search error:', error);
        console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
        return {
          searchValidationIssues: [`Failed to fetch search results: ${error instanceof Error ? error.message : 'Unknown error'}. Generating plan with general recommendations.`],
          currentNode: 'generate_plan',
          budgetAllocation: undefined, // Clear allocation on error
        };
      }
    }
    
    // If we already have results, just continue
    return {
      currentNode: 'generate_plan',
    };
  };

  private validateSearchResults(
    state: TravelPlannerState, 
    searchResults: Partial<TravelPlannerState>
  ): { budgetIssues: string[]; scheduleIssues: string[]; allIssues: string[] } {
    console.log('✅ Validating search results...');
    console.log(`🚨 DEBUG: Current transportationType = ${state.transportationType}`);
    
    const budgetIssues: string[] = [];
    const scheduleIssues: string[] = [];
    const allIssues: string[] = [];
    
    // Extract budget number
    const budgetMatch = state.budget?.match(/\d+/);
    const budgetAmount = budgetMatch ? parseInt(budgetMatch[0]) : null;
    
    // Validate transportation results
    if (searchResults.transportationResults && searchResults.transportationResults.length > 0) {
      // Check if results mention prices that exceed budget
      const transportText = JSON.stringify(searchResults.transportationResults);
      
      if (budgetAmount && state.transportationType === 'flights') {
        console.log(`💰 Budget validation: Total budget = $${budgetAmount}, Travelers = ${state.travelers}`);
        console.log(`💰 Max allowed for flights (40%) = $${budgetAmount * 0.4}`);
        
        // Look for price indicators - try multiple patterns
        const pricePatterns = [
          /\$\s*(\d+)/g,           // $150 or $ 150
          /(\d+)\s*(?:USD|dollars?)/gi,  // 150 USD or 150 dollars
          /price[:\s]+\$?\s*(\d+)/gi,    // price: $150 or price 150
        ];
        
        const allPrices: number[] = [];
        pricePatterns.forEach(pattern => {
          let match;
          while ((match = pattern.exec(transportText)) !== null) {
            const price = parseInt(match[1]);
            if (price > 10 && price < 10000) { // Reasonable price range
              allPrices.push(price);
            }
          }
        });
        
        console.log(`💰 Found prices in results: ${allPrices.join(', ')}`);
        
        if (allPrices.length > 0) {
          // Use the minimum price found (best deal)
          const minPrice = Math.min(...allPrices);
          const totalTransportCost = minPrice * (state.travelers || 1);
          const budgetThreshold = budgetAmount * 0.4;
          
          console.log(`💰 Min price per person: $${minPrice}`);
          console.log(`💰 Total for ${state.travelers} travelers: $${totalTransportCost}`);
          console.log(`💰 Budget threshold (40%): $${budgetThreshold}`);
          
          // For flights, be stricter - they shouldn't exceed 40% of budget
          if (totalTransportCost > budgetThreshold) {
            budgetIssues.push(`FLIGHTS_BUDGET_EXCEEDED: Flight costs (estimated $${totalTransportCost} = $${minPrice} × ${state.travelers} people) exceed 40% of your $${budgetAmount} budget. Threshold is $${budgetThreshold.toFixed(0)}.`);
            // Mark that flights exceeded budget
            searchResults.flightsBudgetExceeded = true;
            console.log(`🚨 FLIGHTS EXCEEDED BUDGET! $${totalTransportCost} > $${budgetThreshold}`);
          } else {
            console.log(`✅ Flights within budget: $${totalTransportCost} <= $${budgetThreshold}`);
          }
        } else {
          console.log(`⚠️ No prices found in transportation results - skipping validation`);
        }
      }
    }
    
    // Validate accommodation results
    if (searchResults.accommodationResults && searchResults.accommodationResults.length > 0) {
      const accomText = JSON.stringify(searchResults.accommodationResults).toLowerCase();
      
      if (budgetAmount) {
        const priceMatches = accomText.match(/\$\d+/g);
        if (priceMatches) {
          const prices = priceMatches.map(p => parseInt(p.substring(1)));
          const nights = this.calculateNights(state.startDate, state.endDate);
          const totalAccomCost = Math.min(...prices) * nights;
          
          if (totalAccomCost > budgetAmount * 0.5) {
            budgetIssues.push(`Accommodation costs (estimated $${totalAccomCost} for ${nights} nights) may exceed 50% of your budget`);
          }
        }
      }
    }
    
    // Check for schedule conflicts
    if (state.startDate && state.endDate) {
      const start = new Date(state.startDate);
      const end = new Date(state.endDate);
      const duration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      
      // Check if activities align with trip duration
      if (searchResults.activitiesResults && searchResults.activitiesResults.length > 0) {
        const activitiesText = JSON.stringify(searchResults.activitiesResults).toLowerCase();
        
        // Check for multi-day activities that might not fit
        if (duration < 3 && (activitiesText.includes('multi-day') || activitiesText.includes('week-long'))) {
          scheduleIssues.push(`Some activities found require more time than your ${duration}-day trip allows`);
        }
      }
    }
    
    allIssues.push(...budgetIssues, ...scheduleIssues);
    
    console.log(`📊 Validation complete: ${budgetIssues.length} budget issues, ${scheduleIssues.length} schedule issues`);
    
    return { budgetIssues, scheduleIssues, allIssues };
  }

  private async validateWithLLM(
    state: TravelPlannerState,
    searchResults: Partial<TravelPlannerState>
  ): Promise<{ budgetIssues: string[]; scheduleIssues: string[]; allIssues: string[]; flightsBudgetExceeded: boolean }> {
    try {
      // Prepare search results summary for LLM
      const transportSummary = searchResults.transportationResults?.slice(0, 5).map((r, i) => 
        `${i + 1}. ${r.title}\n${r.content?.substring(0, 400) || 'No details'}\nURL: ${r.url}`
      ).join('\n\n') || 'No transportation results';
      
      const accomSummary = searchResults.accommodationResults?.slice(0, 5).map((r, i) => 
        `${i + 1}. ${r.title}\n${r.content?.substring(0, 400) || 'No details'}\nURL: ${r.url}`
      ).join('\n\n') || 'No accommodation results';
      
      const activitiesSummary = searchResults.activitiesResults?.slice(0, 5).map((r, i) => 
        `${i + 1}. ${r.title}\n${r.content?.substring(0, 400) || 'No details'}\nURL: ${r.url}`
      ).join('\n\n') || 'No activities results';

      const nights = this.calculateNights(state.startDate, state.endDate);
      const days = nights + 1;

      const prompt = `You are a travel budget expert analyzing search results to determine if they fit within the user's budget.

**Trip Details:**
- Origin: ${state.originCity}
- Destination: ${state.destinationCity}
- Dates: ${state.startDate} to ${state.endDate} (${nights} nights, ${days} days)
- Travelers: ${state.travelers} people
- TOTAL BUDGET: ${state.budget} (for ALL ${state.travelers} people, covering EVERYTHING)
- Purpose: ${state.purpose}
- Transportation Type: ${state.transportationType || 'flights'}

**Search Results:**

TRANSPORTATION:
${transportSummary}

ACCOMMODATION:
${accomSummary}

ACTIVITIES:
${activitiesSummary}

**Your Task:**
Analyze ALL search results and extract prices. Calculate the TOTAL estimated cost for the entire trip for ALL ${state.travelers} travelers.

Break down the costs:
1. Transportation: [Extract lowest price per person] × ${state.travelers} people = Total transportation cost
2. Accommodation: [Extract lowest price per night] × ${nights} nights = Total accommodation cost
3. Activities: Estimate reasonable activity spending for ${days} days
4. Food: Estimate ${days} days × ${state.travelers} people × reasonable per-person daily food cost
5. **TOTAL**: Sum of all above

**Budget Rules:**
- Total budget: ${state.budget}
- For ${state.transportationType === 'flights' ? 'FLIGHTS' : 'BUSES'}: Should not exceed 40% of total budget (${state.budget})
- For ACCOMMODATION: Should not exceed 40% of total budget
- For ACTIVITIES + FOOD: Should fit in remaining budget
- If TOTAL COST > TOTAL BUDGET, flag as BUDGET_EXCEEDED

**Response Format (JSON only):**
{
  "transportationCostPerPerson": [number],
  "transportationTotalCost": [number],
  "accommodationTotalCost": [number],
  "activitiesEstimate": [number],
  "foodEstimate": [number],
  "totalEstimatedCost": [number],
  "budgetIssues": ["list of specific issues found"],
  "flightsBudgetExceeded": [true/false - true if transportation type is flights AND flights alone exceed 40% of budget],
  "totalBudgetExceeded": [true/false],
  "explanation": "Brief explanation of budget analysis"
}

Be thorough and look for actual prices in the content. If transportation costs alone are too high, mark flightsBudgetExceeded as true.`;

      console.log('🤖 Sending validation request to LLM...');
      const response = await this.llm.invoke(prompt);
      const llmResponse = response.content as string;
      console.log('✨ LLM validation response:', llmResponse);

      // Parse LLM response
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        console.log('📊 LLM Budget Analysis:');
        console.log(`  - Transportation: $${parsed.transportationTotalCost} ($${parsed.transportationCostPerPerson}/person × ${state.travelers})`);
        console.log(`  - Accommodation: $${parsed.accommodationTotalCost}`);
        console.log(`  - Activities: $${parsed.activitiesEstimate}`);
        console.log(`  - Food: $${parsed.foodEstimate}`);
        console.log(`  - TOTAL: $${parsed.totalEstimatedCost}`);
        console.log(`  - Budget: ${state.budget}`);
        console.log(`  - Flights Exceeded: ${parsed.flightsBudgetExceeded}`);
        console.log(`  - Total Exceeded: ${parsed.totalBudgetExceeded}`);
        
        const budgetIssues: string[] = [];
        const scheduleIssues: string[] = [];
        
        // Add issues from LLM
        if (parsed.budgetIssues && Array.isArray(parsed.budgetIssues)) {
          budgetIssues.push(...parsed.budgetIssues);
        }
        
        // Extract budget amount
        const budgetMatch = state.budget?.match(/\d+/);
        const totalBudget = budgetMatch ? parseInt(budgetMatch[0]) : 1000;
        
        // Check if TOTAL budget is exceeded (most critical)
        if (parsed.totalBudgetExceeded || parsed.totalEstimatedCost > totalBudget) {
          const overBudget = parsed.totalEstimatedCost - totalBudget;
          budgetIssues.unshift(`TOTAL_BUDGET_EXCEEDED: Total trip cost ($${parsed.totalEstimatedCost}) exceeds your budget (${state.budget}) by $${overBudget}. You need at least $${parsed.totalEstimatedCost} for this trip.`);
        }
        
        // Special handling for flights budget exceeded
        if (parsed.flightsBudgetExceeded && state.transportationType === 'flights') {
          const flightIssue = `FLIGHTS_BUDGET_EXCEEDED: Flight costs ($${parsed.transportationTotalCost} = $${parsed.transportationCostPerPerson}/person × ${state.travelers} people) exceed 40% of your ${state.budget} budget.`;
          if (!budgetIssues.some(issue => issue.includes('FLIGHTS_BUDGET_EXCEEDED'))) {
            budgetIssues.push(flightIssue);
          }
        }
        
        return {
          budgetIssues,
          scheduleIssues,
          allIssues: [...budgetIssues, ...scheduleIssues],
          flightsBudgetExceeded: parsed.flightsBudgetExceeded || false
        };
      }
    } catch (error) {
      console.error('❌ Error in LLM validation:', error);
    }
    
    // Fallback to old validation if LLM fails
    console.log('⚠️ LLM validation failed, using fallback validation');
    return this.validateSearchResults(state, searchResults);
  }

  private calculateNights(startDate?: string, endDate?: string): number {
    if (!startDate || !endDate) return 1;
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  }

  private async allocateBudget(state: TravelPlannerState): Promise<any> {
    try {
      const budgetMatch = state.budget?.match(/\d+/);
      const totalBudget = budgetMatch ? parseInt(budgetMatch[0]) : 1000;
      const nights = this.calculateNights(state.startDate, state.endDate);
      const days = nights + 1;

      const prompt = `You are a travel budget allocation expert. You need to intelligently distribute a traveler's budget across different expense categories.

**Trip Details:**
- Destination: ${state.originCity} to ${state.destinationCity}
- Duration: ${nights} nights, ${days} days
- Travelers: ${state.travelers} people
- TOTAL BUDGET: $${totalBudget} (for ALL ${state.travelers} people, ALL expenses)
- Purpose: ${state.purpose}
- Transportation Type: ${state.transportationType || 'flights'}
- Planning Categories: ${state.planningType?.join(', ')}

**Your Task:**
Intelligently allocate the TOTAL budget of $${totalBudget} across these categories, ensuring the sum equals exactly $${totalBudget}.

**Allocation Guidelines:**
1. **Transportation (${state.transportationType})**: 
   - Flights: typically 35-45% of budget
   - Buses: typically 10-15% of budget
   - Consider distance and travelers

2. **Accommodation**: 
   - 25-35% of budget
   - Calculate: $X per night × ${nights} nights
   - Should fit ${state.travelers} people

3. **Food**: 
   - 20-25% of budget
   - Calculate: $X per person per day × ${state.travelers} people × ${days} days
   - Consider destination cost of living

4. **Activities**: 
   - 15-20% of budget
   - Should cover entry fees, tours, experiences

5. **Contingency**: 
   - 5-10% for emergencies, tips, misc

**CRITICAL**: All allocations must be realistic and sum to EXACTLY $${totalBudget}.

**Response Format (JSON only):**
{
  "transportation": [exact dollar amount for ${state.transportationType}],
  "accommodation": [exact dollar amount for ${nights} nights],
  "food": [exact dollar amount for ${days} days],
  "activities": [exact dollar amount],
  "contingency": [exact dollar amount],
  "explanation": "Brief explanation of allocation strategy",
  "perPersonBreakdown": {
    "transportationPerPerson": [amount],
    "accommodationPerNight": [amount],
    "foodPerPersonPerDay": [amount]
  }
}

Ensure: transportation + accommodation + food + activities + contingency = ${totalBudget}`;

      console.log('🤖 Calling LLM for budget allocation...');
      const response = await this.llm.invoke(prompt);
      const llmResponse = response.content as string;
      console.log('✨ LLM allocation response:', llmResponse);

      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const allocation = JSON.parse(jsonMatch[0]);
        
        // Validate sum
        const sum = allocation.transportation + allocation.accommodation + 
                   allocation.food + allocation.activities + allocation.contingency;
        
        console.log('💰 Budget Allocation Breakdown:');
        console.log(`  📍 Total Budget: $${totalBudget}`);
        console.log(`  ✈️  Transportation: $${allocation.transportation} (${((allocation.transportation/totalBudget)*100).toFixed(1)}%)`);
        console.log(`  🏨 Accommodation: $${allocation.accommodation} (${((allocation.accommodation/totalBudget)*100).toFixed(1)}%)`);
        console.log(`  🍽️  Food: $${allocation.food} (${((allocation.food/totalBudget)*100).toFixed(1)}%)`);
        console.log(`  🎨 Activities: $${allocation.activities} (${((allocation.activities/totalBudget)*100).toFixed(1)}%)`);
        console.log(`  💵 Contingency: $${allocation.contingency} (${((allocation.contingency/totalBudget)*100).toFixed(1)}%)`);
        console.log(`  ➕ Sum: $${sum} (should equal $${totalBudget})`);
        
        if (Math.abs(sum - totalBudget) > 10) {
          console.warn(`⚠️  Allocation sum ($${sum}) doesn't match total budget ($${totalBudget})`);
        }
        
        return allocation;
      }
    } catch (error) {
      console.error('❌ Error allocating budget:', error);
    }
    
    // Fallback allocation if LLM fails
    const budgetMatch = state.budget?.match(/\d+/);
    const totalBudget = budgetMatch ? parseInt(budgetMatch[0]) : 1000;
    const isFlights = state.transportationType === 'flights';
    
    return {
      transportation: Math.round(totalBudget * (isFlights ? 0.40 : 0.12)),
      accommodation: Math.round(totalBudget * 0.30),
      food: Math.round(totalBudget * 0.20),
      activities: Math.round(totalBudget * 0.08),
      contingency: Math.round(totalBudget * 0.02),
      explanation: 'Fallback allocation',
      perPersonBreakdown: {
        transportationPerPerson: 0,
        accommodationPerNight: 0,
        foodPerPersonPerDay: 0
      }
    };
  }

  private handleValidationIssuesNode = (state: TravelPlannerState): Partial<TravelPlannerState> => {
    console.log('⚠️ handleValidationIssuesNode called');
    
    // Check if total budget exceeded (most critical issue)
    const totalBudgetExceeded = state.budgetIssues?.some(issue => issue.includes('TOTAL_BUDGET_EXCEEDED'));
    
    // If we haven't shown the validation message yet (first time in this node), present the issues
    if (!state.validationMessageShown) {
      let message = '\\n⚠️ **I found some issues with the search results:**\\n\\n';
      
      if (state.scheduleIssues && state.scheduleIssues.length > 0) {
        message += '📅 **Schedule Issues:**\\n';
        state.scheduleIssues.forEach(issue => {
          message += `- ${issue}\\n`;
        });
        message += '\\nWould you like to adjust your travel dates or continue with the current results? (Reply: \"adjust dates\" or \"continue\")\\n\\n';
      }
      
      if (state.budgetIssues && state.budgetIssues.length > 0) {
        message += '💰 **Budget Issues:**\\n';
        
        // Handle total budget exceeded specially
        if (totalBudgetExceeded) {
          const totalBudgetIssue = state.budgetIssues.find(issue => issue.includes('TOTAL_BUDGET_EXCEEDED'));
          message += `\\n❌ **Critical Budget Issue:**\\n${totalBudgetIssue}\\n\\n`;
          message += '**Your Options:**\\n';
          message += '1. **Increase budget** - Reply with new budget amount (e.g., \"$900\" or \"900\")\\n';
          message += '2. **Search for buses** - Reply \"buses\" to look for cheaper transportation\\n';
          message += '3. **Reduce trip scope** - Reply \"change preferences\" to adjust your plans\\n';
        } else {
          // Individual category issues (flights exceeded but total ok)
          state.budgetIssues.forEach(issue => {
            message += `- ${issue}\\n`;
          });
          message += '\\n**Options:**\\n';
          
          // If flights exceeded, offer bus alternative
          if (state.flightsBudgetExceeded && state.transportationType === 'flights') {
            message += '1. Search for buses instead (reply: \"buses\" or \"yes\")\\n';
            message += '2. Increase your budget (reply with new budget amount)\\n';
            message += '3. Continue with current options (reply: \"continue\")\\n';
          } else {
            message += '1. Increase your budget (reply with new budget amount)\\n';
            message += '2. Continue with budget-friendly alternatives (reply: \"continue\")\\n';
            message += '3. Change your preferences (reply: \"change preferences\")\\n';
          }
        }
      }
      
      return {
        responseMessage: message,
        currentNode: 'handle_validation_issues',
        validationMessageShown: true, // Mark that we've shown the message
      };
    }
    
    // If no user input yet, wait for response (stay in this node)
    if (!state.lastUserInput) {
      return {
        currentNode: 'handle_validation_issues',
      };
    }
    
    // Handle user's response
    const input = state.lastUserInput.toLowerCase();
    
    if (input.includes('bus') || input.includes('yes')) {
      // User wants to search for buses
      if (state.flightsBudgetExceeded || state.totalBudgetExceeded) {
        return {
          transportationType: 'buses',
          responseMessage: 'Great! Let me search for bus options instead. This should be more budget-friendly... 🚌',
          currentNode: 'search_options',
          budgetIssues: [],
          scheduleIssues: [],
          flightsBudgetExceeded: false,
          totalBudgetExceeded: false,
          accommodationBudgetExceeded: false,
          budgetAllocation: undefined, // Clear old allocation to re-allocate with buses
          transportationResults: undefined, // Clear flight results
          validationMessageShown: false, // Reset flag
        };
      }
    }
    
    if (input.includes('continue') || input.includes('ok') || input.includes('fine')) {
      // User accepts the issues, continue to generate plan
      return {
        budgetIssues: [],
        scheduleIssues: [],
        currentNode: 'generate_plan',
        validationMessageShown: false, // Reset flag
      };
    }
    
    if (input.includes('adjust') || input.includes('change dates')) {
      // Reset to ask dates again
      return {
        responseMessage: 'Let\'s adjust your travel dates. When would you like to start your trip?',
        currentNode: 'ask_start_date',
        startDate: undefined,
        endDate: undefined,
        budgetIssues: [],
        scheduleIssues: [],
        transportationResults: undefined,
        accommodationResults: undefined,
        activitiesResults: undefined,
        validationMessageShown: false, // Reset flag
      };
    }
    
    if (input.match(/\$?\d+/) || input.includes('budget')) {
      // User provided new budget
      const newBudget = state.lastUserInput.trim();
      return {
        budget: newBudget,
        responseMessage: `Got it! Updated your budget to ${newBudget}. Let me search again for better options...`,
        currentNode: 'search_options',
        budgetIssues: [],
        scheduleIssues: [],
        totalBudgetExceeded: false,
        flightsBudgetExceeded: false,
        accommodationBudgetExceeded: false,
        budgetAllocation: undefined, // Clear old allocation
        transportationResults: undefined,
        accommodationResults: undefined,
        activitiesResults: undefined,
        validationMessageShown: false, // Reset flag
      };
    }
    
    if (input.includes('change preferences')) {
      // Reset to planning type
      return {
        responseMessage: 'What would you like to change? (transportation, accommodation, or activities)',
        currentNode: 'ask_planning_type',
        planningType: undefined,
        budgetIssues: [],
        scheduleIssues: [],
        transportationResults: undefined,
        accommodationResults: undefined,
        activitiesResults: undefined,
        validationMessageShown: false, // Reset flag
      };
    }
    
    // Default: continue
    return {
      currentNode: 'generate_plan',
    };
  };

  private generatePlanNode = async (state: TravelPlannerState): Promise<Partial<TravelPlannerState>> => {
    const plan = await this.buildTravelPlan(state);
    return {
      conversationComplete: true,
      responseMessage: plan,
      currentNode: END,
    };
  };

  private async buildTravelPlan(state: TravelPlannerState): Promise<string> {
    const { originCity, destinationCity, travelers, budget, startDate, endDate, purpose, planningType, interests, 
            transportationResults, accommodationResults, activitiesResults } = state;

    let plan = `\n🎉 Fantastic! I've compiled your personalized travel plan:\n\n`;
    plan += `📍 **Route:** ${originCity} → ${destinationCity}\n`;
    plan += `👥 **Travelers:** ${travelers} ${travelers === 1 ? 'person' : 'people'}\n`;
    plan += `📅 **Dates:** ${startDate} to ${endDate}\n`;
    plan += `💰 **Budget:** ${budget}\n`;
    plan += `🎯 **Purpose:** ${purpose}\n`;
    plan += `🗺️ **Planning:** ${planningType?.join(', ')}\n`;
    if (interests) {
      plan += `🎨 **Interests:** ${interests}\n`;
    }

    plan += `\n**Here are your personalized recommendations:**\n\n`;

    // Transportation recommendations with LLM-powered analysis
    if (planningType?.includes('transportation')) {
      plan += `✈️ **Transportation:**\n`;
      
      if (transportationResults && transportationResults.length > 0) {
        const transportAnalysis = await this.analyzeTransportationOptions(state, transportationResults);
        plan += transportAnalysis + `\n`;
      } else {
        plan += `- Book ${travelers} ${travelers === 1 ? 'ticket' : 'tickets'} from ${originCity} to ${destinationCity}\n`;
        plan += `- Consider airport transfers or local transportation options\n`;
        plan += `- Look into rental cars or public transit passes\n\n`;
      }
    }

    // Accommodation recommendations with LLM-powered analysis
    if (planningType?.includes('accommodation')) {
      plan += `🏨 **Accommodation:**\n`;
      
      if (accommodationResults && accommodationResults.length > 0) {
        const accomAnalysis = await this.analyzeAccommodationOptions(state, accommodationResults);
        plan += accomAnalysis + `\n`;
      } else {
        if (purpose === 'business') {
          plan += `- Business hotels near conference centers or downtown\n`;
          plan += `- Look for hotels with meeting rooms and good WiFi\n`;
        } else {
          plan += `- Consider hotels, Airbnb, or vacation rentals\n`;
          plan += `- Look for places in convenient neighborhoods\n`;
        }
        plan += `- Book accommodations for ${travelers} ${travelers === 1 ? 'person' : 'people'} that fit your ${budget} budget\n\n`;
      }
    }

    // Activity recommendations with LLM-powered analysis
    if (planningType?.includes('activities')) {
      plan += `🎨 **Activities & Sightseeing:**\n`;
      
      if (activitiesResults && activitiesResults.length > 0) {
        const activitiesAnalysis = await this.analyzeActivitiesOptions(state, activitiesResults);
        plan += activitiesAnalysis + `\n`;
      } else {
        if (interests) {
          plan += `Based on your interest in ${interests}:\n`;
          const interestLower = interests.toLowerCase();
          if (interestLower.includes('adventure')) {
            plan += `- Outdoor activities, hiking, water sports\n`;
          }
          if (interestLower.includes('culture') || interestLower.includes('history')) {
            plan += `- Museums, historical sites, local cultural experiences\n`;
          }
          if (interestLower.includes('food')) {
            plan += `- Food tours, local restaurants, cooking classes\n`;
          }
          if (interestLower.includes('nature')) {
            plan += `- Parks, gardens, nature walks, scenic viewpoints\n`;
          }
          if (interestLower.includes('shopping')) {
            plan += `- Local markets, shopping districts, boutique stores\n`;
          }
          if (interestLower.includes('relax')) {
            plan += `- Spas, beaches, quiet cafes, peaceful gardens\n`;
          }
        }
        plan += `- Top attractions in ${destinationCity}\n`;
        plan += `- Local experiences and hidden gems\n\n`;
      }
    }

    // Generate comprehensive day-by-day itinerary using LLM
    if ((transportationResults && transportationResults.length > 0) || 
        (accommodationResults && accommodationResults.length > 0) || 
        (activitiesResults && activitiesResults.length > 0)) {
      const itinerary = await this.generateDailyItinerary(state);
      plan += `\n` + itinerary;
    }

    plan += `\nWould you like to start planning another trip? Just say "start over"! ✈️`;

    return plan;
  }

  // Public API - process user input through the state graph

  async getResponse(userInput: string): Promise<string> {
    const input = userInput.trim();

    console.log('\n========== CONVERSATION ENGINE DEBUG ==========');
    console.log('Current Node:', this.state.currentNode);
    console.log('User Input:', input);
    console.log('Current State:', JSON.stringify(this.state, null, 2));
    console.log('===============================================\n');

    // Handle reset commands
    if (input.toLowerCase().includes('start over') || input.toLowerCase().includes('reset')) {
      console.log('🔄 RESET: Restarting conversation');
      this.reset();
      return "No problem! Let's start fresh. ✈️ What city will you be traveling from?";
    }

    // Update state with user input
    this.state.lastUserInput = input;

    // Execute current node
    const currentNode = this.nodes.get(this.state.currentNode);
    if (!currentNode) {
      console.log('⚠️ WARNING: No current node found, starting from beginning');
      // If at START or invalid node, begin the graph
      this.state.currentNode = 'ask_origin';
      const startNode = this.nodes.get('ask_origin');
      if (startNode) {
        console.log('🚀 EXECUTING NODE: ask_origin (initial)');
        const updates = await startNode.execute(this.state);
        this.updateState(updates);
        console.log('� STATE UPDATES:', JSON.stringify(updates, null, 2));
        
        // If there was a validation error, return it
        if (this.state.validationError) {
          console.log('❌ VALIDATION ERROR:', this.state.validationError);
          this.state.lastUserInput = undefined;
          return this.state.responseMessage || this.state.validationError;
        }
        
        // If this was just asking the initial question (no user input), return it
        if (!input || this.state.responseMessage) {
          console.log('📤 INITIAL RESPONSE:', this.state.responseMessage);
          return this.state.responseMessage || '';
        }
        
        // Otherwise continue to next node to get the next question
        const nextNodeId = this.state.currentNode;
        console.log('✅ NODE COMPLETED. Next Node ID:', nextNodeId);
        
        if (nextNodeId === END || this.state.conversationComplete) {
          console.log('🏁 CONVERSATION COMPLETE');
          return this.state.responseMessage || '';
        }
        
        const nextNode = this.nodes.get(nextNodeId);
        if (nextNode) {
          this.state.lastUserInput = undefined;
          console.log('➡️ EXECUTING NEXT NODE:', nextNode.id, '(to get question)');
          const nextStateUpdates = await nextNode.execute(this.state);
          this.updateState(nextStateUpdates);
          
          // For search_options node, don't return question - it should start searching
          if (nextNode.id === 'search_options') {
            console.log('🔍 Search node detected, returning message directly');
            return this.state.responseMessage || 'Starting your travel search...';
          }
          
          // Personalize the question with LLM
          const personalizedQuestion = await this.personalizeQuestion(nextNode.id, this.state.responseMessage || '');
          console.log('📤 PERSONALIZED QUESTION:', personalizedQuestion);
          return personalizedQuestion;
        }
      }
      return "Let's start planning your trip! What city will you be traveling from?";
    }

    console.log('🎯 EXECUTING NODE:', currentNode.id);
    
    // Execute node and get state updates (await in case it's async)
    const stateUpdates = await currentNode.execute(this.state);
    this.updateState(stateUpdates);

    console.log('📊 STATE UPDATES:', JSON.stringify(stateUpdates, null, 2));

    // If there was a validation error, stay on current node
    if (this.state.validationError) {
      console.log('❌ VALIDATION ERROR:', this.state.validationError);
      // Clear the lastUserInput to prepare for next question
      this.state.lastUserInput = undefined;
      return this.state.responseMessage || this.state.validationError;
    }

    // Node completed successfully, move to next node
    const nextNodeId = this.state.currentNode;
    console.log('✅ NODE COMPLETED. Next Node ID:', nextNodeId);
    
    if (nextNodeId === END || this.state.conversationComplete) {
      console.log('🏁 CONVERSATION COMPLETE');
      return this.state.responseMessage || '';
    }

    // Get next node and execute it to get the next question
    const nextNode = this.nodes.get(nextNodeId);
    if (nextNode) {
      this.state.lastUserInput = undefined; // Clear input for next question
      console.log('➡️ EXECUTING NEXT NODE:', nextNode.id, '(to get question)');
      const nextStateUpdates = await nextNode.execute(this.state);
      this.updateState(nextStateUpdates);
      
      // For search_options node, don't return question - it should start searching
      if (nextNode.id === 'search_options') {
        console.log('🔍 Search node detected, returning message directly');
        return this.state.responseMessage || 'Starting your travel search...';
      }
      
      // Personalize the question with LLM
      const personalizedQuestion = await this.personalizeQuestion(nextNode.id, this.state.responseMessage || '');
      console.log('📤 PERSONALIZED QUESTION:', personalizedQuestion);
      return personalizedQuestion;
    }

    console.log('⚠️ WARNING: No next node found');
    return "Something went wrong. Please type 'start over' to begin again.";
  }

  // Personalize question based on node and collected state
  private async personalizeQuestion(nodeId: string, baseQuestion: string): Promise<string> {
    const { originCity, destinationCity, startDate, endDate, travelers, budget, purpose } = this.state;
    
    let context = '';
    let nextStep = '';
    
    switch (nodeId) {
      case 'ask_destination':
        context = `User is traveling from ${originCity}`;
        nextStep = 'their destination city';
        break;
      case 'ask_start_date':
        context = `User is traveling from ${originCity} to ${destinationCity}`;
        nextStep = 'when they want to start their trip (start date)';
        break;
      case 'ask_end_date':
        context = `User is traveling from ${originCity} to ${destinationCity}, starting ${startDate}`;
        nextStep = 'when they want to return (end date)';
        break;
      case 'ask_travelers':
        context = `User is traveling from ${originCity} to ${destinationCity}, from ${startDate} to ${endDate}`;
        nextStep = 'how many people are traveling';
        break;
      case 'ask_budget':
        context = `User is traveling from ${originCity} to ${destinationCity}, from ${startDate} to ${endDate}, with ${travelers} ${travelers === 1 ? 'person' : 'people'}`;
        nextStep = 'their budget for the trip';
        break;
      case 'ask_purpose':
        context = `User is traveling from ${originCity} to ${destinationCity}, from ${startDate} to ${endDate}, with ${travelers} ${travelers === 1 ? 'person' : 'people'}, budget: ${budget}`;
        nextStep = 'whether this is a business or vacation trip';
        break;
      case 'ask_planning_type':
        context = `User is planning a ${purpose} trip from ${originCity} to ${destinationCity}, from ${startDate} to ${endDate}, with ${travelers} ${travelers === 1 ? 'person' : 'people'}, budget: ${budget}`;
        nextStep = 'what they need help planning (transportation, accommodation, activities)';
        break;
      default:
        return baseQuestion;
    }
    
    try {
      const prompt = `You are a friendly, enthusiastic travel planning assistant. Generate a warm, personalized question.

Context: ${context}
Next Information Needed: ${nextStep}

Requirements:
- Be conversational and warm, like talking to a friend
- Reference the trip details naturally
- Show excitement about their destination
- Use appropriate travel emojis (✈️ 🌍 📅 👥 💰 🎯 🗺️)
- Keep it concise (1-2 sentences)
- End with a clear question asking for: ${nextStep}

Generate the personalized question:`;

      console.log('🤖 Calling LLM for personalization...');
      const response = await this.llm.invoke(prompt);
      const personalizedQuestion = response.content as string;
      console.log('✨ LLM Response:', personalizedQuestion);
      return personalizedQuestion;
    } catch (error) {
      console.error('❌ Error generating personalized question:', error);
      // Fallback to base question if LLM fails
      return baseQuestion;
    }
  }

  private updateState(updates: Partial<TravelPlannerState>): void {
    this.state = { ...this.state, ...updates };
  }

  // LLM-powered analysis methods for search results

  private async analyzeTransportationOptions(state: TravelPlannerState, results: any[]): Promise<string> {
    try {
      const resultsText = results.map((r, i) => 
        `Option ${i + 1}: ${r.title}\n${r.content?.substring(0, 300) || 'No details'}\nURL: ${r.url}\n`
      ).join('\n');

      const prompt = `You are a travel expert analyzing transportation options.

Trip Details:
- Route: ${state.originCity} to ${state.destinationCity}
- Dates: ${state.startDate} to ${state.endDate}
- Travelers: ${state.travelers}
- Budget: ${state.budget}

Search Results:
${resultsText}

Task: Analyze ALL results and select the TOP 3 best options that:
1. Best match the budget and travel dates
2. Offer good value for money
3. Have convenient schedules
4. Are compatible with the overall trip plan

Provide a concise response in this format:
**Best Transportation Options:**
1. [Option Name](URL) - Brief reason why it's good (price, timing, convenience)
2. [Option Name](URL) - Brief reason
3. [Option Name](URL) - Brief reason

Keep it concise and actionable. Focus on practical recommendations.`;

      const response = await this.llm.invoke(prompt);
      return response.content as string;
    } catch (error) {
      console.error('Error analyzing transportation:', error);
      // Fallback to simple list
      return results.slice(0, 3).map((r, i) => 
        `${i + 1}. [${r.title}](${r.url})`
      ).join('\n');
    }
  }

  private async analyzeAccommodationOptions(state: TravelPlannerState, results: any[]): Promise<string> {
    try {
      const resultsText = results.map((r, i) => 
        `Option ${i + 1}: ${r.title}\n${r.content?.substring(0, 300) || 'No details'}\nURL: ${r.url}\n`
      ).join('\n');

      const prompt = `You are a travel expert analyzing accommodation options.

Trip Details:
- Destination: ${state.destinationCity}
- Dates: ${state.startDate} to ${state.endDate}
- Travelers: ${state.travelers}
- Budget: ${state.budget}
- Purpose: ${state.purpose}
- Interests: ${state.interests || 'general travel'}

Search Results:
${resultsText}

Task: Analyze ALL results and select the TOP 3 best accommodations that:
1. Fit within the budget
2. Are well-located for activities
3. Match the travel purpose (${state.purpose})
4. Have good reviews and amenities
5. Offer best value for the group size

Provide a concise response in this format:
**Best Accommodation Options:**
1. [Hotel/Property Name](URL) - Why it's ideal (location, price, amenities)
2. [Hotel/Property Name](URL) - Why it's ideal
3. [Hotel/Property Name](URL) - Why it's ideal

Keep it concise and highlight what makes each unique.`;

      const response = await this.llm.invoke(prompt);
      return response.content as string;
    } catch (error) {
      console.error('Error analyzing accommodation:', error);
      return results.slice(0, 3).map((r, i) => 
        `${i + 1}. [${r.title}](${r.url})`
      ).join('\n');
    }
  }

  private async analyzeActivitiesOptions(state: TravelPlannerState, results: any[]): Promise<string> {
    try {
      const resultsText = results.map((r, i) => 
        `Activity ${i + 1}: ${r.title}\n${r.content?.substring(0, 300) || 'No details'}\nURL: ${r.url}\n`
      ).join('\n');

      const prompt = `You are a travel expert analyzing activities and attractions.

Trip Details:
- Destination: ${state.destinationCity}
- Dates: ${state.startDate} to ${state.endDate}
- Travelers: ${state.travelers}
- Budget: ${state.budget}
- Interests: ${state.interests || 'general sightseeing'}
- Purpose: ${state.purpose}

Search Results:
${resultsText}

Task: Analyze ALL results and select the TOP 5 best activities that:
1. Match the interests: ${state.interests || 'general travel'}
2. Are suitable for ${state.travelers} people
3. Fit the travel dates and schedule
4. Offer diverse experiences (mix of indoor/outdoor, cultural/adventure, etc.)
5. Provide good value

Provide a concise response in this format:
**Top Activities & Attractions:**
1. [Activity Name](URL) - Why it matches interests (timing, cost, experience type)
2. [Activity Name](URL) - Why recommended
3. [Activity Name](URL) - Why recommended
4. [Activity Name](URL) - Why recommended
5. [Activity Name](URL) - Why recommended

Focus on creating a balanced itinerary with varied experiences.`;

      const response = await this.llm.invoke(prompt);
      return response.content as string;
    } catch (error) {
      console.error('Error analyzing activities:', error);
      return results.slice(0, 5).map((r, i) => 
        `${i + 1}. [${r.title}](${r.url})`
      ).join('\n');
    }
  }

  private async generateDailyItinerary(state: TravelPlannerState): Promise<string> {
    try {
      // Calculate trip duration
      const start = new Date(state.startDate!);
      const end = new Date(state.endDate!);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      const prompt = `You are a travel expert creating a detailed day-by-day itinerary.

Trip Details:
- Route: ${state.originCity} to ${state.destinationCity}
- Duration: ${days} days (${state.startDate} to ${state.endDate})
- Travelers: ${state.travelers}
- Budget: ${state.budget}
- Purpose: ${state.purpose}
- Interests: ${state.interests || 'general travel'}

Available Information:
- Transportation: ${state.transportationResults?.length || 0} options found
- Accommodation: ${state.accommodationResults?.length || 0} options found
- Activities: ${state.activitiesResults?.length || 0} options found

Task: Create a realistic, hour-by-hour itinerary for ${days} days that:
1. Includes arrival/departure logistics
2. Balances activities with rest time
3. Groups nearby attractions together
4. Allows time for meals and travel between locations
5. Fits the budget and interests
6. Is practical and achievable

Format as:
📅 **Day-by-Day Itinerary:**

**Day 1 (${state.startDate}):**
- Morning: [Activity with timing]
- Afternoon: [Activity with timing]
- Evening: [Activity with timing]

**Day 2:**
- Morning: [Activity]
- Afternoon: [Activity]
- Evening: [Activity]

[Continue for all ${days} days]

Make it specific, realistic, and exciting. Include approximate times where relevant.`;

      const response = await this.llm.invoke(prompt);
      return response.content as string;
    } catch (error) {
      console.error('Error generating itinerary:', error);
      return `\n📅 **Suggested Itinerary:**\n- Plan your days based on the recommendations above\n- Mix activities with relaxation time\n- Allow flexibility for spontaneous discoveries\n`;
    }
  }

  // Reset conversation state
  reset(): void {
    this.state = this.createInitialState();
  }

  // Get current state (useful for debugging)
  getState(): TravelPlannerState {
    return { ...this.state };
  }
}
