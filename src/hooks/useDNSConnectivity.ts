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
      // Test basic connectivity to Supabase
      const response = await fetch('https://gvftdfriujrkpptdueyb.supabase.co/rest/v1/', {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      })
      
      setState({
        isSupabaseReachable: response.ok || response.status === 401, // 401 is expected without auth
        isChecking: false,
        dnsError: false,
        lastChecked: new Date()
      })
    } catch (error) {
      console.warn('Supabase connectivity check failed:', error)
      
      // Check if it's a DNS-related error
      const isDNSError = error instanceof TypeError && 
        (error.message.includes('Failed to fetch') || 
         error.message.includes('NetworkError') ||
         error.message.includes('ERR_NAME_NOT_RESOLVED'))
      
      setState({
        isSupabaseReachable: false,
        isChecking: false,
        dnsError: isDNSError,
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