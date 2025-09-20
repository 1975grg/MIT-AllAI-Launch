import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { isUnauthorizedError } from "@/lib/authUtils";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Building, DollarSign, AlertTriangle, Bell, Check, Clock, X, Receipt, Users, Wrench, Bot } from "lucide-react";
import type { SmartCase, Reminder } from "@shared/schema";
import PropertyAssistant from "@/components/ai/property-assistant";

type DashboardStats = {
  totalProperties: number; // Housing facilities
  monthlyRevenue: number; // Housing revenue
  openCases: number; // Maintenance requests
  dueReminders: number; // System alerts
};

type HousingPaymentStatus = {
  collected: number;
  total: number;
  percentage: number;
  items: Array<{
    id: string;
    property: string; // Housing facility
    tenant: string; // Student
    amount: number;
    status: "paid" | "due" | "overdue";
    dueDate: Date;
  }>;
};

export default function Dashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    retry: false,
  });

  const { data: housingPayments, isLoading: paymentsLoading } = useQuery<HousingPaymentStatus>({
    queryKey: ["/api/dashboard/rent-collection"],
    retry: false,
  });

  const { data: smartCases, isLoading: casesLoading } = useQuery<SmartCase[]>({
    queryKey: ["/api/cases"],
    retry: false,
  });

  const { data: reminders, isLoading: remindersLoading } = useQuery<Reminder[]>({
    queryKey: ["/api/reminders"],
    retry: false,
  });

  if (isLoading || !isAuthenticated) {
    return null;
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "paid": return <Check className="h-4 w-4 text-green-600" />;
      case "due": return <Clock className="h-4 w-4 text-yellow-600" />;
      case "overdue": return <X className="h-4 w-4 text-orange-600" />;
      default: return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "New": return <Badge className="bg-blue-100 text-blue-800" data-testid={`badge-status-new`}>New</Badge>;
      case "In Progress": return <Badge className="bg-yellow-100 text-yellow-800" data-testid={`badge-status-progress`}>In Progress</Badge>;
      case "Resolved": return <Badge className="bg-green-100 text-green-800" data-testid={`badge-status-resolved`}>Resolved</Badge>;
      default: return <Badge variant="secondary" data-testid={`badge-status-default`}>{status}</Badge>;
    }
  };

  const getPriorityColor = (type: string) => {
    switch (type) {
      case "rent": return "bg-gray-400";
      case "housing": return "bg-yellow-500";
      case "maintenance": return "bg-blue-500";
      default: return "bg-green-500";
    }
  };

  return (
    <div className="flex h-screen bg-background" data-testid="page-dashboard">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Dashboard" />
        
        <main className="flex-1 overflow-auto p-6 bg-muted/30">
          {/* Overview Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card data-testid="card-total-properties">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">MIT Residences</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-total-properties">
                      {statsLoading ? "..." : stats?.totalProperties || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Building className="text-gray-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card data-testid="card-monthly-revenue">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Housing Revenue</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-monthly-revenue">
                      {statsLoading ? "..." : `$${stats?.monthlyRevenue?.toLocaleString() || 0}`}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card data-testid="card-open-cases">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Maintenance Requests</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-open-cases">
                      {statsLoading ? "..." : stats?.openCases || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="text-yellow-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card data-testid="card-due-reminders">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Due Reminders</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-due-reminders">
                      {statsLoading ? "..." : stats?.dueReminders || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Bell className="text-gray-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* AI Housing Assistant */}
          <PropertyAssistant 
            context="dashboard"
            exampleQuestions={[
              "How are our housing facilities performing this semester?",
              "What maintenance requests need immediate attention?", 
              "Any urgent issues in our residence halls?",
              "Which housing facility has the highest student satisfaction?"
            ]}
          />

          {/* Main Dashboard Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column - Large widgets */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Rent Collection Status */}
              <Card data-testid="card-rent-collection">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Housing Payments - {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</CardTitle>
                    <Button variant="ghost" size="sm" data-testid="button-view-all-rent">View All</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {paymentsLoading ? (
                    <div className="space-y-4">
                      <div className="h-4 bg-muted animate-pulse rounded" />
                      <div className="h-2 bg-muted animate-pulse rounded" />
                    </div>
                  ) : housingPayments ? (
                    <>
                      {/* Progress Bar */}
                      <div className="mb-4">
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-muted-foreground" data-testid="text-rent-progress">
                            Collected: ${housingPayments.collected?.toLocaleString()} / ${housingPayments.total?.toLocaleString()}
                          </span>
                          <span className="text-foreground font-medium" data-testid="text-rent-percentage">
                            {housingPayments.percentage}%
                          </span>
                        </div>
                        <Progress value={housingPayments.percentage} className="h-2" data-testid="progress-rent-collection" />
                      </div>
                      
                      {/* Rent Status Items */}
                      <div className="space-y-3">
                        {housingPayments.items?.slice(0, 3).map((item: any, index: number) => (
                          <div key={item.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-md" data-testid={`rent-item-${index}`}>
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center">
                                {getStatusIcon(item.status)}
                              </div>
                              <div>
                                <p className="font-medium text-foreground" data-testid={`text-residence-${index}`}>{item.property}</p>
                                <p className="text-sm text-muted-foreground" data-testid={`text-student-${index}`}>{item.tenant}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-medium text-foreground" data-testid={`text-amount-${index}`}>${item.amount?.toLocaleString()}</p>
                              <p className={`text-sm ${
                                item.status === 'paid' ? 'text-green-600' : 
                                item.status === 'overdue' ? 'text-orange-600' : 'text-yellow-600'
                              }`} data-testid={`text-status-${index}`}>
                                {item.status === 'paid' ? `Paid ${item.dueDate ? new Date(item.dueDate).toLocaleDateString() : ''}` :
                                 item.status === 'overdue' ? 'Overdue' : `Due ${item.dueDate ? new Date(item.dueDate).toLocaleDateString() : ''}`}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground">No housing payment data available</p>
                  )}
                </CardContent>
              </Card>

              {/* AI Maintenance Triage */}
              <Card data-testid="card-smart-cases">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>AI Maintenance Triage</CardTitle>
                    <Button variant="ghost" size="sm" data-testid="button-manage-all-cases">Manage All</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {casesLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-16 bg-muted animate-pulse rounded-md" />
                      ))}
                    </div>
                  ) : (smartCases && smartCases.length > 0) ? (
                    <div className="space-y-3">
                      {smartCases.slice(0, 3).map((smartCase, index) => (
                        <div key={smartCase.id} className="flex items-center justify-between p-4 border border-border rounded-md" data-testid={`case-item-${index}`}>
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                              <AlertTriangle className="h-5 w-5 text-yellow-600" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground" data-testid={`text-case-title-${index}`}>{smartCase.title}</p>
                              <p className="text-sm text-muted-foreground" data-testid={`text-case-residence-${index}`}>
                                {smartCase.propertyId ? "Residence" : "General"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3">
                            {getStatusBadge(smartCase.status || "New")}
                            <span className="text-sm text-muted-foreground" data-testid={`text-case-date-${index}`}>
                              {smartCase.createdAt ? new Date(smartCase.createdAt).toLocaleDateString() : 'Unknown'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No active maintenance requests</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Sidebar widgets */}
            <div className="space-y-6">
              
              {/* System Alerts & Scheduling */}
              <Card data-testid="card-upcoming-reminders">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>System Alerts & Scheduling</CardTitle>
                    <Button variant="ghost" size="sm" data-testid="button-view-all-reminders">View All</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {remindersLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />
                      ))}
                    </div>
                  ) : (reminders && reminders.length > 0) ? (
                    <div className="space-y-3">
                      {reminders.slice(0, 4).map((reminder, index) => (
                        <div key={reminder.id} className="flex items-start space-x-3 p-3 bg-muted/50 rounded-md" data-testid={`reminder-item-${index}`}>
                          <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${getPriorityColor(reminder.type || '')}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground" data-testid={`text-reminder-title-${index}`}>{reminder.title}</p>
                            <p className="text-xs text-muted-foreground" data-testid={`text-reminder-date-${index}`}>
                              Due {new Date(reminder.dueAt).toLocaleDateString()}
                            </p>
                            <p className="text-xs text-muted-foreground" data-testid={`text-reminder-type-${index}`}>
                              {reminder.type}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No upcoming reminders</p>
                  )}
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card data-testid="card-quick-actions">
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Mailla AI Assistant - Centered at top */}
                    <Button
                      variant="ghost"
                      className="col-span-2 h-20 flex flex-col items-center justify-center space-y-2 border border-purple-200 bg-purple-50/50 hover:bg-purple-100/50 dark:border-purple-800 dark:bg-purple-900/20 dark:hover:bg-purple-900/30"
                      onClick={() => {
                        const maillaElement = document.getElementById('mailla-assistant');
                        if (maillaElement) {
                          maillaElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }}
                      aria-label="Focus on Mailla AI Assistant"
                      data-testid="button-mailla-assistant"
                    >
                      <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
                        <Bot className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Mailla AI Assistant</span>
                    </Button>

                    <Button
                      variant="ghost"
                      className="h-20 flex flex-col items-center justify-center space-y-2 border border-border hover:bg-gray-50 dark:hover:bg-gray-800 bg-white dark:bg-card transition-colors"
                      onClick={() => setLocation('/properties')}
                      data-testid="button-add-residence"
                    >
                      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                        <Building className="h-5 w-5 text-gray-600" />
                      </div>
                      <span className="text-sm font-medium text-foreground">Residence</span>
                    </Button>

                    <Button
                      variant="ghost"
                      className="h-20 flex flex-col items-center justify-center space-y-2 border border-border hover:bg-gray-50 dark:hover:bg-gray-800 bg-white dark:bg-card transition-colors"
                      onClick={() => setLocation('/tenants')}
                      data-testid="button-add-student"
                    >
                      <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                        <Users className="h-5 w-5 text-green-600" />
                      </div>
                      <span className="text-sm font-medium text-foreground">Student</span>
                    </Button>

                    <Button
                      variant="ghost"
                      className="h-20 flex flex-col items-center justify-center space-y-2 border border-border hover:bg-gray-50 dark:hover:bg-gray-800 bg-white dark:bg-card transition-colors"
                      onClick={() => setLocation('/maintenance')}
                      data-testid="button-create-maintenance"
                    >
                      <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                        <Wrench className="h-5 w-5 text-orange-600" />
                      </div>
                      <span className="text-sm font-medium text-foreground">Maintenance</span>
                    </Button>

                    <Button
                      variant="ghost"
                      className="h-20 flex flex-col items-center justify-center space-y-2 border border-border hover:bg-gray-50 dark:hover:bg-gray-800 bg-white dark:bg-card transition-colors"
                      onClick={() => setLocation('/expenses')}
                      data-testid="button-log-expense"
                    >
                      <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                        <Receipt className="h-5 w-5 text-yellow-600" />
                      </div>
                      <span className="text-sm font-medium text-foreground">Expense</span>
                    </Button>

                    <Button
                      variant="ghost"
                      className="h-20 flex flex-col items-center justify-center space-y-2 border border-border hover:bg-gray-50 dark:hover:bg-gray-800 bg-white dark:bg-card transition-colors"
                      onClick={() => setLocation('/revenue')}
                      data-testid="button-log-revenue"
                    >
                      <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                        <DollarSign className="h-5 w-5 text-green-600" />
                      </div>
                      <span className="text-sm font-medium text-foreground">Revenue</span>
                    </Button>

                    <Button
                      variant="ghost"
                      className="h-20 flex flex-col items-center justify-center space-y-2 border border-border hover:bg-gray-50 dark:hover:bg-gray-800 bg-white dark:bg-card transition-colors"
                      onClick={() => setLocation('/reminders')}
                      data-testid="button-set-reminder"
                    >
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Bell className="h-5 w-5 text-blue-600" />
                      </div>
                      <span className="text-sm font-medium text-foreground">Reminder</span>
                    </Button>

                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
