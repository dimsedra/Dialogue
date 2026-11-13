import ReactMarkdown from "react-markdown";
import { cn } from "../../core/cn";

export interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={cn("text-[15.5px] leading-[1.7] text-ink", className)}>
      <ReactMarkdown
        components={{
          p: ({ children }) => (
            <p className="mb-2.5 last:mb-0 leading-[1.7] text-ink">{children}</p>
          ),
          h1: ({ children }) => (
            <h1 className="mt-4 mb-2 first:mt-0 font-display text-[20px] font-medium tracking-tight text-ink">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-3.5 mb-1.5 first:mt-0 text-[16px] font-semibold tracking-tight text-ink">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-2.5 mb-1 first:mt-0 text-[14.5px] font-semibold text-ink">
              {children}
            </h3>
          ),
          ul: ({ children }) => (
            <ul className="mb-2.5 list-disc space-y-1 pl-5 text-ink">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2.5 list-decimal space-y-1 pl-5 text-ink">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-[1.7]">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-2.5 border-l-2 border-calendar pl-3.5 text-ink-2 italic">
              {children}
            </blockquote>
          ),
          code: ({ className: codeClassName, children }) => {
            const isCodeBlock = Boolean(codeClassName);
            if (!isCodeBlock) {
              return (
                <code className="rounded-md border border-line bg-sunken px-1.5 py-0.5 font-mono text-[12.5px] text-calendar-fg">
                  {children}
                </code>
              );
            }
            return (
              <pre className="my-3 overflow-x-auto rounded-xl border border-line bg-surface p-3.5 font-mono text-[13px] leading-normal text-ink">
                <code>{children}</code>
              </pre>
            );
          },
          hr: () => <hr className="my-3.5 border-line" />,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-calendar-fg underline decoration-calendar/40 underline-offset-2 hover:decoration-calendar"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-white">{children}</strong>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
