import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePlan } from '@/contexts/PlanContext';
import { planManager } from '@/utils/planManager';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';

export const PlanPersistenceTest: React.FC = () => {
  const { user } = useAuth();
  const { profile, loading } = usePlan();
  const [testResults, setTestResults] = useState<{
    databaseCheck: 'pending' | 'success' | 'error';
    cacheCheck: 'pending' | 'success' | 'error';
    localStorageCheck: 'pending' | 'success' | 'error';
    contextCheck: 'pending' | 'success' | 'error';
  }>({
    databaseCheck: 'pending',
    cacheCheck: 'pending',
    localStorageCheck: 'pending',
    contextCheck: 'pending',
  });

  const runTests = async () => {
    if (!user) return;

    setTestResults({
      databaseCheck: 'pending',
      cacheCheck: 'pending',
      localStorageCheck: 'pending',
      contextCheck: 'pending',
    });

    try {
      // Test 1: Database Check
      try {
        const planData = await planManager.fetchPlan(user.id);
        setTestResults(prev => ({ ...prev, databaseCheck: 'success' }));
      } catch (error) {
        console.error('Database test failed:', error);
        setTestResults(prev => ({ ...prev, databaseCheck: 'error' }));
      }

      // Test 2: Cache Check
      try {
        const cachedPlan = planManager.loadPlan(user.id);
        setTestResults(prev => ({ 
          ...prev, 
          cacheCheck: cachedPlan ? 'success' : 'error' 
        }));
      } catch (error) {
        console.error('Cache test failed:', error);
        setTestResults(prev => ({ ...prev, cacheCheck: 'error' }));
      }

      // Test 3: LocalStorage Check
      try {
        const stored = localStorage.getItem(`plan_${user.id}`);
        setTestResults(prev => ({ 
          ...prev, 
          localStorageCheck: stored ? 'success' : 'error' 
        }));
      } catch (error) {
        console.error('LocalStorage test failed:', error);
        setTestResults(prev => ({ ...prev, localStorageCheck: 'error' }));
      }

      // Test 4: Context Check
      setTestResults(prev => ({ 
        ...prev, 
        contextCheck: profile ? 'success' : 'error' 
      }));

    } catch (error) {
      console.error('Test suite failed:', error);
    }
  };

  useEffect(() => {
    if (user) {
      runTests();
    }
  }, [user, profile]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'error':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    }
  };

  if (!user) {
    return null;
  }

  return (
    <Card className="border border-blue-200 bg-blue-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-800">
          <RefreshCw className="h-5 w-5" />
          Plan Persistence Test
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className={`p-3 rounded-lg border ${getStatusColor(testResults.databaseCheck)}`}>
            <div className="flex items-center gap-2">
              {getStatusIcon(testResults.databaseCheck)}
              <span className="font-medium">Database</span>
            </div>
          </div>
          
          <div className={`p-3 rounded-lg border ${getStatusColor(testResults.cacheCheck)}`}>
            <div className="flex items-center gap-2">
              {getStatusIcon(testResults.cacheCheck)}
              <span className="font-medium">Cache</span>
            </div>
          </div>
          
          <div className={`p-3 rounded-lg border ${getStatusColor(testResults.localStorageCheck)}`}>
            <div className="flex items-center gap-2">
              {getStatusIcon(testResults.localStorageCheck)}
              <span className="font-medium">LocalStorage</span>
            </div>
          </div>
          
          <div className={`p-3 rounded-lg border ${getStatusColor(testResults.contextCheck)}`}>
            <div className="flex items-center gap-2">
              {getStatusIcon(testResults.contextCheck)}
              <span className="font-medium">Context</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Current Plan:</span>
            <Badge variant="outline" className="text-xs">
              {profile?.plan || 'Unknown'}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Loading:</span>
            <Badge variant={loading ? 'default' : 'secondary'} className="text-xs">
              {loading ? 'Yes' : 'No'}
            </Badge>
          </div>
        </div>

        <Button 
          onClick={runTests} 
          size="sm" 
          className="w-full"
          disabled={loading}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Run Tests
        </Button>
      </CardContent>
    </Card>
  );
};
