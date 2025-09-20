import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isInIframe, getEnvironmentType, supportsPopups } from '@/utils/authUtils';

interface AuthDebugPanelProps {
  show?: boolean;
}

export const AuthDebugPanel = ({ show = false }: AuthDebugPanelProps) => {
  const { user, session, loading, dnsError, environment, inIframe } = useAuth();

  if (!show) return null;

  const debugInfo = {
    'User ID': user?.id || 'None',
    'Session': session ? 'Active' : 'None',
    'Loading': loading.toString(),
    'DNS Error': dnsError.toString(),
    'Environment': environment,
    'In Iframe': inIframe.toString(),
    'Supports Popups': supportsPopups().toString(),
    'Hostname': window.location.hostname,
    'Origin': window.location.origin,
    'User Agent': navigator.userAgent.substring(0, 50) + '...',
  };

  return (
    <Card className="fixed bottom-4 right-4 w-80 max-h-96 overflow-auto z-50 bg-background/95 backdrop-blur-sm border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Auth Debug Panel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {Object.entries(debugInfo).map(([key, value]) => (
          <div key={key} className="flex justify-between items-center text-xs">
            <span className="font-medium">{key}:</span>
            <Badge variant="outline" className="text-xs">
              {value}
            </Badge>
          </div>
        ))}
        <Button 
          size="sm" 
          variant="outline" 
          onClick={() => {
            console.log('Full Auth Debug Info:', {
              user,
              session,
              loading,
              dnsError,
              environment,
              inIframe,
              debugInfo,
              timestamp: new Date().toISOString()
            });
          }}
          className="w-full mt-2"
        >
          Log Full Debug Info
        </Button>
      </CardContent>
    </Card>
  );
};