import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Brain, Clock, CheckCircle, Users, Wrench, Bot, FileText } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">MIT Housing Maintenance AI</span>
          </div>
          <Button asChild data-testid="button-login">
            <a href="/api/login">Sign In</a>
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
            AI-Powered Maintenance Automation
            <span className="block text-primary">For University Student Housing</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-12 max-w-3xl mx-auto">
            Revolutionize student housing maintenance with intelligent triage, automated contractor coordination, 
            and seamless request management. Reduce response times and improve student satisfaction.
          </p>
          
          {/* Student Section */}
          <div className="mb-8">
            <div className="flex items-center justify-center mb-4">
              <GraduationCap className="h-6 w-6 text-blue-600 mr-2" />
              <h2 className="text-2xl font-bold text-blue-600">For Students</h2>
            </div>
            <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
              Submit maintenance requests quickly and track their progress. No account required.
            </p>
            
            {/* Primary AI Chat Option */}
            <div className="space-y-4">
              <Button size="lg" asChild className="text-lg px-8 py-3 bg-blue-600 hover:bg-blue-700" data-testid="button-ai-chat">
                <a href="/student-mailla-triage">
                  <Bot className="h-5 w-5 mr-2" />
                  Chat with AI Assistant
                </a>
              </Button>
              
              <p className="text-sm text-muted-foreground">
                Get instant help with our AI-powered triage system
              </p>
              
              {/* Alternative Options */}
              <div className="pt-2 space-y-2">
                <Button size="sm" variant="outline" asChild className="text-sm px-4 py-2" data-testid="button-traditional-form">
                  <a href="/student-request">
                    <FileText className="h-4 w-4 mr-2" />
                    Use Traditional Form Instead
                  </a>
                </Button>
                
                <div className="text-sm text-muted-foreground">
                  Already submitted a request?{" "}
                  <a href="/student-tracking" className="text-blue-600 hover:underline" data-testid="link-track-request">
                    Track your request here
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Separator */}
          <div className="flex items-center justify-center my-8 max-w-md mx-auto">
            <div className="flex-1 border-t border-muted"></div>
            <span className="px-4 text-sm text-muted-foreground">OR</span>
            <div className="flex-1 border-t border-muted"></div>
          </div>

          {/* Admin/Contractor Section */}
          <div>
            <div className="flex items-center justify-center mb-4">
              <Wrench className="h-6 w-6 text-orange-600 mr-2" />
              <h2 className="text-2xl font-bold text-orange-600">For Staff & Contractors</h2>
            </div>
            <p className="text-muted-foreground mb-4 max-w-lg mx-auto">
              Access the management dashboard to view requests, coordinate contractors, and track maintenance operations.
            </p>
            <Button size="lg" variant="outline" asChild className="text-lg px-8 py-3 border-orange-600 text-orange-600 hover:bg-orange-50" data-testid="button-admin-login">
              <a href="/api/login">🔧 Staff & Contractor Login</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto">
          <h2 className="text-2xl font-bold text-center text-foreground mb-12">
            <span className="text-primary">Automate</span> maintenance workflows with <span className="text-primary">intelligent AI triage</span> — and enhance student satisfaction.
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <GraduationCap className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Student Request Intake</CardTitle>
                <CardDescription>
                  Simple, student-friendly maintenance request forms with photo uploads, location tracking, and priority assessment.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <Brain className="h-6 w-6 text-blue-600" />
                </div>
                <CardTitle>AI Smart Triage</CardTitle>
                <CardDescription>
                  Intelligent classification of maintenance requests with automatic severity assessment, safety flags, and routing decisions.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
                <CardTitle>Automated Contractor Coordination</CardTitle>
                <CardDescription>
                  AI agents automatically contact preferred contractors, negotiate availability, and schedule appointments based on SLA requirements.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-4">
                  <Wrench className="h-6 w-6 text-yellow-600" />
                </div>
                <CardTitle>Work Order Management</CardTitle>
                <CardDescription>
                  Digital work orders with completion checklists, before/after photos, and automated student notification workflows.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
                  <Clock className="h-6 w-6 text-orange-600" />
                </div>
                <CardTitle>Real-Time Tracking</CardTitle>
                <CardDescription>
                  Live status updates, SLA monitoring, and proactive escalation for urgent safety issues across all university housing properties.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <CheckCircle className="h-6 w-6 text-purple-600" />
                </div>
                <CardTitle>Quality Assurance</CardTitle>
                <CardDescription>
                  Automated completion verification, student satisfaction surveys, and comprehensive audit trails for housing administration.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl font-bold text-foreground mb-6">
            Ready to Transform Your Housing Maintenance Operations?
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join leading universities using AI to reduce maintenance response times, improve student satisfaction, and optimize housing operations.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild className="text-lg px-8 py-3" data-testid="button-demo-request">
              <a href="/api/login">Request Demo</a>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-lg px-8 py-3" data-testid="button-student-portal">
              <a href="/student-tracking">Track Your Request</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4">
        <div className="container mx-auto text-center text-muted-foreground">
          <p>&copy; 2024 MIT Housing Maintenance AI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
