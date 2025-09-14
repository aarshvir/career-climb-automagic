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
import { ExternalLink, RefreshCw } from "lucide-react"

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
            <span className="text-destructive">⚠️</span>
            Connection Issue Detected
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              We're unable to connect to our authentication service. This is likely due to DNS resolution issues with your internet provider.
            </p>
            
            <div className="bg-muted p-3 rounded-md">
              <p className="font-semibold text-sm mb-2">Quick fixes to try:</p>
              <ul className="text-sm space-y-1 list-disc list-inside">
                <li>Switch to a public DNS like Cloudflare (1.1.1.1) or Google (8.8.8.8)</li>
                <li>Try using a different network (mobile hotspot)</li>
                <li>Wait a few minutes and try again</li>
              </ul>
            </div>

            <p className="text-sm text-muted-foreground">
              This is a known issue affecting some internet providers' DNS resolution of certain domains.
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