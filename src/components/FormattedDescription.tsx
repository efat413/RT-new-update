import React from 'react';

interface FormattedDescriptionProps {
  content: string;
  className?: string;
}

export const FormattedDescription: React.FC<FormattedDescriptionProps> = ({
  content,
  className = '',
}) => {
  if (!content) return null;

  // Split lines
  const lines = content.split('\n');

  const renderInlineFormatting = (text: string) => {
    // Replace **bold** with bold spans
    const parts = text.split(/(\*\*.*?\*\*|<b>.*?<\/b>)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-extrabold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('<b>') && part.endsWith('</b>')) {
        return (
          <strong key={i} className="font-extrabold text-slate-900">
            {part.slice(3, -4)}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div className={`space-y-1.5 text-xs sm:text-sm text-slate-600 leading-relaxed ${className}`}>
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) {
          return <div key={idx} className="h-1.5" />;
        }

        // Check for bullet list: • or - or *
        if (/^[•\-\*]\s+/.test(line)) {
          const bulletText = line.replace(/^[•\-\*]\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="text-rose-500 font-bold shrink-0 mt-0.5">•</span>
              <span className="flex-1">{renderInlineFormatting(bulletText)}</span>
            </div>
          );
        }

        // Check for numbered list: 1. or 2)
        const numberMatch = line.match(/^(\d+[\.\)])\s+(.*)/);
        if (numberMatch) {
          const numPrefix = numberMatch[1];
          const numText = numberMatch[2];
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="text-slate-800 font-bold font-mono text-[11px] sm:text-xs shrink-0 mt-0.5 bg-slate-100 px-1.5 py-0.2 rounded">
                {numPrefix}
              </span>
              <span className="flex-1">{renderInlineFormatting(numText)}</span>
            </div>
          );
        }

        // Check for symbol prefix e.g. ✓ or ★ or ⚡ or ➤ or ▸ or ৳
        const symbolMatch = line.match(/^([✓✔★⚡➤▸৳🔥📦🛡️📏])\s+(.*)/);
        if (symbolMatch) {
          const sym = symbolMatch[1];
          const symText = symbolMatch[2];
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="text-amber-600 font-bold shrink-0 mt-0.5">{sym}</span>
              <span className="flex-1">{renderInlineFormatting(symText)}</span>
            </div>
          );
        }

        return (
          <p key={idx} className="leading-relaxed">
            {renderInlineFormatting(rawLine)}
          </p>
        );
      })}
    </div>
  );
};
