import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CVManager } from '@/components/dashboard/CVManager';
import { usePlan } from '@/contexts/PlanContext';
import { useAuth } from '@/contexts/AuthContext';
import { FileText, Upload, Plus } from 'lucide-react';
import SEOHead from '@/components/SEOHead';

const ResumeManagement: React.FC = () => {
  const { user } = useAuth();
  const { profile } = usePlan();

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">Please sign in to manage your resumes.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <SEOHead 
        title="Resume Management - JobVance"
        description="Upload, manage, and organize your resumes for job applications"
        canonicalPath="/resume-management"
      />
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Resume Management</h1>
                <p className="text-gray-600">Upload, manage, and organize your resumes</p>
              </div>
            </div>
          </div>

          {/* Resume Management Card */}
          <Card className="border-0 shadow-sm bg-white">
            <CardHeader className="border-b border-gray-200">
              <CardTitle className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Your Resumes
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                Upload and manage your resume files. Create different versions for different job types.
              </p>
            </CardHeader>
            <CardContent className="p-6">
              <CVManager userPlan={profile?.plan || 'free'} />
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Upload className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Resume</h3>
                <p className="text-gray-600 text-sm">Upload a new resume file in PDF, DOC, or DOCX format</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Plus className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Create Variant</h3>
                <p className="text-gray-600 text-sm">Create different versions of your resume for different job types</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-white hover:shadow-md transition-shadow">
              <CardContent className="p-6 text-center">
                <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-6 w-6 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Manage Files</h3>
                <p className="text-gray-600 text-sm">View, download, and delete your resume files</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
};

export default ResumeManagement;
