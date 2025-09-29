import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { JobPreferences as JobPreferencesComponent } from '@/components/dashboard/JobPreferences';
import { usePlan } from '@/contexts/PlanContext';
import { useAuth } from '@/contexts/AuthContext';
import { Briefcase, Settings, Target } from 'lucide-react';
import SEOHead from '@/components/SEOHead';

const JobPreferencesPage: React.FC = () => {
  const { user } = useAuth();
  const { profile } = usePlan();

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">Please sign in to manage your job preferences.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <SEOHead 
        title="Job Preferences - JobVance"
        description="Set your job search preferences and criteria for better job matching"
        canonicalPath="/job-preferences"
      />
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Job Preferences</h1>
                <p className="text-gray-600">Set your job search criteria and preferences</p>
              </div>
            </div>
          </div>

          {/* Job Preferences Card */}
          <Card className="border-0 shadow-sm bg-white">
            <CardHeader className="border-b border-gray-200">
              <CardTitle className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Your Job Search Preferences
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                Configure your job search criteria to get better job matches and recommendations.
              </p>
            </CardHeader>
            <CardContent className="p-6">
              <JobPreferencesComponent userPlan={profile?.plan || 'free'} />
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Target className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Job Titles</h3>
                <p className="text-gray-600 text-sm">Set your preferred job titles and roles</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Briefcase className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Job Types</h3>
                <p className="text-gray-600 text-sm">Choose between full-time, part-time, contract, etc.</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Settings className="h-6 w-6 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Advanced Settings</h3>
                <p className="text-gray-600 text-sm">Configure salary range, location, and other criteria</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
};

export default JobPreferencesPage;
