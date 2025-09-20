import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { useToast } from "@/hooks/use-toast";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Calendar } from "@/components/ui/calendar";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Wrench, AlertTriangle, Clock, CheckCircle, XCircle, Trash2, Bell, GraduationCap, Grid3X3, List, Map as MapIcon, Columns3, Edit, MapPin } from "lucide-react";
import ReminderForm from "@/components/forms/reminder-form";
import type { SmartCase, Property, OwnershipEntity, Unit } from "@shared/schema";
import PropertyAssistant from "@/components/ai/property-assistant";
import EnhancedChatInterface from "@/components/maintenance/enhanced-chat-interface";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const MAINTENANCE_CATEGORIES = [
  "Plumbing", "Electrical", "HVAC", "Appliances", "Flooring", "Walls/Paint", 
  "Windows/Doors", "Roofing", "Exterior", "Cleaning", "Pest Control", "Safety/Security", "Other"
];

export default function MaintenancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State for different views and filters
  const [viewMode, setViewMode] = useState<"student" | "admin">("admin");
  const [smartCasesViewMode, setSmartCasesViewMode] = useState<"cards" | "list" | "heatmap" | "kanban">("cards");
  const [showCaseForm, setShowCaseForm] = useState(false);
  const [editingCase, setEditingCase] = useState<SmartCase | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");

  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  // Reminder states
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [reminderCaseContext, setReminderCaseContext] = useState<{ caseId: string; caseTitle: string } | null>(null);

  // Form setup
  const form = useForm({
    resolver: zodResolver(z.object({
      title: z.string().min(1, "Title is required"),
      description: z.string().optional(),
      propertyId: z.string().min(1, "Property is required"),
      unitId: z.string().optional(),
      priority: z.enum(["Low", "Medium", "High", "Urgent"]),
      category: z.string().min(1, "Category is required"),
      createReminder: z.boolean().optional(),
    })),
    defaultValues: {
      title: "",
      description: "",
      propertyId: "",
      unitId: "",
      priority: "Medium" as const,
      category: "",
      createReminder: false,
    },
  });

  // Reset selectedPropertyId when starting to create a new case
  useEffect(() => {
    if (!editingCase && showCaseForm) {
      setSelectedPropertyId("");
      form.setValue("unitId", "");
    }
  }, [showCaseForm, editingCase, form]);

  // Update selectedPropertyId when editing a case
  useEffect(() => {
    if (editingCase && editingCase.propertyId) {
      setSelectedPropertyId(editingCase.propertyId);
    }
  }, [editingCase]);

  // Data fetching
  const { data: smartCases, isLoading: casesLoading } = useQuery({
    queryKey: ["/api/cases"],
  });

  const { data: properties } = useQuery({
    queryKey: ["/api/properties"],
  });

  const { data: entities } = useQuery({
    queryKey: ["/api/entities"],
  });

  const { data: units = [] } = useQuery({
    queryKey: ["/api/units"],
  });

  // Mutations
  const createCaseMutation = useMutation({
    mutationFn: (data: any) => fetch("/api/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(res => res.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      toast({ title: "Success", description: "Maintenance case created successfully!" });
      
      // Handle reminder creation if requested
      if (form.getValues("createReminder")) {
        setReminderCaseContext({
          caseId: data.id,
          caseTitle: data.title
        });
        setShowReminderForm(true);
      }
      
      handleCloseForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create maintenance case", variant: "destructive" });
    },
  });

  const updateCaseMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => fetch(`/api/cases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      toast({ title: "Success", description: "Maintenance case updated successfully!" });
      handleCloseForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update maintenance case", variant: "destructive" });
    },
  });

  const updateCaseStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => 
      fetch(`/api/cases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      toast({ title: "Success", description: "Case status updated!" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update case status", variant: "destructive" });
    },
  });

  const deleteCaseMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/cases/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      toast({ title: "Success", description: "Maintenance case deleted!" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete maintenance case", variant: "destructive" });
    },
  });

  const createReminderMutation = useMutation({
    mutationFn: (data: any) => fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reminders"] });
      toast({ title: "Success", description: "Reminder created successfully!" });
      setShowReminderForm(false);
      setReminderCaseContext(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create reminder", variant: "destructive" });
    },
  });

  // Helper functions
  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "New": return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case "In Progress": return <Clock className="h-4 w-4 text-blue-600" />;
      case "Resolved": return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "Closed": return <XCircle className="h-4 w-4 text-gray-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getPriorityCircleColor = (priority: string | null) => {
    switch (priority) {
      case "Urgent": return "bg-orange-100 text-orange-800";
      case "High": return "bg-orange-100 text-orange-800";
      case "Medium": return "bg-yellow-100 text-yellow-800";
      case "Low": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "New": return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">{status}</Badge>;
      case "In Progress": return <Badge className="bg-blue-100 text-blue-800 border-blue-200">{status}</Badge>;
      case "Resolved": return <Badge className="bg-green-100 text-green-800 border-green-200">{status}</Badge>;
      case "Closed": return <Badge className="bg-gray-100 text-gray-800 border-gray-200">{status}</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string | null) => {
    switch (priority) {
      case "Urgent": return <Badge variant="outline" className="text-orange-700 border-orange-300">{priority}</Badge>;
      case "High": return <Badge variant="outline" className="text-orange-600 border-orange-300">{priority}</Badge>;
      case "Medium": return <Badge variant="outline" className="text-amber-700 border-amber-300">{priority}</Badge>;
      case "Low": return <Badge variant="outline" className="text-green-700 border-green-300">{priority}</Badge>;
      default: return <Badge variant="secondary">{priority}</Badge>;
    }
  };

  // Event handlers
  const handleSubmit = (data: any) => {
    if (editingCase) {
      updateCaseMutation.mutate({ id: editingCase.id, ...data });
    } else {
      createCaseMutation.mutate(data);
    }
  };

  const handleEditCase = (smartCase: SmartCase) => {
    setEditingCase(smartCase);
    form.reset({
      title: smartCase.title || "",
      description: smartCase.description || "",
      propertyId: smartCase.propertyId || "",
      unitId: smartCase.unitId || "",
      priority: smartCase.priority || "Medium",
      category: smartCase.category || "",
      createReminder: false,
    });
    setShowCaseForm(true);
  };

  const handleCloseForm = () => {
    setShowCaseForm(false);
    setEditingCase(null);
    form.reset();
  };

  const handleDialogChange = (open: boolean) => {
    setShowCaseForm(open);
    if (!open) {
      setEditingCase(null);
      form.reset();
    }
  };

  const handleReminderSubmit = (data: any) => {
    const reminderData = {
      ...data,
      relatedCaseId: reminderCaseContext?.caseId || null,
    };
    createReminderMutation.mutate(reminderData);
  };

  // Filtered data
  const selectedProperty = (properties as Property[] | undefined)?.find((p: Property) => p.id === selectedPropertyId);
  const selectedPropertyUnits = (units as Unit[]).filter((unit: Unit) => unit.propertyId === selectedPropertyId);

  const filteredProperties = entityFilter === "all" 
    ? (properties as Property[] | undefined) || []
    : (properties as Property[] | undefined)?.filter((p: Property) => (p as any).entityId === entityFilter) || [];

  const filteredCases = (smartCases as SmartCase[] || []).filter((smartCase: SmartCase) => {
    const matchesSearch = !searchTerm || 
      smartCase.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      smartCase.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesEntity = entityFilter === "all" || 
      ((properties as Property[] | undefined)?.find((p: Property) => p.id === smartCase.propertyId) as any)?.entityId === entityFilter;
    
    const matchesProperty = propertyFilter === "all" || smartCase.propertyId === propertyFilter;
    
    const matchesUnit = unitFilter.length === 0 || 
      (smartCase.unitId && unitFilter.includes(smartCase.unitId)) ||
      (!smartCase.unitId && unitFilter.includes("common"));
    
    const matchesCategory = categoryFilter === "all" || smartCase.category === categoryFilter;
    const matchesStatus = statusFilter === "all" || smartCase.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || smartCase.priority === priorityFilter;

    return matchesSearch && matchesEntity && matchesProperty && matchesUnit && 
           matchesCategory && matchesStatus && matchesPriority;
  });

  // Smart Case Card Component
  const SmartCaseCard = ({ smartCase, index }: { smartCase: SmartCase; index: number }) => {
    const property = (properties as Property[] | undefined)?.find((p: Property) => p.id === smartCase.propertyId);
    const unit = (units as Unit[]).find((u: Unit) => u.id === smartCase.unitId);
    
    return (
      <Card key={smartCase.id} className="hover:shadow-lg transition-all duration-200 border-border bg-white dark:bg-card" data-testid={`card-case-${index}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg font-semibold text-foreground line-clamp-2">{smartCase.title}</CardTitle>
              <div className="flex items-center gap-2 mt-2">
                {property && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {property.name} {unit ? `- ${unit.label}` : ''}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge(smartCase.status)}
              {smartCase.priority && getPriorityBadge(smartCase.priority)}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {smartCase.description && (
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{smartCase.description}</p>
          )}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {smartCase.createdAt ? new Date(smartCase.createdAt).toLocaleDateString() : 'No date'}
            </span>
            {smartCase.category && (
              <Badge variant="outline" className="text-xs">{smartCase.category}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleEditCase(smartCase)}
              data-testid={`button-edit-case-${index}`}
            >
              <Edit className="h-3 w-3 mr-1" />
              Edit
            </Button>
            {smartCase.status !== "Resolved" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateCaseStatusMutation.mutate({ id: smartCase.id, status: "Resolved" })}
                data-testid={`button-resolve-case-${index}`}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Resolve
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  // View renderers
  const renderCardsView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {filteredCases.map((smartCase: SmartCase, index: number) => (
        <SmartCaseCard key={smartCase.id} smartCase={smartCase} index={index} />
      ))}
    </div>
  );

  const renderListView = () => (
    <div className="space-y-4">
      {filteredCases.map((smartCase: SmartCase, index: number) => (
        <Card key={smartCase.id} className="hover:shadow-md transition-shadow bg-white dark:bg-card" data-testid={`list-case-${index}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  {getStatusIcon(smartCase.status)}
                  <div>
                    <h3 className="font-semibold text-foreground">{smartCase.title}</h3>
                    <p className="text-sm text-muted-foreground">{smartCase.description}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(smartCase.status)}
                {smartCase.priority && getPriorityBadge(smartCase.priority)}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderKanbanView = () => {
    const statusColumns = ["New", "In Progress", "Resolved", "Closed"];
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statusColumns.map((status) => (
          <div key={status} className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground">{status}</h3>
              <Badge variant="outline">
                {filteredCases.filter((c: SmartCase) => c.status === status).length}
              </Badge>
            </div>
            <div className="space-y-3">
              {filteredCases
                .filter((c: SmartCase) => c.status === status)
                .map((smartCase: SmartCase, index: number) => (
                  <Card key={smartCase.id} className="cursor-pointer hover:shadow-md transition-shadow bg-white dark:bg-card" data-testid={`kanban-case-${index}`}>
                    <CardContent className="p-3">
                      <h4 className="font-medium text-sm mb-2">{smartCase.title}</h4>
                      {smartCase.priority && (
                        <div className="mb-2">{getPriorityBadge(smartCase.priority)}</div>
                      )}
                      <p className="text-xs text-muted-foreground line-clamp-2">{smartCase.description}</p>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderHeatmapView = () => (
    <Card className="bg-white dark:bg-card">
      <CardHeader>
        <CardTitle>Property Maintenance Heatmap</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(properties as Property[] | undefined)?.map((property: Property) => {
            const propertyCases = filteredCases.filter((c: SmartCase) => c.propertyId === property.id);
            const urgentCount = propertyCases.filter((c: SmartCase) => c.priority === "Urgent").length;
            const highCount = propertyCases.filter((c: SmartCase) => c.priority === "High").length;
            
            return (
              <Card key={property.id} className={`${
                urgentCount > 0 ? 'border-orange-200 bg-orange-50' :
                highCount > 0 ? 'border-orange-200 bg-orange-50' :
                propertyCases.length > 0 ? 'border-yellow-200 bg-yellow-50' :
                'border-green-200 bg-green-50'
              } transition-colors`}>
                <CardContent className="p-4">
                  <h4 className="font-semibold">{property.name}</h4>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline">{propertyCases.length} cases</Badge>
                    {urgentCount > 0 && <Badge variant="destructive">{urgentCount} urgent</Badge>}
                    {highCount > 0 && <Badge className="bg-orange-100 text-orange-800">{highCount} high</Badge>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );

  // Main render function
  const renderSmartCases = () => {
    if (casesLoading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} data-testid={`skeleton-case-${i}`}>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="h-6 bg-muted animate-pulse rounded" />
                  <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
                  <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      );
    }

    if (filteredCases.length === 0) {
      return (
        <Card className="bg-white dark:bg-card">
          <CardContent className="p-12 text-center">
            <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2" data-testid="text-no-cases">No Maintenance Cases</h3>
            <p className="text-muted-foreground mb-4">Create your first maintenance case to start tracking issues and repairs.</p>
            <Button onClick={() => setShowCaseForm(true)} data-testid="button-add-first-case">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Case
            </Button>
          </CardContent>
        </Card>
      );
    }

    // Render based on view mode
    switch (smartCasesViewMode) {
      case "cards": return renderCardsView();
      case "list": return renderListView();
      case "kanban": return renderKanbanView();
      case "heatmap": return renderHeatmapView();
      default: return renderCardsView();
    }
  };

  return (
    <div className="flex h-screen bg-background" data-testid="page-maintenance">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={viewMode === "student" ? "Submit Maintenance Request" : "AI Maintenance Triage"} />
        <main className="flex-1 overflow-auto p-6 bg-muted/30">
          
          {/* Header with view controls like AllAI Property */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Maintenance Cases</h1>
                <p className="text-muted-foreground">Track and manage maintenance requests</p>
              </div>
              <Button onClick={() => setShowCaseForm(true)} variant="ghost" className="hover:bg-pink-50 hover:text-pink-700" data-testid="button-create-case">
                <Plus className="h-4 w-4 mr-2" />
                Quick Add
              </Button>
            </div>

            {/* Stats and View Switcher - NO BACKGROUNDS */}
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center gap-8">
                <div className="flex items-center gap-2">
                  <span className="text-base font-medium text-foreground">
                    {filteredCases.length} Total Cases
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-medium text-foreground">
                    {filteredCases.filter((c: SmartCase) => c.priority === "Urgent").length} Urgent
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-medium text-foreground">
                    {filteredCases.filter((c: SmartCase) => c.priority === "High").length} High
                  </span>
                </div>
              </div>

              {/* View Mode Switcher - NO BACKGROUNDS */}
              <div className="flex items-center space-x-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSmartCasesViewMode("cards")}
                  className={`px-3 py-2 text-sm font-medium transition-all !bg-transparent hover:!bg-pink-50 hover:!text-pink-700 ${
                    smartCasesViewMode === "cards" 
                      ? "text-foreground font-semibold underline underline-offset-4" 
                      : "text-muted-foreground"
                  }`}
                  data-testid="button-view-cards"
                >
                  <Grid3X3 className="h-4 w-4 mr-2" />
                  Cards
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSmartCasesViewMode("list")}
                  className={`px-3 py-2 text-sm font-medium transition-all !bg-transparent hover:!bg-pink-50 hover:!text-pink-700 ${
                    smartCasesViewMode === "list" 
                      ? "text-foreground font-semibold underline underline-offset-4" 
                      : "text-muted-foreground"
                  }`}
                  data-testid="button-view-list"
                >
                  <List className="h-4 w-4 mr-2" />
                  List
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSmartCasesViewMode("heatmap")}
                  className={`px-3 py-2 text-sm font-medium transition-all !bg-transparent hover:!bg-pink-50 hover:!text-pink-700 ${
                    smartCasesViewMode === "heatmap" 
                      ? "text-foreground font-semibold underline underline-offset-4" 
                      : "text-muted-foreground"
                  }`}
                  data-testid="button-view-heatmap"
                >
                  <MapIcon className="h-4 w-4 mr-2" />
                  Heat Map
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSmartCasesViewMode("kanban")}
                  className={`px-3 py-2 text-sm font-medium transition-all !bg-transparent hover:!bg-pink-50 hover:!text-pink-700 ${
                    smartCasesViewMode === "kanban" 
                      ? "text-foreground font-semibold underline underline-offset-4" 
                      : "text-muted-foreground"
                  }`}
                  data-testid="button-view-kanban"
                >
                  <Columns3 className="h-4 w-4 mr-2" />
                  Kanban
                </Button>
              </div>
            </div>
          </div>

          {/* Cases Display */}
          {renderSmartCases()}
        </main>
      </div>
    </div>
  );
}