import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Building, DollarSign, AlertTriangle, Bell, Check, Clock, X } from "lucide-react";
import type { SmartCase, Reminder } from "@shared/schema";

type DashboardStats = {
  totalProperties: number;
  monthlyRevenue: number;
  openCases: number;
  dueReminders: number;
};

type RentCollectionStatus = {
  collected: number;
  total: number;
  percentage: number;
  items: Array<{
    id: string;
    property: string;
    tenant: string;
    amount: number;
    status: "paid" | "due" | "overdue";
    dueDate: Date;
  }>;
};

export default function Dashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

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

  const { data: rentCollection, isLoading: rentLoading } = useQuery<RentCollectionStatus>({
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
      case "overdue": return <X className="h-4 w-4 text-red-600" />;
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
      case "rent": return "bg-red-500";
      case "lease": return "bg-yellow-500";
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
                    <p className="text-sm font-medium text-muted-foreground">Total Properties</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-total-properties">
                      {statsLoading ? "..." : stats?.totalProperties || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Building className="text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card data-testid="card-monthly-revenue">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Monthly Revenue</p>
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
                    <p className="text-sm font-medium text-muted-foreground">Open Cases</p>
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
                  <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                    <Bell className="text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Dashboard Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column - Large widgets */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Rent Collection Status */}
              <Card data-testid="card-rent-collection">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Rent Collection - {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</CardTitle>
                    <Button variant="ghost" size="sm" data-testid="button-view-all-rent">View All</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {rentLoading ? (
                    <div className="space-y-4">
                      <div className="h-4 bg-muted animate-pulse rounded" />
                      <div className="h-2 bg-muted animate-pulse rounded" />
                    </div>
                  ) : rentCollection ? (
                    <>
                      {/* Progress Bar */}
                      <div className="mb-4">
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-muted-foreground" data-testid="text-rent-progress">
                            Collected: ${rentCollection.collected?.toLocaleString()} / ${rentCollection.total?.toLocaleString()}
                          </span>
                          <span className="text-foreground font-medium" data-testid="text-rent-percentage">
                            {rentCollection.percentage}%
                          </span>
                        </div>
                        <Progress value={rentCollection.percentage} className="h-2" data-testid="progress-rent-collection" />
                      </div>
                      
                      {/* Rent Status Items */}
                      <div className="space-y-3">
                        {rentCollection.items?.slice(0, 3).map((item, index) => (
                          <div key={item.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-md" data-testid={`rent-item-${index}`}>
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center">
                                {getStatusIcon(item.status)}
                              </div>
                              <div>
                                <p className="font-medium text-foreground" data-testid={`text-property-${index}`}>{item.property}</p>
                                <p className="text-sm text-muted-foreground" data-testid={`text-tenant-${index}`}>{item.tenant}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-medium text-foreground" data-testid={`text-amount-${index}`}>${item.amount?.toLocaleString()}</p>
                              <p className={`text-sm ${
                                item.status === 'paid' ? 'text-green-600' : 
                                item.status === 'overdue' ? 'text-red-600' : 'text-yellow-600'
                              }`} data-testid={`text-status-${index}`}>
                                {item.status === 'paid' ? `Paid ${item.dueDate.toLocaleDateString()}` :
                                 item.status === 'overdue' ? 'Overdue' : `Due ${item.dueDate.toLocaleDateString()}`}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground">No rent collection data available</p>
                  )}
                </CardContent>
              </Card>

              {/* Smart Cases Overview */}
              <Card data-testid="card-smart-cases">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Smart Cases</CardTitle>
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
                              <p className="text-sm text-muted-foreground" data-testid={`text-case-property-${index}`}>
                                {smartCase.propertyId ? "Property" : "General"}
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
                    <p className="text-muted-foreground">No active cases</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Sidebar widgets */}
            <div className="space-y-6">
              
              {/* Upcoming Reminders */}
              <Card data-testid="card-upcoming-reminders">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Upcoming Reminders</CardTitle>
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
                          <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${getPriorityColor(reminder.type)}`} />
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
                  <div className="space-y-2">
                    <Button variant="ghost" className="w-full justify-start" data-testid="button-add-property">
                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center mr-3">
                        <Building className="h-4 w-4 text-primary" />
                      </div>
                      Add Property
                    </Button>
                    
                    <Button variant="ghost" className="w-full justify-start" data-testid="button-log-expense">
                      <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                        <DollarSign className="h-4 w-4 text-green-600" />
                      </div>
                      Log Expense
                    </Button>
                    
                    <Button variant="ghost" className="w-full justify-start" data-testid="button-set-reminder">
                      <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center mr-3">
                        <Bell className="h-4 w-4 text-yellow-600" />
                      </div>
                      Set Reminder
                    </Button>
                    
                    <Button variant="ghost" className="w-full justify-start" data-testid="button-report-issue">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                        <AlertTriangle className="h-4 w-4 text-blue-600" />
                      </div>
                      Report Issue
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
