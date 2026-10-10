import { useState, useEffect } from 'react'

interface DNSConnectivityState {
  isSupabaseReachable: boolean
  isChecking: boolean
  dnsError: boolean
  lastChecked: Date | null
}

export const useDNSConnectivity = () => {
  const [state, setState] = useState<DNSConnectivityState>({
    isSupabaseReachable: true,
    isChecking: false,
    dnsError: false,
    lastChecked: null
  })

  const checkSupabaseConnectivity = async () => {
    setState(prev => ({ ...prev, isChecking: true }))
    
    try {
      // Test basic connectivity to Supabase with more forgiving approach
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000) // Longer timeout
      
      const response = await fetch('https://gvftdfriujrkpptdueyb.supabase.co/rest/v1/', {
        method: 'HEAD',
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit'
      })
      
      clearTimeout(timeoutId)
      
      setState({
        isSupabaseReachable: response.ok || response.status === 401 || response.status === 403, // More status codes accepted
        isChecking: false,
        dnsError: false,
        lastChecked: new Date()
      })
    } catch (error) {
      console.warn('Supabase connectivity check failed:', error)
      
      // Be more conservative about showing DNS errors
      // Only show if it's clearly a network/DNS issue, not CORS or other errors
      const isDNSError = error instanceof TypeError && 
        error.name === 'TypeError' &&
        (error.message.includes('ERR_NAME_NOT_RESOLVED') ||
         error.message.includes('ERR_INTERNET_DISCONNECTED') ||
         error.message.includes('getaddrinfo ENOTFOUND'))
      
      // For CORS errors or "Failed to fetch" in development, don't show DNS error
      const isCORSOrDevError = error instanceof TypeError &&
        (error.message.includes('Failed to fetch') || error.message.includes('CORS'))
      
      setState({
        isSupabaseReachable: isCORSOrDevError ? true : false, // Assume reachable if it's just CORS
        isChecking: false,
        dnsError: isDNSError && !isCORSOrDevError,
        lastChecked: new Date()
      })
    }
  }

  useEffect(() => {
    // Check connectivity on mount
    checkSupabaseConnectivity()
  }, [])

  return {
    ...state,
    recheckConnectivity: checkSupabaseConnectivity
  }
}