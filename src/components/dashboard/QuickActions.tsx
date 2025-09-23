import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, 
  FileText, 
  Settings, 
  Target, 
  Zap, 
  Star,
  Plus,
  BookOpen,
  MessageSquare,
  Calendar
} from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickActionsProps {
  userPlan: string;
}

export const QuickActions = ({ userPlan }: QuickActionsProps) => {
  const actions = [
    {
      title: "Upload Resume",
      description: "Add new resume variant",
      icon: Upload,
      color: "bg-primary/10 text-primary",
      urgent: false,
    },
    {
      title: "Job Preferences",
      description: "Update search criteria",
      icon: Target,
      color: "bg-success/10 text-success",
      urgent: false,
    },
    {
      title: "AI Resume Review",
      description: "Get optimization tips",
      icon: Zap,
      color: "bg-warning/10 text-warning",
      urgent: true,
      locked: userPlan === 'free',
    },
    {
      title: "Interview Prep",
      description: "Practice common questions",
      icon: MessageSquare,
      color: "bg-info/10 text-info",
      urgent: false,
      locked: userPlan === 'free',
    },
    {
      title: "Schedule Review",
      description: "Plan your job search",
      icon: Calendar,
      color: "bg-accent/10 text-accent-foreground",
      urgent: false,
    },
  ];

  return (
    <Card className="premium-card border-0 bg-gradient-to-br from-card/90 to-card/60 backdrop-blur-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-primary shadow-lg shadow-primary/20">
            <Star className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-lg font-bold text-foreground">
              Quick Actions
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Streamline your job search
            </p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {actions.map((action, index) => (
          <Button
            key={action.title}
            variant="ghost"
            className={cn(
              "w-full justify-start p-4 h-auto hover-lift transition-all duration-300",
              "hover:bg-accent/50 relative",
              action.locked && "opacity-60"
            )}
            disabled={action.locked}
          >
            <div className="flex items-center gap-3 w-full">
              <div className={cn(
                "p-2 rounded-lg transition-colors",
                action.color,
                action.locked && "opacity-50"
              )}>
                <action.icon className="h-4 w-4" />
              </div>
              
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{action.title}</span>
                  {action.urgent && (
                    <Badge variant="destructive" className="text-xs px-1.5 py-0.5">
                      New
                    </Badge>
                  )}
                  {action.locked && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                      Pro
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {action.description}
                </p>
              </div>
              
              {action.locked ? (
                <div className="text-xs text-muted-foreground">
                  Locked
                </div>
              ) : (
                <Plus className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
          </Button>
        ))}
        
        {userPlan === 'free' && (
          <div className="mt-4 p-3 rounded-lg bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20">
            <div className="text-center space-y-2">
              <p className="text-xs font-medium text-foreground">
                Unlock all quick actions
              </p>
              <Button size="sm" className="bg-gradient-primary hover:opacity-90">
                <Zap className="h-3 w-3 mr-1" />
                Upgrade Now
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};