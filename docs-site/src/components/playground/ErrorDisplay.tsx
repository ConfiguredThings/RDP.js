import React from 'react'

interface Props {
  message: string
}

export function ErrorDisplay({ message }: Props) {
  return (
    <div className="error-display" role="alert">
      {message}
    </div>
  )
}
