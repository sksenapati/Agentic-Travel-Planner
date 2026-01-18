'use client';

import { useEffect, useRef, useState } from 'react';

interface GraphVisualizerProps {
  mermaidDefinition: string;
}

export default function GraphVisualizer({ mermaidDefinition }: GraphVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const renderDiagram = async () => {
      try {
        // Dynamically import mermaid to avoid SSR issues
        const mermaid = (await import('mermaid')).default;
        
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
            curve: 'basis',
          },
        });

        if (containerRef.current) {
          const { svg } = await mermaid.render('mermaid-svg-' + Date.now(), mermaidDefinition);
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        console.error('Mermaid render error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    renderDiagram();
  }, [mermaidDefinition]);

  if (error) {
    return (
      <div className="w-full bg-red-50 dark:bg-red-900/20 p-6 rounded-lg">
        <p className="text-red-600 dark:text-red-400">Error rendering diagram: {error}</p>
        <pre className="mt-2 text-xs overflow-auto">{mermaidDefinition}</pre>
      </div>
    );
  }

  return (
    <div className="w-full overflow-auto bg-gray-50 dark:bg-gray-900 p-6 rounded-lg shadow-lg">
      <div 
        ref={containerRef} 
        className="flex justify-center items-center min-h-[600px] w-full"
      >
        <div className="text-gray-500 dark:text-gray-400">Rendering diagram...</div>
      </div>
    </div>
  );
}
