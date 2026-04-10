import { useEffect, useRef } from 'react'

export function useDebounce<T>(value: T, delay: number, callback: (v: T) => void) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const timer = setTimeout(() => callbackRef.current(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
}
