import React from 'react';
import { ChatMessage as ChatMessageType } from '../../types/ai';
import { EventCard } from './EventCard';
import { getGmailLink } from '../../shared/utils';
import { Bot, User, AlertCircle, Mail, ExternalLink } from 'lucide-react';

interface ChatMessageProps {
  message: ChatMessageType;
  onSelectFollowUp?: (query: string) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onSelectFollowUp }) => {
  const isUser = message.role === 'user';

  // Basic formatted markdown renderer for bullet points, bold text, links
  const renderFormattedContent = (content: string) => {
    const lines = content.split('\n');
    return (
      <div className="space-y-1.5 text-xs sm:text-sm leading-relaxed text-slate-800 dark:text-slate-200">
        {lines.map((line, idx) => {
          if (!line.trim()) return <div key={idx} className="h-1" />;

          // Heading
          if (line.startsWith('### ')) {
            return (
              <h4 key={idx} className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 mt-2">
                {line.substring(4)}
              </h4>
            );
          }
          if (line.startsWith('## ') || line.startsWith('# ')) {
            return (
              <h3 key={idx} className="font-semibold text-sm text-slate-900 dark:text-slate-100 mt-2">
                {line.replace(/^#+\s*/, '')}
              </h3>
            );
          }

          // Bullet list item
          if (line.trim().startsWith('•') || line.trim().startsWith('-') || line.trim().startsWith('*')) {
            const clean = line.trim().replace(/^[\•\-\*]\s*/, '');
            return (
              <div key={idx} className="flex items-start gap-2 pl-1">
                <span className="text-emerald-500 font-bold">•</span>
                <span>{renderInlineMarkdown(clean)}</span>
              </div>
            );
          }

          return <p key={idx}>{renderInlineMarkdown(line)}</p>;
        })}
      </div>
    );
  };

  const renderInlineMarkdown = (text: string) => {
    // Bold: **text**
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-slate-900 dark:text-white">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start`}>
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold ${
          isUser
            ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
        }`}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      {/* Message Body */}
      <div className={`max-w-[85%] space-y-2.5 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-3.5 py-2.5 rounded-2xl ${
            isUser
              ? 'bg-emerald-600 text-white rounded-tr-sm'
              : message.isError
              ? 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 rounded-tl-sm'
              : 'bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 shadow-sm rounded-tl-sm'
          }`}
        >
          {message.isError && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 mb-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Notice</span>
            </div>
          )}

          {isUser ? (
            <p className="text-xs sm:text-sm leading-relaxed">{message.content}</p>
          ) : (
            renderFormattedContent(message.content)
          )}
        </div>

        {/* Render Extracted Events if provided in response */}
        {message.events && message.events.length > 0 && (
          <div className="space-y-2 mt-2">
            {message.events.map(event => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}

        {/* Source Emails Attribution */}
        {message.sourceMessages && message.sourceMessages.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Sources:</span>
            {message.sourceMessages.map((src, idx) => (
              <a
                key={idx}
                href={getGmailLink(src.messageId, src.threadId)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-700 transition-colors truncate max-w-[200px]"
                title={`Subject: ${src.subject}\nFrom: ${src.sender || 'Unknown'}`}
              >
                <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="truncate">{src.subject || 'Email'}</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-60 shrink-0" />
              </a>
            ))}
          </div>
        )}

        {/* Suggested Follow-up chips */}
        {message.suggestedFollowUps && message.suggestedFollowUps.length > 0 && onSelectFollowUp && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {message.suggestedFollowUps.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => onSelectFollowUp(prompt)}
                className="text-[11px] font-medium px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80 rounded-full hover:bg-emerald-100 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
