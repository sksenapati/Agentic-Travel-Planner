'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import GraphVisualizer to avoid SSR issues with mermaid
const GraphVisualizer = dynamic(() => import('@/components/GraphVisualizer'), {
  ssr: false,
  loading: () => <div className="text-center p-8">Loading graph visualization...</div>,
});

interface GraphStructure {
  nodes: string[];
  edges: { source: string; target: string | string[]; condition?: boolean }[];
}

function generateMermaidFromStructure(structure: GraphStructure): string {
  const { nodes, edges } = structure;
  
  // Node labels
  const nodeLabels: Record<string, string> = {
    '__start__': 'START',
    'ask_origin': 'Ask Origin City',
    'ask_destination': 'Ask Destination City',
    'ask_start_date': 'Ask Start Date',
    'ask_end_date': 'Ask End Date',
    'ask_travelers': 'Ask Number of Travelers',
    'ask_budget': 'Ask Budget',
    'ask_purpose': 'Ask Purpose',
    'ask_planning_type': 'Ask Planning Type',
    'search_options': 'Search Options: Budget Allocation + Tavily Search',
    'handle_validation_issues': 'Handle Validation Issues',
    'generate_plan': 'Generate Travel Plan',
    '__end__': 'END'
  };

  // Build mermaid definition
  let mermaid = 'graph TD\n';
  
  // Add edges
  edges.forEach(edge => {
    const source = edge.source === '__start__' ? 'START' : edge.source;
    
    if (Array.isArray(edge.target)) {
      // Conditional edge - create a decision node
      const decisionNode = `${source}_decision`;
      mermaid += `    ${source} --> ${decisionNode}{Decision}\n`;
      
      edge.target.forEach(target => {
        const targetNode = target === '__end__' ? 'END' : target;
        const label = target === 'handle_validation_issues' ? 'Issues Found' :
                     target === 'generate_plan' ? 'All Good' :
                     target === 'search_options' ? 'Retry' :
                     target === 'ask_start_date' ? 'Adjust Dates' :
                     target === 'ask_planning_type' ? 'Change Prefs' : '';
        
        if (label) {
          mermaid += `    ${decisionNode} -->|${label}| ${targetNode}[${nodeLabels[target] || target}]\n`;
        } else {
          mermaid += `    ${decisionNode} --> ${targetNode}[${nodeLabels[target] || target}]\n`;
        }
      });
    } else {
      const target = edge.target === '__end__' ? 'END' : edge.target;
      const sourceLabel = nodeLabels[edge.source] || edge.source;
      const targetLabel = nodeLabels[edge.target] || edge.target;
      
      if (edge.source === '__start__') {
        mermaid += `    START([START]) --> ${target}[${targetLabel}]\n`;
      } else if (edge.target === '__end__') {
        mermaid += `    ${source}[${sourceLabel}] --> END([END])\n`;
      } else {
        mermaid += `    ${source}[${sourceLabel}] --> ${target}[${targetLabel}]\n`;
      }
    }
  });
  
  // Add styling
  mermaid += `
    classDef startStyle fill:#4CAF50,stroke:#2E7D32,stroke-width:3px,color:#fff,font-weight:bold,font-size:16px
    classDef endStyle fill:#F44336,stroke:#C62828,stroke-width:3px,color:#fff,font-weight:bold,font-size:16px
    classDef searchStyle fill:#2196F3,stroke:#1565C0,stroke-width:2px,color:#fff,font-weight:bold,font-size:14px
    classDef decisionStyle fill:#FF9800,stroke:#E65100,stroke-width:2px,color:#000,font-weight:bold,font-size:14px
    classDef handleStyle fill:#FFC107,stroke:#F57C00,stroke-width:2px,color:#000,font-weight:bold,font-size:14px
    classDef generateStyle fill:#9C27B0,stroke:#6A1B9A,stroke-width:2px,color:#fff,font-weight:bold,font-size:14px
    classDef questionStyle fill:#64B5F6,stroke:#1976D2,stroke-width:2px,color:#000,font-weight:600,font-size:14px
    
    class START startStyle
    class END endStyle
    class search_options searchStyle
    class search_options_decision,handle_validation_issues_decision decisionStyle
    class handle_validation_issues handleStyle
    class generate_plan generateStyle
    class ask_origin,ask_destination,ask_start_date,ask_end_date,ask_travelers,ask_budget,ask_purpose,ask_planning_type questionStyle
  `;
  
  return mermaid;
}

export default function GraphPage() {
  const [graphStructure, setGraphStructure] = useState<GraphStructure | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchGraph() {
      try {
        const response = await fetch('/api/graph');
        if (!response.ok) {
          throw new Error('Failed to fetch graph structure');
        }
        const data = await response.json();
        setGraphStructure(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchGraph();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-8 flex items-center justify-center">
        <div className="text-2xl text-gray-600 dark:text-gray-300">Loading graph structure...</div>
      </div>
    );
  }

  if (error || !graphStructure) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-8 flex items-center justify-center">
        <div className="text-2xl text-red-600 dark:text-red-400">Error: {error || 'No graph data'}</div>
      </div>
    );
  }

  const mermaidDefinition = generateMermaidFromStructure(graphStructure);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Travel Planner StateGraph Visualization
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Visual representation of the conversation flow with LangGraph-style StateGraph pattern
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100 mb-4">
              Graph Structure
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-700 dark:text-blue-300 mb-2">
                  📝 Question Nodes (8)
                </h3>
                <ul className="text-gray-700 dark:text-gray-300 space-y-1">
                  <li>• Ask Origin City</li>
                  <li>• Ask Destination</li>
                  <li>• Ask Dates (Start/End)</li>
                  <li>• Ask Travelers</li>
                  <li>• Ask Budget</li>
                  <li>• Ask Purpose</li>
                  <li>• Ask Planning Type</li>
                </ul>
              </div>

              <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                <h3 className="font-semibold text-purple-700 dark:text-purple-300 mb-2">
                  🔍 Processing Nodes (3)
                </h3>
                <ul className="text-gray-700 dark:text-gray-300 space-y-1">
                  <li>• Search Options</li>
                  <li>• Handle Validation</li>
                  <li>• Generate Plan</li>
                </ul>
              </div>

              <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
                <h3 className="font-semibold text-orange-700 dark:text-orange-300 mb-2">
                  🔀 Key Features
                </h3>
                <ul className="text-gray-700 dark:text-gray-300 space-y-1">
                  <li>• Budget Allocation</li>
                  <li>• Tavily Search (10 results)</li>
                  <li>• LLM Validation</li>
                  <li>• Retry with Bus Option</li>
                  <li>• Budget Increase Flow</li>
                </ul>
              </div>
            </div>
          </div>

          <GraphVisualizer mermaidDefinition={mermaidDefinition} />

          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-2">
              Legend:
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span className="text-gray-700 dark:text-gray-300">Start</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-blue-200 rounded"></div>
                <span className="text-gray-700 dark:text-gray-300">Question Nodes</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-blue-500 rounded"></div>
                <span className="text-gray-700 dark:text-gray-300">Search Node</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-orange-500 rounded"></div>
                <span className="text-gray-700 dark:text-gray-300">Decision Points</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                <span className="text-gray-700 dark:text-gray-300">Validation Handler</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-purple-500 rounded"></div>
                <span className="text-gray-700 dark:text-gray-300">Generate Plan</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-red-500 rounded"></div>
                <span className="text-gray-700 dark:text-gray-300">End</span>
              </div>
            </div>
          </div>

          <div className="mt-6 text-center">
            <a
              href="/"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg shadow-lg transition-colors"
            >
              ← Back to Chatbot
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
