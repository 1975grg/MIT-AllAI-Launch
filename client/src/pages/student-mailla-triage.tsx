import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Bot, GraduationCap, MapPin, Clock, Upload, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MaillaTriageChat from "@/components/maintenance/mailla-triage-chat";

export default function StudentMaillaTriagePage() {
  const [triageCompleted, setTriageCompleted] = useState(false);
  const [caseId, setCaseId] = useState<string>("");
  const [, setLocation] = useLocation();

  // ✅ Remove useAuth() call to prevent 401 error loops on public route
  // The backend now handles authentication and derives identity from session
  const studentId = "public-student"; // Server will derive real identity from session
  const orgId = "mit-housing"; // Server validates org access

  const handleTriageComplete = (completedCaseId: string) => {
    setTriageCompleted(true);
    setCaseId(completedCaseId);
  };

  if (triageCompleted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 p-6">
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-red-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <GraduationCap className="h-8 w-8 text-red-600" />
            <h1 className="text-3xl font-bold text-gray-900">MIT Housing Maintenance</h1>
          </div>
          <p className="text-gray-600 mb-4">Get help with maintenance issues using our AI-powered triage system</p>
          
          {/* MIT-style description */}
          <div className="max-w-2xl mx-auto mb-6">
            <p className="text-gray-600 text-center">
              Describe your maintenance issue and we'll help prioritize and route it to the right team. 
              For emergencies, call Campus Police at <strong>(617) 253-1212</strong> immediately.
            </p>
          </div>
        </div>

        {/* Main Triage Interface */}
        <div className="max-w-3xl mx-auto">
          <MaillaTriageChat
            studentId={studentId}
            orgId={orgId}
            onTriageComplete={handleTriageComplete}
          />
          
          {/* Compact Info Panel */}
          <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="text-sm text-gray-600 flex flex-wrap gap-4 justify-center">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-red-600" />
                Location & room
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-orange-600" />
                Timeline & severity
              </span>
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-yellow-600" />
                Safety priority
              </span>
              <span className="flex items-center gap-1">
                <Upload className="h-3 w-3 text-blue-600" />
                Photos help
              </span>
            </div>
          </div>

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