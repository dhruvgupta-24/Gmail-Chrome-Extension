import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage as ChatMessageType } from '../../types/ai';
import { ChatMessage } from './ChatMessage';
import { QuickActions } from './QuickActions';
import { Send, Sparkles, Loader2, Trash2 } from 'lucide-react';

interface ChatViewProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  onSendMessage: (text: string) => void;
  onClearHistory: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  isLoading,
  onSendMessage,
  onClearHistory
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    const query = inputText.trim();
    setInputText('');
    onSendMessage(query);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
      {/* Quick Action Pills */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-850/60 backdrop-blur-sm">
        <QuickActions onSelectAction={onSendMessage} disabled={isLoading} />
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Ask anything about your mailbox
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
              Search tests, assessments, placements, assignment deadlines, or get a quick summary.
            </p>
          </div>
        ) : (
          messages.map(msg => (
            <ChatMessage key={msg.id} message={msg} onSelectFollowUp={onSendMessage} />
          ))
        )}

        {isLoading && (
          <div className="flex items-center gap-2 p-3 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-[80%] shadow-sm">
            <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Searching mailbox & reasoning with AI...
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Clear conversation & Input box */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850">
        {messages.length > 0 && (
          <div className="flex justify-end mb-1.5">
            <button
              onClick={onClearHistory}
              className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear chat history</span>
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="Ask about tests, deadlines, links, placements..."
            disabled={isLoading}
            className="w-full pl-3.5 pr-10 py-2.5 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="absolute right-1.5 p-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-lg transition-colors shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
