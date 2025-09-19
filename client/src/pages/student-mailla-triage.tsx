import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Bot, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MaillaTriageChat from "@/components/maintenance/mailla-triage-chat";
import { useAuth } from "@/hooks/useAuth";

export default function StudentMaillaTriagePage() {
  const [triageCompleted, setTriageCompleted] = useState(false);
  const [caseId, setCaseId] = useState<string>("");
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // ✅ Use real authentication context - server validates these
  const studentId = user?.id || "anonymous-" + Date.now();
  const orgId = "mit-housing"; // Server-side validation ensures proper org access

  const handleTriageComplete = (completedCaseId: string) => {
    setTriageCompleted(true);
    setCaseId(completedCaseId);
  };

  if (triageCompleted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-6">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <GraduationCap className="h-8 w-8 text-blue-600" />
              <h1 className="text-3xl font-bold text-gray-900">MIT Housing Maintenance</h1>
            </div>
            <p className="text-gray-600">Powered by Mailla AI</p>
          </div>

          {/* Completion Card */}
          <Card className="border-green-200 bg-green-50">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <Bot className="h-8 w-8 text-green-600" />
              </div>
              <CardTitle className="text-green-800">Triage Complete!</CardTitle>
              <CardDescription className="text-green-700">
                Your maintenance request has been processed and submitted.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                Case #{caseId}
              </Badge>
              
              <div className="space-y-2 text-sm text-green-700">
                <p>✅ Safety assessment completed</p>
                <p>✅ Issue details collected</p>
                <p>✅ Maintenance case created</p>
                <p>✅ Maintenance team notified</p>
              </div>

              <div className="pt-4 space-y-3">
                <p className="text-sm text-gray-600">
                  The maintenance team will review your request and contact you about next steps.
                  You can track the progress of your case using the ID above.
                </p>
                
                <div className="flex gap-2 justify-center">
                  <Button 
                    variant="outline" 
                    onClick={() => setLocation("/student-mailla-triage")}
                    data-testid="button-new-request"
                  >
                    Submit Another Request
                  </Button>
                  <Button
                    onClick={() => setLocation("/student-tracking")}
                    data-testid="button-track-requests"
                  >
                    Track My Requests
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <GraduationCap className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">MIT Housing Maintenance</h1>
          </div>
          <p className="text-gray-600 mb-4">Get help with maintenance issues using our AI-powered triage system</p>
          
          {/* Feature badges */}
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
              <Bot className="h-3 w-3 mr-1" />
              AI-Powered Triage
            </Badge>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              Safety-First Assessment
            </Badge>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              Smart Question Flow
            </Badge>
            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
              Immediate Safety Alerts
            </Badge>
          </div>
        </div>

        {/* Main Triage Interface */}
        <div className="max-w-3xl mx-auto">
          <MaillaTriageChat
            studentId={studentId}
            orgId={orgId}
            onTriageComplete={handleTriageComplete}
          />
          
          {/* Help Text */}
          <Card className="mt-6 bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <h3 className="font-medium text-blue-900 mb-2">How Mailla helps you:</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• <strong>Safety First:</strong> Immediate alerts for gas leaks, electrical issues, and other dangers</li>
                <li>• <strong>Smart Questions:</strong> Asks follow-up questions to understand your issue better</li>
                <li>• <strong>Quick Fixes:</strong> Suggests DIY solutions when safe and appropriate</li>
                <li>• <strong>Rich Context:</strong> Collects all details needed for maintenance teams</li>
                <li>• <strong>Urgency Assessment:</strong> Prioritizes your request based on severity</li>
              </ul>
            </CardContent>
          </Card>

          {/* Emergency Notice */}
          <Card className="mt-4 bg-red-50 border-red-200">
            <CardContent className="pt-6">
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-red-600 text-sm font-bold">!</span>
                </div>
                <div>
                  <h3 className="font-medium text-red-900 mb-1">Emergency Situations</h3>
                  <p className="text-sm text-red-700">
                    For life-threatening emergencies, gas leaks, electrical fires, or major water damage, 
                    call Campus Police immediately at <strong>(617) 253-1212</strong> before using this system.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}