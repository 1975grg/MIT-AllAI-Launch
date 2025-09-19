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
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
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
    queryKey: ["/api/smart-cases"],
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
    mutationFn: (data: any) => fetch("/api/smart-cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(res => res.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/smart-cases"] });
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
    mutationFn: ({ id, ...data }: any) => fetch(`/api/smart-cases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/smart-cases"] });
      toast({ title: "Success", description: "Maintenance case updated successfully!" });
      handleCloseForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update maintenance case", variant: "destructive" });
    },
  });

  const updateCaseStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => 
      fetch(`/api/smart-cases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/smart-cases"] });
      toast({ title: "Success", description: "Case status updated!" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update case status", variant: "destructive" });
    },
  });

  const deleteCaseMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/smart-cases/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/smart-cases"] });
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
      case "Urgent": return "bg-red-100 text-red-800";
      case "High": return "bg-orange-100 text-orange-800";
      case "Medium": return "bg-yellow-100 text-yellow-800";
      case "Low": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "New": return <Badge variant="destructive">{status}</Badge>;
      case "In Progress": return <Badge variant="default">{status}</Badge>;
      case "Resolved": return <Badge variant="secondary" className="bg-green-100 text-green-800">{status}</Badge>;
      case "Closed": return <Badge variant="outline">{status}</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string | null) => {
    switch (priority) {
      case "Urgent": return <Badge variant="destructive">{priority}</Badge>;
      case "High": return <Badge variant="destructive" className="bg-orange-100 text-orange-800">{priority}</Badge>;
      case "Medium": return <Badge variant="default">{priority}</Badge>;
      case "Low": return <Badge variant="outline">{priority}</Badge>;
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
  const selectedProperty = properties?.find(p => p.id === selectedPropertyId);
  const selectedPropertyUnits = units.filter(unit => unit.propertyId === selectedPropertyId);

  const filteredProperties = entityFilter === "all" 
    ? properties || []
    : properties?.filter(p => p.entityId === entityFilter) || [];

  const filteredCases = (smartCases || []).filter((smartCase: SmartCase) => {
    const matchesSearch = !searchTerm || 
      smartCase.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      smartCase.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesEntity = entityFilter === "all" || 
      properties?.find(p => p.id === smartCase.propertyId)?.entityId === entityFilter;
    
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

  // Safe render function to avoid nested ternaries
  const renderSmartCases = () => {
    if (casesLoading) {
      return (
        <div className="grid grid-cols-1 gap-6">
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
        <Card>
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

    // Temporarily simplified for debugging
    return (
      <div className="grid grid-cols-1 gap-6">
        {filteredCases.map((smartCase, index) => (
          <Card key={smartCase.id} className="hover:shadow-md transition-shadow" data-testid={`card-case-${index}`}>
            <CardHeader>
              <CardTitle>{smartCase.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p>{smartCase.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-background" data-testid="page-maintenance">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={viewMode === "student" ? "Submit Maintenance Request" : "AI Maintenance Triage"} />
        <main className="flex-1 overflow-auto p-6 bg-muted/30">
          {renderSmartCases()}
        </main>
      </div>
    </div>
  );
}