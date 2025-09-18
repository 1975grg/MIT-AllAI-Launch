import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Users, Clock, Phone, AlertTriangle, CheckCircle, Star, Calendar, Wrench, Zap, Bot } from "lucide-react";
import type { Vendor } from "@shared/schema";
import PropertyAssistant from "@/components/ai/property-assistant";

// MIT Contractor Categories
const CONTRACTOR_CATEGORIES = [
  "HVAC / Heating & Cooling",
  "Plumbing & Water Systems", 
  "Electrical & Lighting",
  "Building Maintenance",
  "Dormitory Services",
  "Safety & Security",
  "Network/IT Infrastructure", 
  "Landscaping & Grounds",
  "Emergency Response",
  "Specialized Equipment",
  "General Maintenance"
];

const DAYS_OF_WEEK = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
];

const contractorSchema = z.object({
  name: z.string().min(1, "Contractor name is required"),
  category: z.string().min(1, "Category is required"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  notes: z.string().optional(),
  isPreferred: z.boolean().default(false),
  // Scheduling fields
  availabilityPattern: z.enum(["weekdays", "weekends", "24_7", "emergency_only", "custom"]).default("weekdays"),
  availableStartTime: z.string().default("09:00"),
  availableEndTime: z.string().default("17:00"),
  availableDays: z.array(z.string()).default(["monday", "tuesday", "wednesday", "thursday", "friday"]),
  responseTimeHours: z.number().min(1).max(168).default(24),
  priorityScheduling: z.enum(["standard", "priority", "emergency"]).default("standard"),
  emergencyAvailable: z.boolean().default(false),
  emergencyPhone: z.string().optional(),
  estimatedHourlyRate: z.number().min(0).optional(),
  specializations: z.array(z.string()).default([]),
  maxJobsPerDay: z.number().min(1).max(10).default(3),
  isActiveContractor: z.boolean().default(true),
});

type ContractorFormData = z.infer<typeof contractorSchema>;

export default function CampusContractors() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [showContractorForm, setShowContractorForm] = useState(false);
  const [editingContractor, setEditingContractor] = useState<Vendor | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

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

  const { data: contractors = [], isLoading: contractorsLoading, error } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
    retry: false,
  });

  const form = useForm<ContractorFormData>({
    resolver: zodResolver(contractorSchema),
    defaultValues: {
      name: "",
      category: "",
      phone: "",
      email: "",
      address: "",
      notes: "",
      isPreferred: false,
      availabilityPattern: "weekdays",
      availableStartTime: "09:00",
      availableEndTime: "17:00",
      availableDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      responseTimeHours: 24,
      priorityScheduling: "standard",
      emergencyAvailable: false,
      emergencyPhone: "",
      estimatedHourlyRate: undefined,
      specializations: [],
      maxJobsPerDay: 3,
      isActiveContractor: true,
    },
  });

  const createContractorMutation = useMutation({
    mutationFn: async (data: ContractorFormData) => {
      const endpoint = editingContractor ? `/api/vendors/${editingContractor.id}` : "/api/vendors";
      const method = editingContractor ? "PUT" : "POST";
      const response = await apiRequest(method, endpoint, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      setShowContractorForm(false);
      setEditingContractor(null);
      form.reset();
      toast({
        title: "Success",
        description: editingContractor ? "Contractor updated successfully" : "Contractor added successfully",
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
        description: "Failed to save contractor",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ContractorFormData) => {
    createContractorMutation.mutate(data);
  };

  const handleEdit = (contractor: Vendor) => {
    setEditingContractor(contractor);
    form.reset({
      name: contractor.name,
      category: contractor.category || "",
      phone: contractor.phone || "",
      email: contractor.email || "",
      address: contractor.address || "",
      notes: contractor.notes || "",
      isPreferred: contractor.isPreferred || false,
      availabilityPattern: contractor.availabilityPattern || "weekdays",
      availableStartTime: contractor.availableStartTime || "09:00",
      availableEndTime: contractor.availableEndTime || "17:00",
      availableDays: contractor.availableDays || ["monday", "tuesday", "wednesday", "thursday", "friday"],
      responseTimeHours: contractor.responseTimeHours || 24,
      priorityScheduling: contractor.priorityScheduling || "standard",
      emergencyAvailable: contractor.emergencyAvailable || false,
      emergencyPhone: contractor.emergencyPhone || "",
      estimatedHourlyRate: contractor.estimatedHourlyRate ? parseFloat(contractor.estimatedHourlyRate) : undefined,
      specializations: contractor.specializations || [],
      maxJobsPerDay: contractor.maxJobsPerDay || 3,
      isActiveContractor: contractor.isActiveContractor ?? true,
    });
    setShowContractorForm(true);
  };

  const handleAddNew = () => {
    setEditingContractor(null);
    form.reset();
    setShowContractorForm(true);
  };

  // Filter contractors
  const filteredContractors = contractors.filter(contractor => {
    const matchesCategory = categoryFilter === "all" || contractor.category === categoryFilter;
    const matchesAvailability = availabilityFilter === "all" || contractor.availabilityPattern === availabilityFilter;
    const matchesSearch = searchQuery === "" || 
      contractor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (contractor.category && contractor.category.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return matchesCategory && matchesAvailability && matchesSearch;
  });

  const getAvailabilityBadge = (pattern: string) => {
    switch (pattern) {
      case "24_7": return <Badge className="bg-green-100 text-green-800">24/7 Available</Badge>;
      case "emergency_only": return <Badge className="bg-red-100 text-red-800">Emergency Only</Badge>;
      case "weekends": return <Badge className="bg-blue-100 text-blue-800">Weekends</Badge>;
      case "weekdays": return <Badge className="bg-gray-100 text-gray-800">Weekdays</Badge>;
      default: return <Badge variant="secondary">Custom</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "emergency": return <Badge className="bg-red-100 text-red-800"><Zap className="w-3 h-3 mr-1" />Emergency</Badge>;
      case "priority": return <Badge className="bg-yellow-100 text-yellow-800"><AlertTriangle className="w-3 h-3 mr-1" />Priority</Badge>;
      default: return <Badge variant="secondary">Standard</Badge>;
    }
  };

  useEffect(() => {
    if (error && isUnauthorizedError(error as Error)) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [error, toast]);

  return (
    <div className="flex h-screen bg-background" data-testid="page-campus-contractors">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Campus Contractors" />
        
        <main className="flex-1 overflow-auto p-6 bg-muted/30">
          {/* AI Assistant */}
          <PropertyAssistant 
            context="contractors"
            exampleQuestions={[
              "Which contractors are available for emergency HVAC repairs?",
              "Show me all plumbing contractors with 24/7 availability",
              "What's the average response time for electrical contractors?",
              "Which contractors have the highest ratings for dormitory work?"
            ]}
          />

          {/* Header Actions */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Campus Contractors</h1>
              <p className="text-muted-foreground">AI-powered contractor scheduling and maintenance coordination</p>
            </div>
            <Button onClick={handleAddNew} data-testid="button-add-contractor">
              <Plus className="h-4 w-4 mr-2" />
              Add Contractor
            </Button>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Input
              placeholder="Search contractors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-contractors"
            />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger data-testid="select-category-filter">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CONTRACTOR_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
              <SelectTrigger data-testid="select-availability-filter">
                <SelectValue placeholder="All Availability" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Availability</SelectItem>
                <SelectItem value="24_7">24/7 Available</SelectItem>
                <SelectItem value="weekdays">Weekdays Only</SelectItem>
                <SelectItem value="weekends">Weekends Only</SelectItem>
                <SelectItem value="emergency_only">Emergency Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Contractor Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-2xl font-bold">{contractors.length}</span>
                </div>
                <p className="text-sm text-muted-foreground">Total Contractors</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-green-600" />
                  <span className="text-2xl font-bold">{contractors.filter(c => c.availabilityPattern === "24_7").length}</span>
                </div>
                <p className="text-sm text-muted-foreground">24/7 Available</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Zap className="h-4 w-4 text-red-600" />
                  <span className="text-2xl font-bold">{contractors.filter(c => c.emergencyAvailable).length}</span>
                </div>
                <p className="text-sm text-muted-foreground">Emergency Ready</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Star className="h-4 w-4 text-yellow-600" />
                  <span className="text-2xl font-bold">{contractors.filter(c => c.isPreferred).length}</span>
                </div>
                <p className="text-sm text-muted-foreground">Preferred Partners</p>
              </CardContent>
            </Card>
          </div>

          {/* Contractors List */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {contractorsLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      <div className="h-4 bg-muted animate-pulse rounded" />
                      <div className="h-3 bg-muted animate-pulse rounded w-2/3" />
                      <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : filteredContractors.length === 0 ? (
              <div className="col-span-full text-center py-12">
                <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No contractors found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchQuery || categoryFilter !== "all" || availabilityFilter !== "all" 
                    ? "Try adjusting your filters" 
                    : "Add your first contractor to get started"}
                </p>
                <Button onClick={handleAddNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Contractor
                </Button>
              </div>
            ) : (
              filteredContractors.map((contractor) => (
                <Card key={contractor.id} className="hover:shadow-md transition-shadow" data-testid={`contractor-card-${contractor.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{contractor.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">{contractor.category}</p>
                      </div>
                      <div className="flex flex-col items-end space-y-1">
                        {contractor.isPreferred && <Badge className="bg-yellow-100 text-yellow-800"><Star className="w-3 h-3 mr-1" />Preferred</Badge>}
                        {contractor.isActiveContractor && <Badge className="bg-green-100 text-green-800">Active</Badge>}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="space-y-3">
                      {/* Availability */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Availability:</span>
                        {getAvailabilityBadge(contractor.availabilityPattern || "weekdays")}
                      </div>
                      
                      {/* Priority */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Priority:</span>
                        {getPriorityBadge(contractor.priorityScheduling || "standard")}
                      </div>

                      {/* Response Time */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Response Time:</span>
                        <span className="text-sm font-medium">{contractor.responseTimeHours || 24}h</span>
                      </div>

                      {/* Contact Info */}
                      {contractor.phone && (
                        <div className="flex items-center space-x-2">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{contractor.phone}</span>
                        </div>
                      )}

                      {/* Emergency Contact */}
                      {contractor.emergencyAvailable && contractor.emergencyPhone && (
                        <div className="flex items-center space-x-2">
                          <AlertTriangle className="h-3 w-3 text-red-600" />
                          <span className="text-sm text-red-600">Emergency: {contractor.emergencyPhone}</span>
                        </div>
                      )}

                      {/* Hourly Rate */}
                      {contractor.estimatedHourlyRate && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Rate:</span>
                          <span className="text-sm font-medium">${contractor.estimatedHourlyRate}/hr</span>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex space-x-2 pt-2">
                        <Button variant="outline" size="sm" onClick={() => handleEdit(contractor)} data-testid={`button-edit-${contractor.id}`}>
                          Edit
                        </Button>
                        <Button variant="outline" size="sm" data-testid={`button-schedule-${contractor.id}`}>
                          Schedule
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </main>
      </div>

      {/* Add/Edit Contractor Dialog */}
      <Dialog open={showContractorForm} onOpenChange={setShowContractorForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingContractor ? "Edit Contractor" : "Add New Contractor"}</DialogTitle>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="basic">Basic Info</TabsTrigger>
                  <TabsTrigger value="scheduling">Scheduling</TabsTrigger>
                  <TabsTrigger value="advanced">Advanced</TabsTrigger>
                </TabsList>
                
                <TabsContent value="basic" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contractor Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter contractor name" {...field} data-testid="input-contractor-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-contractor-category">
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {CONTRACTOR_CATEGORIES.map((category) => (
                                <SelectItem key={category} value={category}>{category}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input placeholder="(555) 123-4567" {...field} data-testid="input-contractor-phone" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input placeholder="contractor@example.com" {...field} data-testid="input-contractor-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Business address" {...field} data-testid="textarea-contractor-address" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                <TabsContent value="scheduling" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="availabilityPattern"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Availability Pattern</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-availability-pattern">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="weekdays">Weekdays Only</SelectItem>
                              <SelectItem value="weekends">Weekends Only</SelectItem>
                              <SelectItem value="24_7">24/7 Available</SelectItem>
                              <SelectItem value="emergency_only">Emergency Only</SelectItem>
                              <SelectItem value="custom">Custom Schedule</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="responseTimeHours"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Response Time (Hours)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min="1" 
                              max="168" 
                              {...field} 
                              onChange={(e) => field.onChange(Number(e.target.value))}
                              data-testid="input-response-time"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="availableStartTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Time</FormLabel>
                          <FormControl>
                            <Input type="time" {...field} data-testid="input-start-time" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="availableEndTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Time</FormLabel>
                          <FormControl>
                            <Input type="time" {...field} data-testid="input-end-time" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="priorityScheduling"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority Level</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-priority-scheduling">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="standard">Standard</SelectItem>
                            <SelectItem value="priority">Priority</SelectItem>
                            <SelectItem value="emergency">Emergency</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                <TabsContent value="advanced" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="estimatedHourlyRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hourly Rate ($)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min="0" 
                              step="0.01" 
                              placeholder="0.00"
                              {...field} 
                              onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                              data-testid="input-hourly-rate"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="maxJobsPerDay"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Jobs Per Day</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min="1" 
                              max="10" 
                              {...field} 
                              onChange={(e) => field.onChange(Number(e.target.value))}
                              data-testid="input-max-jobs"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="emergencyAvailable"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                          <div className="space-y-0.5">
                            <FormLabel>Emergency Services</FormLabel>
                            <div className="text-sm text-muted-foreground">Available for emergency calls</div>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-emergency-available"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {form.watch("emergencyAvailable") && (
                      <FormField
                        control={form.control}
                        name="emergencyPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Emergency Phone</FormLabel>
                            <FormControl>
                              <Input placeholder="Emergency contact number" {...field} data-testid="input-emergency-phone" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="isPreferred"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                          <div className="space-y-0.5">
                            <FormLabel>Preferred Contractor</FormLabel>
                            <div className="text-sm text-muted-foreground">Mark as preferred for priority scheduling</div>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-preferred-contractor"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="isActiveContractor"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                          <div className="space-y-0.5">
                            <FormLabel>Active Status</FormLabel>
                            <div className="text-sm text-muted-foreground">Currently accepting new jobs</div>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-active-contractor"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Additional notes about this contractor..." 
                            className="min-h-[100px]"
                            {...field} 
                            data-testid="textarea-contractor-notes"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
              </Tabs>

              <div className="flex justify-end space-x-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowContractorForm(false)}
                  data-testid="button-cancel-contractor"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createContractorMutation.isPending}
                  data-testid="button-save-contractor"
                >
                  {createContractorMutation.isPending ? "Saving..." : (editingContractor ? "Update" : "Save")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}