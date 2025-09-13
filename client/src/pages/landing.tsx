import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building, Users, Wrench, Receipt, Bell, Shield } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Building className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">AllAI Property</span>
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
            Simplified Property Management
            <span className="block text-primary">For Part-Time Landlords</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Never miss another important task. Track properties, manage tenants, monitor maintenance, 
            and get AI-powered insights with our intuitive property management platform.
          </p>
          <Button size="lg" asChild className="text-lg px-8 py-3" data-testid="button-get-started">
            <a href="/api/login">Get Started Free</a>
          </Button>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container mx-auto">
          <h2 className="text-2xl font-bold text-center text-foreground mb-12">
            <span className="text-primary">Unlock</span> the power of <span className="text-primary">your AI assistant</span> — and free up your time.
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Building className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Property Tracking</CardTitle>
                <CardDescription>
                  Organize all your properties with detailed information, ownership tracking, and unit management.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
                <CardTitle>Tenant Management</CardTitle>
                <CardDescription>
                  Keep track of tenant information, lease agreements, and rent collection status.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-4">
                  <Wrench className="h-6 w-6 text-yellow-600" />
                </div>
                <CardTitle>Smart Maintenance</CardTitle>
                <CardDescription>
                  Track maintenance requests, schedule repairs, and manage vendor relationships efficiently.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <Receipt className="h-6 w-6 text-blue-600" />
                </div>
                <CardTitle>Expense Tracking</CardTitle>
                <CardDescription>
                  Log expenses, categorize costs, and generate reports for tax preparation.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                  <Bell className="h-6 w-6 text-red-600" />
                </div>
                <CardTitle>Smart Reminders</CardTitle>
                <CardDescription>
                  Never miss rent collection, lease renewals, maintenance schedules, or tax deadlines.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-purple-600" />
                </div>
                <CardTitle>Secure & Reliable</CardTitle>
                <CardDescription>
                  Your data is protected with enterprise-grade security and automatic backups.
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
            Ready to Simplify Your Property Management?
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join thousands of part-time landlords who trust AllAI Property to keep them organized and profitable.
          </p>
          <Button size="lg" asChild className="text-lg px-8 py-3" data-testid="button-start-now">
            <a href="/api/login">Start Managing Today</a>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4">
        <div className="container mx-auto text-center text-muted-foreground">
          <p>&copy; 2024 AllAI Property. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
