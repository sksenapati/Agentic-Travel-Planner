'use client';

import { useState, useRef, useEffect } from 'react';
import Message from './Message';
import ChatInput, { ChatInputHandle } from './ChatInput';

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

export default function Chatbot() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      text: "Hello! ✈️ I'm your Travel Planning Assistant! Let's plan your perfect trip. What city will you be traveling from?",
      sender: 'bot',
      timestamp: new Date(),
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
    // Focus input after bot responds
    if (messages.length > 0 && messages[messages.length - 1].sender === 'bot') {
      setTimeout(() => chatInputRef.current?.focus(), 100);
    }
  }, [messages]);

  const handleSendMessage = async (text: string) => {
    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Show typing indicator
    setIsTyping(true);

    try {
      // Call API with conversation history
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          conversationHistory: messages.slice(-10), // Send last 10 messages for context
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response');
      }

      // Check if the bot is searching
      if (data.isSearching) {
        setIsSearching(true);
        setIsTyping(false);
      }

      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: data.response,
        sender: 'bot',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMessage]);

      // If search was initiated, wait a bit and then trigger another request to get results
      if (data.isSearching) {
        setTimeout(async () => {
          try {
            const searchResponse = await fetch('/api/chat', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                message: '__CONTINUE_SEARCH__', // Special message to continue
                conversationHistory: messages.slice(-10),
              }),
            });
            const searchData = await searchResponse.json();
            setIsSearching(false);
            
            if (searchResponse.ok && searchData.response) {
              const searchResultMessage: ChatMessage = {
                id: Date.now().toString(),
                text: searchData.response,
                sender: 'bot',
                timestamp: new Date(),
              };
              setMessages((prev) => [...prev, searchResultMessage]);
            }
          } catch (error) {
            console.error('Error fetching search results:', error);
            setIsSearching(false);
          }
        }, 1000); // Wait 1 second before fetching results
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: "I apologize, but I'm having trouble processing your request right now. Please try again! 😔",
        sender: 'bot',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      if (!isSearching) {
        setIsTyping(false);
      }
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-4xl h-[800px] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
          <h1 className="text-2xl font-bold">✈️ Travel Planning Assistant</h1>
          <p className="text-sm text-blue-100 mt-1">Let's plan your perfect trip together!</p>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50 dark:bg-gray-900">
          {messages.map((message) => (
            <Message key={message.id} message={message} />
          ))}
          {isTyping && (
            <div className="flex items-start space-x-2">
              <div className="bg-gray-200 dark:bg-gray-700 rounded-2xl px-4 py-3">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          )}
          {isSearching && (
            <div className="flex items-start space-x-2">
              <div className="bg-blue-100 dark:bg-blue-900 border-2 border-blue-300 dark:border-blue-600 rounded-2xl px-5 py-4">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <div className="w-6 h-6 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                  </div>
                  <div className="text-blue-700 dark:text-blue-200 font-medium">
                    🔍 Searching for the best options...
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <ChatInput ref={chatInputRef} onSendMessage={handleSendMessage} disabled={isTyping || isSearching} />
      </div>
    </div>
  );
}
