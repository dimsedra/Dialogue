import ReactMarkdown from "react-markdown";

export interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className = "" }: MarkdownContentProps) {
  return (
    <div className={`text-sm leading-relaxed text-[#f3f4f6] ${className}`}>
      <ReactMarkdown
        components={{
          p: ({ children }) => (
            <p className="mb-2.5 last:mb-0 leading-relaxed text-[#f3f4f6]">
              {children}
            </p>
          ),
          h1: ({ children }) => (
            <h1 className="text-base font-semibold text-[#f3f4f6] mt-3.5 mb-2 first:mt-0 tracking-tight">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm font-semibold text-[#f3f4f6] mt-3 mb-1.5 first:mt-0 tracking-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[13px] font-semibold text-[#f3f4f6] mt-2 mb-1 first:mt-0">
              {children}
            </h3>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 mb-2.5 space-y-1 text-[#f3f4f6]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 mb-2.5 space-y-1 text-[#f3f4f6]">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[#3b82f6] pl-3 my-2 text-[#8b8f98] italic">
              {children}
            </blockquote>
          ),
          code: ({ className: codeClassName, children }) => {
            const isCodeBlock = Boolean(codeClassName);
            if (!isCodeBlock) {
              return (
                <code className="bg-[#1c1e24] text-[#93c5fd] px-1.5 py-0.5 rounded font-mono text-[12px] border border-[#22242a]">
                  {children}
                </code>
              );
            }
            return (
              <pre className="bg-[#131417] border border-[#22242a] rounded-lg p-3 my-2.5 overflow-x-auto text-[13px] font-mono text-[#f3f4f6] leading-normal">
                <code>{children}</code>
              </pre>
            );
          },
          hr: () => <hr className="border-[#22242a] my-3" />,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-[#3b82f6] hover:underline"
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
