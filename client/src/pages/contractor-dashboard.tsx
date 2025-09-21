import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Clock, MapPin, Phone, Mail, CheckCircle, AlertTriangle, User, Settings, ArrowLeft } from "lucide-react";
import { useRolePreview } from "@/contexts/RolePreviewContext";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import ContractorAvailability from "@/pages/contractor-availability";
import { LiveNotification } from "@/components/ui/live-notification";

interface ContractorCase {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  category: string;
  buildingName?: string;
  roomNumber?: string;
  locationText?: string;
  estimatedCost?: number;
  actualCost?: number;
  createdAt: string;
  updatedAt: string;
}

interface ContractorAppointment {
  id: string;
  caseId?: string;
  title: string;
  description?: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  status: string;
  priority: string;
  locationDetails?: string;
  notes?: string;
  isEmergency: boolean;
  requiresTenantAccess: boolean;
}

const PRIORITY_COLORS = {
  Low: "text-green-700 border-green-300",
  Medium: "text-amber-700 border-amber-300", 
  High: "text-orange-600 border-orange-300",
  Urgent: "text-orange-700 border-orange-300"
};

const STATUS_COLORS = {
  New: "text-blue-700 border-blue-300",
  "In Review": "text-amber-700 border-amber-300",
  Scheduled: "text-purple-700 border-purple-300",
  "In Progress": "text-orange-600 border-orange-300",
  "On Hold": "text-gray-700 border-gray-300",
  Resolved: "text-green-700 border-green-300",
  Closed: "text-gray-600 border-gray-300",
  Pending: "text-blue-700 border-blue-300",
  Confirmed: "text-green-700 border-green-300",
  Completed: "text-green-700 border-green-300"
};

export default function ContractorDashboard() {
  const { toast } = useToast();
  const { effectiveRole, originalRole, setPreviewRole, isPreviewing } = useRolePreview();
  const [selectedTab, setSelectedTab] = useState("cases");
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  // Get current user for live notifications
  const { data: user } = useQuery({
    queryKey: ['/api/auth/user'],
    enabled: true
  });

  // Get assigned cases
  const { data: assignedCases = [], isLoading: casesLoading } = useQuery<ContractorCase[]>({
    queryKey: ['/api/contractor/cases'],
    enabled: true
  });

  // Get contractor appointments
  const { data: appointments = [], isLoading: appointmentsLoading } = useQuery<ContractorAppointment[]>({
    queryKey: ['/api/contractor/appointments'],
    enabled: true
  });

  // Update case status mutation
  const updateCaseStatus = useMutation({
    mutationFn: async ({ caseId, status, notes }: { caseId: string; status: string; notes?: string }) => {
      return await apiRequest("PATCH", `/api/cases/${caseId}`, { 
        status,
        ...(notes && { notes })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contractor/cases'] });
      toast({
        title: "Status Updated",
        description: "Case status has been updated successfully."
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update case status. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Update appointment status mutation
  const updateAppointmentStatus = useMutation({
    mutationFn: async ({ appointmentId, status, notes }: { appointmentId: string; status: string; notes?: string }) => {
      return await apiRequest("PATCH", `/api/appointments/${appointmentId}`, { 
        status,
        ...(notes && { notes })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contractor/appointments'] });
      toast({
        title: "Appointment Updated",
        description: "Appointment status has been updated successfully."
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update appointment status. Please try again.",
        variant: "destructive"
      });
    }
  });

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "Urgent":
        return <AlertTriangle className="h-4 w-4" />;
      case "High":
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  // Create appointment mutation
  const createAppointmentMutation = useMutation({
    mutationFn: async ({ caseId, scheduledStartAt }: { caseId: string; scheduledStartAt: string }) => {
      const assignedCase = assignedCases.find(c => c.id === caseId);
      
      // ✅ FIX: Get contractorId from the assigned case (since case is assigned to current contractor)
      if (!assignedCase) {
        throw new Error("Case not found");
      }
      
      const appointmentData = {
        caseId: caseId,
        contractorId: assignedCase.contractorId || 'current-contractor-id', // Get from case assignment
        title: `Maintenance Visit - ${assignedCase?.title || 'Case'}`,
        description: `Scheduled maintenance visit for: ${assignedCase?.description || ''}`,
        scheduledStartAt: scheduledStartAt,
        scheduledEndAt: new Date(new Date(scheduledStartAt).getTime() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours later
        priority: assignedCase?.priority || 'Medium',
        locationDetails: assignedCase?.buildingName && assignedCase?.roomNumber ? 
          `${assignedCase.buildingName} - Room ${assignedCase.roomNumber}` : 
          assignedCase?.locationText || 'Location TBD',
        isEmergency: assignedCase?.priority === 'Urgent',
        requiresTenantAccess: true
      };
      return await apiRequest("POST", "/api/appointments", appointmentData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contractor/appointments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractor/cases'] });
      // Update case status to Scheduled
      updateCaseStatus.mutate({ caseId: selectedCaseId!, status: "Scheduled" });
      toast({
        title: "Appointment Scheduled",
        description: "Appointment has been scheduled successfully. Student will be notified."
      });
      setScheduleDialogOpen(false);
      setSelectedCaseId(null);
    },
    onError: () => {
      toast({
        title: "Scheduling Failed",
        description: "Failed to schedule appointment. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Handle scheduling appointment
  const handleScheduleAppointment = (caseId: string) => {
    setSelectedCaseId(caseId);
    // Quick schedule for tomorrow at 10 AM (in production, would show date/time picker)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    
    createAppointmentMutation.mutate({ 
      caseId, 
      scheduledStartAt: tomorrow.toISOString() 
    });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b border-border bg-background">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <User className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Contractor Dashboard</h1>
                <p className="text-sm text-muted-foreground">Manage your assigned maintenance cases</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {/* Role Switching */}
              {(originalRole === 'admin' || originalRole === 'manager' || originalRole === 'staff') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewRole(null)}
                  className="flex items-center space-x-2"
                  data-testid="button-switch-to-admin"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Admin View</span>
                </Button>
              )}
              
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{new Date().toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Assigned Cases</p>
                  <p className="text-2xl font-bold">{assignedCases.length}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Urgent Cases</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {assignedCases.filter((c: ContractorCase) => c.priority === "Urgent").length}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Today's Appointments</p>
                  <p className="text-2xl font-bold">
                    {appointments.filter((a: ContractorAppointment) => {
                      const today = new Date().toDateString();
                      return new Date(a.scheduledStartAt).toDateString() === today;
                    }).length}
                  </p>
                </div>
                <Calendar className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">In Progress</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {assignedCases.filter((c: ContractorCase) => c.status === "In Progress").length}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="cases" data-testid="tab-cases">My Cases</TabsTrigger>
            <TabsTrigger value="appointments" data-testid="tab-appointments">Appointments</TabsTrigger>
            <TabsTrigger value="availability" data-testid="tab-availability">Availability</TabsTrigger>
          </TabsList>

          <TabsContent value="cases" className="mt-6">
            <div className="space-y-4">
              {casesLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading cases...</p>
                </div>
              ) : assignedCases.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-8">
                    <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Cases Assigned</h3>
                    <p className="text-muted-foreground">You don't have any maintenance cases assigned at the moment.</p>
                  </CardContent>
                </Card>
              ) : (
                assignedCases.map((case_: ContractorCase) => (
                  <Card key={case_.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            {getPriorityIcon(case_.priority)}
                            {case_.title}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            {case_.buildingName && case_.roomNumber ? 
                              `${case_.buildingName} - Room ${case_.roomNumber}` : 
                              case_.locationText || 'Location TBD'
                            }
                          </CardDescription>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge variant="outline" className={PRIORITY_COLORS[case_.priority as keyof typeof PRIORITY_COLORS] || "bg-gray-100"}>
                            {case_.priority}
                          </Badge>
                          <Badge variant="outline" className={STATUS_COLORS[case_.status as keyof typeof STATUS_COLORS] || "bg-gray-100"}>
                            {case_.status}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-4">{case_.description}</p>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            <span>{case_.category}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span>{formatDateTime(case_.createdAt)}</span>
                          </div>
                        </div>
                        
                        <div className="flex gap-2">
                          {case_.status === "New" && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => updateCaseStatus.mutate({ caseId: case_.id, status: "In Review" })}
                                disabled={updateCaseStatus.isPending}
                                data-testid={`button-accept-case-${case_.id}`}
                              >
                                Accept Job
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleScheduleAppointment(case_.id)}
                                disabled={updateCaseStatus.isPending}
                                data-testid={`button-schedule-case-${case_.id}`}
                              >
                                Schedule Appointment
                              </Button>
                            </>
                          )}
                          {case_.status === "In Review" && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => updateCaseStatus.mutate({ caseId: case_.id, status: "In Progress" })}
                                disabled={updateCaseStatus.isPending}
                                data-testid={`button-start-case-${case_.id}`}
                              >
                                Start Work
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleScheduleAppointment(case_.id)}
                                disabled={updateCaseStatus.isPending}
                                data-testid={`button-schedule-case-${case_.id}`}
                              >
                                Schedule Visit
                              </Button>
                            </>
                          )}
                          {case_.status === "In Progress" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateCaseStatus.mutate({ caseId: case_.id, status: "Resolved" })}
                              disabled={updateCaseStatus.isPending}
                              data-testid={`button-complete-case-${case_.id}`}
                            >
                              Mark Complete
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="appointments" className="mt-6">
            <div className="space-y-4">
              {appointmentsLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading appointments...</p>
                </div>
              ) : appointments.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-8">
                    <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Appointments Scheduled</h3>
                    <p className="text-muted-foreground">You don't have any appointments scheduled at the moment.</p>
                  </CardContent>
                </Card>
              ) : (
                appointments.map((appointment: ContractorAppointment) => (
                  <Card key={appointment.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <Calendar className="h-5 w-5" />
                            {appointment.title}
                            {appointment.isEmergency && (
                              <Badge className="bg-orange-100 text-orange-800 border-orange-200">Emergency</Badge>
                            )}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            {formatDateTime(appointment.scheduledStartAt)} - {formatDateTime(appointment.scheduledEndAt)}
                          </CardDescription>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge variant="outline" className={PRIORITY_COLORS[appointment.priority as keyof typeof PRIORITY_COLORS] || "bg-gray-100"}>
                            {appointment.priority}
                          </Badge>
                          <Badge variant="outline" className={STATUS_COLORS[appointment.status as keyof typeof STATUS_COLORS] || "bg-gray-100"}>
                            {appointment.status}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {appointment.description && (
                        <p className="text-sm text-muted-foreground mb-3">{appointment.description}</p>
                      )}
                      
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                        {appointment.locationDetails && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            <span>{appointment.locationDetails}</span>
                          </div>
                        )}
                        {appointment.requiresTenantAccess && (
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            <span>Tenant Access Required</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                          Priority: {appointment.priority}
                        </div>
                        
                        <div className="flex gap-2">
                          {appointment.status === "Pending" && (
                            <Button
                              size="sm"
                              onClick={() => updateAppointmentStatus.mutate({ appointmentId: appointment.id, status: "Confirmed" })}
                              disabled={updateAppointmentStatus.isPending}
                              data-testid={`button-confirm-appointment-${appointment.id}`}
                            >
                              Confirm
                            </Button>
                          )}
                          {appointment.status === "Confirmed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateAppointmentStatus.mutate({ appointmentId: appointment.id, status: "In Progress" })}
                              disabled={updateAppointmentStatus.isPending}
                              data-testid={`button-start-appointment-${appointment.id}`}
                            >
                              Start
                            </Button>
                          )}
                          {appointment.status === "In Progress" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateAppointmentStatus.mutate({ appointmentId: appointment.id, status: "Completed" })}
                              disabled={updateAppointmentStatus.isPending}
                              data-testid={`button-complete-appointment-${appointment.id}`}
                            >
                              Complete
                            </Button>
                          )}
                        </div>
                      </div>

                      {appointment.notes && (
                        <div className="mt-3 p-3 bg-muted rounded-lg">
                          <p className="text-sm font-medium mb-1">Notes:</p>
                          <p className="text-sm text-muted-foreground">{appointment.notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="availability" className="mt-6">
            <ContractorAvailability />
          </TabsContent>
        </Tabs>
      </main>

      {/* Live Notifications */}
      {user?.id && (
        <LiveNotification 
          userRole="contractor" 
          userId={user.id} 
        />
      )}
    </div>
  );
}