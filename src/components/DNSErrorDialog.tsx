import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { ExternalLink, RefreshCw, AlertTriangle } from "lucide-react"

interface DNSErrorDialogProps {
  open: boolean
  onClose: () => void
  onRetry: () => void
  isRetrying: boolean
}

const DNSErrorDialog = ({ open, onClose, onRetry, isRetrying }: DNSErrorDialogProps) => {
  return (
    <AlertDialog open={open} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Authentication Issue Detected
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              We're having trouble with the sign-in process. This might be due to:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Popup blocking by your browser</li>
              <li>Iframe restrictions in preview mode</li>
              <li>DNS resolution issues</li>
              <li>Network connectivity problems</li>
              <li>Browser security settings</li>
            </ul>
            <p className="text-sm font-medium">
              Try allowing popups for this site, or switch to a public DNS like Google (8.8.8.8) if the issue persists.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => window.open('https://developers.cloudflare.com/1.1.1.1/setup/', '_blank')}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            DNS Setup Guide
          </Button>
          <Button 
            onClick={onRetry} 
            disabled={isRetrying}
            className="min-w-24"
          >
            {isRetrying ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              'Try Again'
            )}
          </Button>
          <AlertDialogAction>Continue Anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default DNSErrorDialog