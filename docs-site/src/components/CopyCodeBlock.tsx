import React, { useRef, useState } from 'react'

type Props = React.HTMLAttributes<HTMLPreElement>

export function CopyCodeBlock({ children, ...props }: Props) {
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const text = preRef.current?.textContent ?? ''
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="code-block-wrapper">
      <pre ref={preRef} {...props}>
        {children}
      </pre>
      <button
        className={`code-copy-btn${copied ? ' code-copy-btn--copied' : ''}`}
        onClick={handleCopy}
        aria-label="Copy code"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  )
}
