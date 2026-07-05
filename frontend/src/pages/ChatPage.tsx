import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';
import type { Message } from '../hooks/useChat';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Bot, Send, Moon, Sun, User as UserIcon, RefreshCcw, Copy, Check, LogOut, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import toast, { Toaster } from 'react-hot-toast';

export function ChatPage() {
  const { messages, isLoading, sendMessage, retryMessage, clearChat } = useChat();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage(input);
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-50 transition-colors duration-300 font-sans overflow-hidden">
      <Toaster position="top-center" />
      
      {}
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 z-10">
        <div className="flex items-center space-x-3">
          <Bot className="w-8 h-8 text-electricBlue" />
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-none">Jarvis Core</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Digital Twin Interface</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {messages.length > 0 && (
            <button 
              onClick={clearChat}
              className="p-2 rounded-full text-slate-500 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
              aria-label="Clear Chat"
              title="Clear Chat"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
          <button 
            onClick={toggleTheme}
            className="p-2 rounded-full text-slate-500 hover:text-electricBlue hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-electricBlue"
            aria-label="Toggle Theme"
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <div className="h-6 w-px bg-slate-300 dark:bg-slate-700 mx-2" />
          <button 
            onClick={logout}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-full text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
            aria-label="Logout"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar relative">
        <div className="max-w-4xl mx-auto flex flex-col space-y-6 pb-6">
          
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[50vh] text-center opacity-80">
              <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-full shadow-sm flex items-center justify-center mb-6">
                <Bot className="w-10 h-10 text-electricBlue" />
              </div>
              <h2 className="text-2xl font-bold mb-3">How can I assist you today?</h2>
              <p className="text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
                I am Jarvis, Mithelesh's digital twin. I can manage the calendar, draft emails, or answer questions about his profile.
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((msg, index) => (
                <ChatMessage 
                  key={msg.id} 
                  message={msg} 
                  user={user} 
                  onRetry={() => {
                    if (index > 0 && messages[index - 1].role === 'user') {
                      retryMessage(messages[index - 1].content);
                    }
                  }} 
                />
              ))}
            </AnimatePresence>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {}
      <footer className="flex-shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4">
        <div className="max-w-4xl mx-auto relative">
          <form onSubmit={handleSubmit} className="relative flex items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Jarvis..."
              aria-label="Chat input"
              className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-2xl py-3 px-4 pr-12 focus:ring-2 focus:ring-electricBlue focus:outline-none resize-none max-h-32 min-h-[52px] custom-scrollbar"
              rows={1}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              aria-label="Send message"
              className="absolute right-2 bottom-1.5 p-2 rounded-full bg-electricBlue text-slate-900 font-bold disabled:opacity-50 disabled:bg-slate-300 dark:disabled:bg-slate-700 transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <div className="text-center mt-2" aria-live="polite">
             <span className="text-[11px] text-slate-500 dark:text-slate-400">Jarvis may produce inaccurate information about people, places, or facts.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

const ChatMessage = React.memo(function ChatMessage({ message, user, onRetry }: { message: Message, user: any, onRetry: () => void }) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    toast.success('Copied to clipboard', { id: 'copy-toast' });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} w-full group`}
    >
      <div className={`flex w-full max-w-full sm:max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        
        {}
        <div className={`flex-shrink-0 flex items-start ${isUser ? 'ml-3' : 'mr-3'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-slate-200 dark:bg-slate-700' : 'bg-electricBlue text-slate-900 shadow-sm'}`}>
            {isUser ? (
              user?.pictureUrl ? <img src={user.pictureUrl} alt={user.name || "User"} className="w-full h-full rounded-full" /> : <UserIcon className="w-5 h-5" />
            ) : (
              <Bot className="w-5 h-5" />
            )}
          </div>
        </div>

        {}
        <div className="flex flex-col relative flex-grow overflow-hidden max-w-[calc(100%-2.5rem)]">
          <div 
            className={`px-5 py-4 rounded-2xl ${
              isUser 
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-tr-none ml-auto max-w-full inline-block' 
                : message.isError
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-tl-none w-full'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm rounded-tl-none w-full'
            }`}
          >
            {message.isStreaming && !message.content ? (
              <div className="flex items-center space-x-1.5 h-6 opacity-70">
                <span className="w-2 h-2 bg-electricBlue rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-electricBlue rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-electricBlue rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            ) : (
              <div className={`markdown-body prose prose-sm md:prose-base dark:prose-invert max-w-none break-words ${isUser ? 'prose-p:m-0' : ''}`}>
                {isUser ? (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                ) : (
                  <ReactMarkdown
                    components={{
                      code({ node, inline, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || '')
                        return !inline && match ? (
                          <div className="overflow-hidden rounded-md my-4 shadow-sm border border-slate-200 dark:border-slate-700">
                            <SyntaxHighlighter
                              {...props}
                              style={vscDarkPlus as any}
                              language={match[1]}
                              PreTag="div"
                              className="m-0 !bg-slate-900 !p-4 custom-scrollbar"
                            >
                              {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                          </div>
                        ) : (
                          <code {...props} className="bg-slate-100 dark:bg-slate-900 text-electricBlue px-1.5 py-0.5 rounded font-mono text-sm">
                            {children}
                          </code>
                        )
                      }
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                )}
                {message.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-electricBlue animate-pulse align-middle" />}
              </div>
            )}
          </div>

          {}
          {!isUser && !message.isStreaming && (
            <div className="mt-2 flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={handleCopy}
                className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-500 hover:text-electricBlue shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-electricBlue"
                aria-label="Copy message"
                title="Copy message"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              {message.isError && (
                <button 
                  onClick={onRetry}
                  className="px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-red-500 hover:text-red-600 shadow-sm flex items-center space-x-1 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label="Retry"
                  title="Retry"
                >
                  <RefreshCcw className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold">Retry</span>
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    </motion.div>
  );
});
