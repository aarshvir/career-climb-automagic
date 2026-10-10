import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { isInIframe, getEnvironmentType } from '@/utils/authUtils';

export const AuthStatusIndicator = () => {
  const { user, loading, dnsError } = useAuth();
  
  const environment = getEnvironmentType();
  const inIframe = isInIframe();

  if (loading) {
    return (
      <Badge variant="secondary" className="gap-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking authentication...
      </Badge>
    );
  }

  if (dnsError) {
    return (
      <Badge variant="destructive" className="gap-2">
        <XCircle className="h-3 w-3" />
        Connection issue
      </Badge>
    );
  }

  if (user) {
    return (
      <Badge variant="default" className="gap-2">
        <CheckCircle className="h-3 w-3" />
        Signed in
      </Badge>
    );
  }


  return (
    <Badge variant="outline" className="gap-2">
      <XCircle className="h-3 w-3" />
      Not signed in
    </Badge>
  );
};