import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import ReminderForm from "@/components/forms/reminder-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Plus, Clock, CheckCircle, Calendar, AlertTriangle } from "lucide-react";
import type { Reminder } from "@shared/schema";

export default function Reminders() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

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

  const { data: reminders, isLoading: remindersLoading, error } = useQuery<Reminder[]>({
    queryKey: ["/api/reminders"],
    retry: false,
  });

  const { data: properties } = useQuery({
    queryKey: ["/api/properties"],
    retry: false,
  });

  const createReminderMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/reminders", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reminders"] });
      setShowReminderForm(false);
      toast({
        title: "Success",
        description: "Reminder created successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
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
      toast({
        title: "Error",
        description: "Failed to create reminder",
        variant: "destructive",
      });
    },
  });

  const completeReminderMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("PATCH", `/api/reminders/${id}`, { 
        status: "Completed",
        completedAt: new Date().toISOString(),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reminders"] });
      toast({
        title: "Success",
        description: "Reminder marked as completed",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
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
      toast({
        title: "Error",
        description: "Failed to complete reminder",
        variant: "destructive",
      });
    },
  });

  if (isLoading || !isAuthenticated) {
    return null;
  }

  if (error && isUnauthorizedError(error as Error)) {
    return null;
  }

  const filteredReminders = reminders?.filter(reminder => {
    const typeMatch = typeFilter === "all" || reminder.type === typeFilter;
    const statusMatch = statusFilter === "all" || reminder.status === statusFilter;
    return typeMatch && statusMatch;
  }) || [];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "rent": return <DollarSign className="h-4 w-4 text-green-600" />;
      case "lease": return <FileText className="h-4 w-4 text-blue-600" />;
      case "maintenance": return <Wrench className="h-4 w-4 text-yellow-600" />;
      case "regulatory": return <Shield className="h-4 w-4 text-purple-600" />;
      default: return <Bell className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Pending": return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case "Sent": return <Badge className="bg-blue-100 text-blue-800">Sent</Badge>;
      case "Completed": return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case "Cancelled": return <Badge className="bg-gray-100 text-gray-800">Cancelled</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "rent": return <Badge className="bg-green-100 text-green-800">Rent</Badge>;
      case "lease": return <Badge className="bg-blue-100 text-blue-800">Lease</Badge>;
      case "maintenance": return <Badge className="bg-yellow-100 text-yellow-800">Maintenance</Badge>;
      case "regulatory": return <Badge className="bg-purple-100 text-purple-800">Regulatory</Badge>;
      case "custom": return <Badge className="bg-gray-100 text-gray-800">Custom</Badge>;
      default: return <Badge variant="secondary">{type}</Badge>;
    }
  };

  const isOverdue = (dueAt: string) => {
    return new Date(dueAt) < new Date();
  };

  const dueReminders = filteredReminders.filter(r => r.status === "Pending" && !isOverdue(r.dueAt)).length;
  const overdueReminders = filteredReminders.filter(r => r.status === "Pending" && isOverdue(r.dueAt)).length;
  const completedReminders = filteredReminders.filter(r => r.status === "Completed").length;

  return (
    <div className="flex h-screen bg-background" data-testid="page-reminders">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Reminders" />
        
        <main className="flex-1 overflow-auto p-6 bg-muted/30">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">Reminders</h1>
              <p className="text-muted-foreground">Stay on top of important tasks and deadlines</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-32" data-testid="select-type-filter">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="rent">Rent</SelectItem>
                  <SelectItem value="lease">Lease</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="regulatory">Regulatory</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32" data-testid="select-status-filter">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Sent">Sent</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>

              <Dialog open={showReminderForm} onOpenChange={setShowReminderForm}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-reminder">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Reminder
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create New Reminder</DialogTitle>
                  </DialogHeader>
                  <ReminderForm 
                    properties={properties || []}
                    onSubmit={(data) => createReminderMutation.mutate(data)}
                    isLoading={createReminderMutation.isPending}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card data-testid="card-due-reminders">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Due Soon</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-due-count">
                      {dueReminders}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <Clock className="text-yellow-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card data-testid="card-overdue-reminders">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Overdue</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-overdue-count">
                      {overdueReminders}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card data-testid="card-completed-reminders">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Completed</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-completed-count">
                      {completedReminders}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <CheckCircle className="text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card data-testid="card-total-reminders">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Total</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-total-count">
                      {filteredReminders.length}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Bell className="text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {remindersLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} data-testid={`skeleton-reminder-${i}`}>
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      <div className="h-5 bg-muted animate-pulse rounded" />
                      <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
                      <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredReminders.length > 0 ? (
            <div className="space-y-4">
              {filteredReminders.map((reminder, index) => (
                <Card key={reminder.id} className="hover:shadow-md transition-shadow" data-testid={`card-reminder-${index}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                          {getTypeIcon(reminder.type)}
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground" data-testid={`text-reminder-title-${index}`}>
                            {reminder.title}
                          </h3>
                          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                            <span data-testid={`text-reminder-due-${index}`}>
                              Due {new Date(reminder.dueAt).toLocaleDateString()}
                            </span>
                            {getTypeBadge(reminder.type)}
                            {isOverdue(reminder.dueAt) && reminder.status === "Pending" && (
                              <Badge className="bg-red-100 text-red-800">Overdue</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        {getStatusBadge(reminder.status)}
                        {reminder.status === "Pending" && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => completeReminderMutation.mutate(reminder.id)}
                            disabled={completeReminderMutation.isPending}
                            data-testid={`button-complete-reminder-${index}`}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Complete
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-3 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span data-testid={`text-reminder-scope-${index}`}>
                          {reminder.scope}: {reminder.scopeId}
                        </span>
                        {reminder.leadDays > 0 && (
                          <span data-testid={`text-reminder-lead-${index}`}>
                            {reminder.leadDays} day(s) notice
                          </span>
                        )}
                      </div>
                      {reminder.completedAt && (
                        <p className="text-green-600 mt-2" data-testid={`text-reminder-completed-${index}`}>
                          Completed {new Date(reminder.completedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2" data-testid="text-no-reminders">No Reminders Set</h3>
                <p className="text-muted-foreground mb-4">Create reminders to stay on top of important tasks and deadlines.</p>
                <Button onClick={() => setShowReminderForm(true)} data-testid="button-add-first-reminder">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Reminder
                </Button>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
