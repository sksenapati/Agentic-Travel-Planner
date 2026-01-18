import { NextRequest, NextResponse } from "next/server";
import { ConversationEngine } from "@/components/ConversationEngine";

// Create a singleton instance of the conversation engine
// In a production app, you'd want to store this per user session
const conversationEngines = new Map<string, ConversationEngine>();

export async function POST(req: NextRequest) {
  try {
    const { message, conversationHistory, sessionId = "default" } = await req.json();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Get or create conversation engine for this session
    let engine = conversationEngines.get(sessionId);
    if (!engine) {
      engine = new ConversationEngine();
      conversationEngines.set(sessionId, engine);
    }

    // Process the message through our state graph (now async for LLM personalization)
    const response = await engine.getResponse(message);
    const isSearching = engine.isSearching();

    return NextResponse.json({
      response: response,
      isSearching: isSearching,
    });
  } catch (error: unknown) {
    console.error("Error processing conversation:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return NextResponse.json(
      { 
        error: "Failed to process conversation",
        details: errorMessage 
      },
      { status: 500 }
    );
  }
}
