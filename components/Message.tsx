import { ChatMessage } from './Chatbot';

interface MessageProps {
  message: ChatMessage;
}

function formatMessage(text: string) {
  // Replace escaped newlines with actual newlines
  let formatted = text.replace(/\\n/g, '\n');
  
  // Split by newlines to process line by line
  const lines = formatted.split('\n');
  
  return lines.map((line, lineIndex) => {
    // Skip empty lines but preserve them for spacing
    if (line.trim() === '') {
      return <br key={`br-${lineIndex}`} />;
    }
    
    // Check for markdown-style headings (###, ##, #)
    const markdownHeadingMatch = line.match(/^[\s]*(#{1,3})\s+(.+)$/);
    if (markdownHeadingMatch) {
      const level = markdownHeadingMatch[1].length;
      const headingText = markdownHeadingMatch[2];
      
      // Different sizes based on heading level
      const sizeClass = level === 1 ? 'text-lg' : level === 2 ? 'text-base' : 'text-[15px]';
      
      return (
        <div key={`line-${lineIndex}`} className={`font-bold ${sizeClass} mt-4 mb-2 text-gray-900 dark:text-gray-100`}>
          {processInlineFormatting(headingText, lineIndex)}
        </div>
      );
    }
    
    // Check if line is a heading - any line ending with colon that has:
    // - Emoji at start, OR
    // - Bold markers (**), OR  
    // - Starts with capital letter and ends with colon
    const isHeading = line.match(/^[\s]*([🏨✈️🎯🍽️💰📍👥📅🎉🎨🚌🏠🎢🌟⭐🔍]|[A-Z]).*:[\s]*$/);
    if (isHeading) {
      return (
        <div key={`line-${lineIndex}`} className="font-semibold text-[15px] mt-4 mb-2 text-gray-900 dark:text-gray-100">
          {processInlineFormatting(line.trim(), lineIndex)}
        </div>
      );
    }
    
    // Check if line is a bullet point
    const bulletMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
    if (bulletMatch) {
      return (
        <div key={`line-${lineIndex}`} className="flex items-start space-x-2 ml-4 my-1">
          <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
          <span className="flex-1">{processInlineFormatting(bulletMatch[1], lineIndex)}</span>
        </div>
      );
    }
    
    // Check if line is a numbered list
    const numberedMatch = line.match(/^[\s]*(\d+)\.\s+(.+)$/);
    if (numberedMatch) {
      return (
        <div key={`line-${lineIndex}`} className="flex items-start space-x-2 ml-4 my-1">
          <span className="text-blue-600 dark:text-blue-400 font-semibold min-w-[1.5rem]">
            {numberedMatch[1]}.
          </span>
          <span className="flex-1">{processInlineFormatting(numberedMatch[2], lineIndex)}</span>
        </div>
      );
    }
    
    // Regular line with inline formatting
    return (
      <div key={`line-${lineIndex}`} className="leading-relaxed my-1">
        {processInlineFormatting(line, lineIndex)}
      </div>
    );
  });
}

function processInlineFormatting(text: string, lineIndex: number) {
  const parts: (string | JSX.Element)[] = [];
  let remaining = text;
  let keyCounter = 0;
  
  // Combined regex to match links and bold text
  const combinedRegex = /(\[([^\]]+)\]\(([^)]+)\))|(\*\*(.+?)\*\*)/g;
  let lastIndex = 0;
  let match;
  
  while ((match = combinedRegex.exec(remaining)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(remaining.substring(lastIndex, match.index));
    }
    
    // Check if it's a link [text](url)
    if (match[1]) {
      const linkText = match[2];
      const url = match[3];
      parts.push(
        <a
          key={`link-${lineIndex}-${keyCounter++}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          {linkText}
        </a>
      );
    }
    // Check if it's bold text **text**
    else if (match[4]) {
      parts.push(
        <strong key={`bold-${lineIndex}-${keyCounter++}`} className="font-bold">
          {match[5]}
        </strong>
      );
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text after last match
  if (lastIndex < remaining.length) {
    parts.push(remaining.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : text;
}

export default function Message({ message }: MessageProps) {
  const isBot = message.sender === 'bot';

  return (
    <div className={`flex ${isBot ? 'items-start' : 'items-end justify-end'}`}>
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-3 ${
          isBot
            ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-md'
            : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
        }`}
      >
        <div className="text-sm">{formatMessage(message.text)}</div>
        <p
          className={`text-xs mt-2 ${
            isBot ? "text-gray-500 dark:text-gray-400" : "text-blue-100"
          }`}
        >
          {message.timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
}
