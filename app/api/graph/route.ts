import { ConversationEngine } from '@/components/ConversationEngine';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Create a temporary engine instance just to export the graph
    const engine = new ConversationEngine();
    const graphStructure = engine.exportGraphStructure();
    
    return NextResponse.json(graphStructure);
  } catch (error) {
    console.error('Error exporting graph:', error);
    return NextResponse.json(
      { error: 'Failed to export graph structure' },
      { status: 500 }
    );
  }
}
