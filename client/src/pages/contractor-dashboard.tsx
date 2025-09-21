import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Clock, MapPin, Phone, Mail, CheckCircle, AlertTriangle, Filter, Heart, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import ContractorAvailability from "@/pages/contractor-availability";
import { LiveNotification } from "@/components/ui/live-notification";
import Header from "@/components/layout/header";

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
  contractorId?: string; // 🎯 Added for appointment creation
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
  Assigned: "text-cyan-700 border-cyan-300", // 🎯 Added missing 'Assigned' status
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

// 🎯 CaseCard Component with Favorite Functionality
const CaseCard = ({ 
  case_, 
  isFavorite, 
  onToggleFavorite, 
  onAcceptCase, 
  updateCaseStatus, 
  acceptCaseMutation 
}: { 
  case_: ContractorCase, 
  isFavorite: boolean, 
  onToggleFavorite: (caseId: string) => void,
  onAcceptCase: (case_: ContractorCase) => void,
  updateCaseStatus: any,
  acceptCaseMutation: any
}) => {
  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "Urgent":
        return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      case "High":
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
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
          <div className="flex items-center gap-2">
            {/* 🌟 Favorite Heart Button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 bg-transparent hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
              onClick={() => onToggleFavorite(case_.id)}
              data-testid={`button-favorite-${case_.id}`}
              aria-pressed={isFavorite}
              title={isFavorite ? 'Unfavorite' : 'Favorite'}
            >
              <Heart 
                className={`h-4 w-4 transition-colors ${isFavorite 
                  ? 'text-pink-500 fill-pink-500' 
                  : 'text-muted-foreground hover:text-pink-400'
                }`} 
              />
            </Button>
            <div className="flex flex-col gap-2">
              <Badge variant="outline" className={PRIORITY_COLORS[case_.priority as keyof typeof PRIORITY_COLORS] || "bg-gray-100"}>
                {case_.priority}
              </Badge>
              <Badge variant="outline" className={STATUS_COLORS[case_.status as keyof typeof STATUS_COLORS] || "bg-gray-100"}>
                {case_.status}
              </Badge>
            </div>
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
              <Button
                size="sm"
                onClick={() => onAcceptCase(case_)}
                disabled={acceptCaseMutation.isPending}
                data-testid={`button-accept-case-${case_.id}`}
              >
                🎯 Accept Case
              </Button>
            )}
            {case_.status === "Scheduled" && (
              <Button
                size="sm"
                onClick={() => updateCaseStatus.mutate({ caseId: case_.id, status: "In Progress" })}
                disabled={updateCaseStatus.isPending}
                data-testid={`button-start-case-${case_.id}`}
              >
                🚀 Start Work
              </Button>
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
  );
};

export default function ContractorDashboard() {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState("cases");
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  
  // 🎯 Accept Case Dialog State
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [acceptingCase, setAcceptingCase] = useState<ContractorCase | null>(null);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [acceptNotes, setAcceptNotes] = useState("");

  // 🔍 Filter State
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [favoriteCases, setFavoriteCases] = useState<Set<string>>(new Set());

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

  // 🎯 NEW! Accept Case with Scheduling Mutation
  const acceptCaseMutation = useMutation({
    mutationFn: async ({ caseId, scheduledDateTime, notes }: { 
      caseId: string; 
      scheduledDateTime: string; 
      notes?: string 
    }) => {
      return await apiRequest("POST", `/api/contractor/accept-case`, { 
        caseId,
        scheduledDateTime,
        notes
      });
    },
    onSuccess: (data) => {
      // Refresh case data
      queryClient.invalidateQueries({ queryKey: ['/api/contractor/cases'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contractor/appointments'] });
      
      // Close dialog and reset state
      setAcceptDialogOpen(false);
      setAcceptingCase(null);
      setScheduledDate("");
      setScheduledTime("");
      setAcceptNotes("");
      
      toast({
        title: "Case Accepted! 🎉",
        description: data.message || "Case has been accepted and scheduled successfully."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Accept Failed",
        description: error?.message || "Failed to accept case. Please try again.",
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

  // 🎯 Handle opening Accept Case dialog
  const handleAcceptCase = (case_: ContractorCase) => {
    setAcceptingCase(case_);
    
    // Set default date to tomorrow, default time to 10:00 AM
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    setScheduledDate(tomorrowStr);
    setScheduledTime("10:00");
    setAcceptNotes("");
    setAcceptDialogOpen(true);
  };

  // 🎯 Handle Accept Case form submission
  const handleAcceptSubmit = () => {
    if (!acceptingCase || !scheduledDate || !scheduledTime) {
      toast({
        title: "Missing Information",
        description: "Please select a date and time for your visit.",
        variant: "destructive"
      });
      return;
    }

    // Combine date and time into ISO string
    const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();

    acceptCaseMutation.mutate({
      caseId: acceptingCase.id,
      scheduledDateTime,
      notes: acceptNotes.trim() || undefined
    });
  };

  // 🔍 Filtering Logic
  const toggleFavorite = (caseId: string) => {
    setFavoriteCases(prev => {
      const newFavorites = new Set(prev);
      if (newFavorites.has(caseId)) {
        newFavorites.delete(caseId);
      } else {
        newFavorites.add(caseId);
      }
      return newFavorites;
    });
  };

  // Extract case type from title or category
  const getCaseType = (case_: ContractorCase) => {
    const title = case_.title.toUpperCase();
    if (title.includes('HVAC')) return 'HVAC';
    if (title.includes('ELECTRICAL')) return 'Electrical';
    if (title.includes('PLUMBING')) return 'Plumbing';
    if (title.includes('HEATING')) return 'Heating';
    if (title.includes('COOLING')) return 'Cooling';
    return case_.category || 'General';
  };

  // Get unique case types for filter dropdown
  const uniqueCaseTypes = Array.from(new Set(assignedCases.map(getCaseType)));

  // Filter cases based on status, type, and favorites
  const filteredCases = assignedCases.filter((case_: ContractorCase) => {
    const matchesStatus = statusFilter === "All" || case_.status === statusFilter;
    const matchesType = typeFilter === "All" || getCaseType(case_) === typeFilter;
    return matchesStatus && matchesType;
  });

  // Separate favorite cases for display
  const favoriteCasesFiltered = filteredCases.filter(c => favoriteCases.has(c.id));
  const regularCasesFiltered = filteredCases.filter(c => !favoriteCases.has(c.id));

  return (
    <div className="min-h-screen bg-muted/30">
      <Header title="Contractor Dashboard" />

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

        {/* 🔍 Filter Controls */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <span className="text-sm font-medium">Filters:</span>
              </div>
              
              <div className="flex items-center gap-2">
                <Label htmlFor="status-filter" className="text-sm">Status:</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger id="status-filter" className="w-[160px] border border-input bg-background cursor-pointer" data-testid="select-status-filter">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-background text-foreground">
                    <SelectItem value="All">All Status</SelectItem>
                    <SelectItem value="New">New</SelectItem>
                    <SelectItem value="Assigned">Assigned</SelectItem>
                    <SelectItem value="Scheduled">Scheduled</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Resolved">Resolved</SelectItem>
                    <SelectItem value="Closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Label htmlFor="type-filter" className="text-sm">Type:</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger id="type-filter" className="w-[160px] border border-input bg-background cursor-pointer" data-testid="select-type-filter">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent className="bg-background text-foreground">
                    <SelectItem value="All">All Types</SelectItem>
                    {uniqueCaseTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <Star className="h-4 w-4 text-yellow-500" />
                <span className="text-sm">
                  {favoriteCases.size} Favorite{favoriteCases.size !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

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
              ) : filteredCases.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-8">
                    <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Cases Found</h3>
                    <p className="text-muted-foreground">No cases match your current filters.</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* 🌟 Favorite Cases First */}
                  {favoriteCasesFiltered.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        Favorite Cases ({favoriteCasesFiltered.length})
                      </div>
                      {favoriteCasesFiltered.map((case_: ContractorCase) => (
                        <CaseCard 
                          key={`favorite-${case_.id}`} 
                          case_={case_} 
                          isFavorite={true} 
                          onToggleFavorite={toggleFavorite}
                          onAcceptCase={handleAcceptCase}
                          updateCaseStatus={updateCaseStatus}
                          acceptCaseMutation={acceptCaseMutation}
                        />
                      ))}
                    </div>
                  )}

                  {/* Regular Cases */}
                  {regularCasesFiltered.length > 0 && (
                    <div className="space-y-4">
                      {favoriteCasesFiltered.length > 0 && (
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground pt-4">
                          <span>Other Cases ({regularCasesFiltered.length})</span>
                        </div>
                      )}
                      {regularCasesFiltered.map((case_: ContractorCase) => (
                        <CaseCard 
                          key={case_.id} 
                          case_={case_} 
                          isFavorite={false} 
                          onToggleFavorite={toggleFavorite}
                          onAcceptCase={handleAcceptCase}
                          updateCaseStatus={updateCaseStatus}
                          acceptCaseMutation={acceptCaseMutation}
                        />
                      ))}
                    </div>
                  )}
                </>
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

      {/* 🎯 Accept Case Dialog */}
      <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Accept Case & Schedule Visit</DialogTitle>
            <DialogDescription>
              {acceptingCase && (
                <>
                  Schedule your visit for <strong>{acceptingCase.title}</strong> at{" "}
                  {acceptingCase.buildingName && acceptingCase.roomNumber 
                    ? `${acceptingCase.buildingName} - Room ${acceptingCase.roomNumber}`
                    : acceptingCase.locationText || "the specified location"
                  }
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scheduled-date">Visit Date</Label>
                <Input
                  id="scheduled-date"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  data-testid="input-scheduled-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduled-time">Visit Time</Label>
                <Input
                  id="scheduled-time"
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  data-testid="input-scheduled-time"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="accept-notes">Notes (Optional)</Label>
              <Textarea
                id="accept-notes"
                placeholder="Any special instructions or requirements..."
                value={acceptNotes}
                onChange={(e) => setAcceptNotes(e.target.value)}
                data-testid="textarea-accept-notes"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setAcceptDialogOpen(false)}
              data-testid="button-cancel-accept"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAcceptSubmit}
              disabled={acceptCaseMutation.isPending || !scheduledDate || !scheduledTime}
              data-testid="button-confirm-accept"
            >
              {acceptCaseMutation.isPending ? "Accepting..." : "🎯 Accept & Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}