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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Wrench, AlertTriangle, Clock, CheckCircle, XCircle } from "lucide-react";
import type { SmartCase, Property, OwnershipEntity, Unit } from "@shared/schema";

const createCaseSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  propertyId: z.string().optional(),
  unitId: z.string().optional(),
  priority: z.enum(["Low", "Medium", "High", "Urgent"]).default("Medium"),
  category: z.string().optional(),
});

export default function Maintenance() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [showCaseForm, setShowCaseForm] = useState(false);
  const [editingCase, setEditingCase] = useState<SmartCase | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");

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

  const { data: smartCases, isLoading: casesLoading, error } = useQuery<SmartCase[]>({
    queryKey: ["/api/cases"],
    retry: false,
  });

  const { data: properties } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    retry: false,
  });

  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ["/api/units"],
    retry: false,
  });

  const { data: entities = [] } = useQuery<OwnershipEntity[]>({
    queryKey: ["/api/entities"],
    retry: false,
  });

  const selectedProperty = properties?.find(p => p.id === selectedPropertyId);
  const selectedPropertyUnits = units.filter(unit => unit.propertyId === selectedPropertyId);
  const isBuilding = selectedProperty?.type === "Commercial Building" || selectedProperty?.type === "Residential Building";
  const isMultiUnit = selectedPropertyUnits.length > 1;
  
  // Update selectedPropertyId when editing a case
  useEffect(() => {
    if (editingCase?.propertyId) {
      setSelectedPropertyId(editingCase.propertyId);
    } else {
      setSelectedPropertyId("");
    }
  }, [editingCase]);

  const form = useForm<z.infer<typeof createCaseSchema>>({
    resolver: zodResolver(createCaseSchema),
    defaultValues: editingCase ? {
      title: editingCase.title || "",
      description: editingCase.description || "",
      propertyId: editingCase.propertyId || "",
      unitId: editingCase.unitId || "",
      priority: editingCase.priority || "Medium",
      category: editingCase.category || "",
    } : {
      title: "",
      description: "",
      priority: "Medium",
    },
  });

  const createCaseMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createCaseSchema>) => {
      const response = await apiRequest("POST", "/api/cases", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      setShowCaseForm(false);
      setEditingCase(null);
      form.reset();
      toast({
        title: "Success",
        description: "Maintenance case created successfully",
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
        description: "Failed to create maintenance case",
        variant: "destructive",
      });
    },
  });

  const updateCaseMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: z.infer<typeof createCaseSchema> }) => {
      const response = await apiRequest("PATCH", `/api/cases/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      setShowCaseForm(false);
      setEditingCase(null);
      form.reset();
      toast({
        title: "Success",
        description: "Maintenance case updated successfully",
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
        description: "Failed to update maintenance case",
        variant: "destructive",
      });
    },
  });

  const updateCaseStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/cases/${id}`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cases"] });
      toast({
        title: "Success",
        description: "Case status updated successfully",
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
        description: "Failed to update case status",
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

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "New": return <AlertTriangle className="h-4 w-4 text-blue-600" />;
      case "In Review": return <Clock className="h-4 w-4 text-yellow-600" />;
      case "Scheduled": return <Clock className="h-4 w-4 text-orange-600" />;
      case "In Progress": return <Wrench className="h-4 w-4 text-yellow-600" />;
      case "On Hold": return <XCircle className="h-4 w-4 text-gray-600" />;
      case "Resolved": return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "Closed": return <CheckCircle className="h-4 w-4 text-green-600" />;
      default: return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "New": return <Badge className="bg-blue-100 text-blue-800">New</Badge>;
      case "In Progress": return <Badge className="bg-yellow-100 text-yellow-800">In Progress</Badge>;
      case "Resolved": return <Badge className="bg-green-100 text-green-800">Resolved</Badge>;
      case "Closed": return <Badge className="bg-green-100 text-green-800">Closed</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string | null) => {
    switch (priority) {
      case "Urgent": return <Badge className="bg-red-100 text-red-800">Urgent</Badge>;
      case "High": return <Badge className="bg-orange-100 text-orange-800">High</Badge>;
      case "Medium": return <Badge className="bg-yellow-100 text-yellow-800">Medium</Badge>;
      case "Low": return <Badge className="bg-gray-100 text-gray-800">Low</Badge>;
      default: return <Badge variant="secondary">{priority}</Badge>;
    }
  };

  const filteredProperties = properties || [];
  
  const filteredCases = smartCases?.filter(smartCase => {
    const statusMatch = statusFilter === "all" || smartCase.status === statusFilter;
    const propertyMatch = propertyFilter === "all" || smartCase.propertyId === propertyFilter;
    const categoryMatch = categoryFilter === "all" || smartCase.category === categoryFilter;
    const unitMatch = unitFilter === "all" || smartCase.unitId === unitFilter;
    // Note: SmartCase doesn't have entityId directly, but we can filter by property's entity relationship if needed
    return statusMatch && propertyMatch && categoryMatch && unitMatch;
  }) || [];

  const categories = Array.from(new Set(smartCases?.map(c => c.category).filter(Boolean))) || [];

  const onSubmit = (data: z.infer<typeof createCaseSchema>) => {
    if (editingCase) {
      updateCaseMutation.mutate({ id: editingCase.id, data });
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

  return (
    <div className="flex h-screen bg-background" data-testid="page-maintenance">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Maintenance" />
        
        <main className="flex-1 overflow-auto p-6 bg-muted/30">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">Smart Cases</h1>
              <p className="text-muted-foreground">Track and manage maintenance requests</p>
            </div>
            
            <div className="flex items-center space-x-3">
              {/* Entity Filter */}
              <Select value={entityFilter} onValueChange={(value) => {
                setEntityFilter(value);
                if (value !== "all") {
                  setPropertyFilter("all");
                }
              }}>
                <SelectTrigger className="w-44" data-testid="select-entity-filter">
                  <SelectValue placeholder="All Entities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Entities</SelectItem>
                  {entities.map((entity) => (
                    <SelectItem key={entity.id} value={entity.id}>{entity.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Property Filter */}
              <Select value={propertyFilter} onValueChange={(value) => {
                setPropertyFilter(value);
                setUnitFilter("all"); // Reset unit filter when property changes
              }}>
                <SelectTrigger className="w-52" data-testid="select-property-filter">
                  <SelectValue placeholder="All Properties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Properties</SelectItem>
                  {filteredProperties.map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.street}, {property.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Unit Filter - only show for buildings with multiple units */}
              {propertyFilter !== "all" && (() => {
                const selectedProperty = properties?.find(p => p.id === propertyFilter);
                const propertyUnits = units.filter(unit => unit.propertyId === propertyFilter);
                const isBuilding = propertyUnits.length > 1;
                
                if (!isBuilding) return null;
                
                return (
                  <Select value={unitFilter} onValueChange={setUnitFilter}>
                    <SelectTrigger className="w-48" data-testid="select-unit-filter">
                      <SelectValue placeholder="All Units" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Entire Building</SelectItem>
                      {propertyUnits.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              })()}

              {/* Category Filter */}
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-44" data-testid="select-category-filter">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category!}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40" data-testid="select-status-filter">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="New">New</SelectItem>
                  <SelectItem value="In Review">In Review</SelectItem>
                  <SelectItem value="Scheduled">Scheduled</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="On Hold">On Hold</SelectItem>
                  <SelectItem value="Resolved">Resolved</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>

              <Dialog open={showCaseForm} onOpenChange={handleDialogChange}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-case">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Case
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{editingCase ? "Edit Maintenance Case" : "Create Maintenance Case"}</DialogTitle>
                  </DialogHeader>
                  
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Describe the issue" 
                                value={field.value || ""}
                                onChange={field.onChange}
                                onBlur={field.onBlur}
                                name={field.name}
                                data-testid="input-case-title" 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Provide additional details..." 
                                value={field.value || ""}
                                onChange={field.onChange}
                                onBlur={field.onBlur}
                                name={field.name}
                                data-testid="textarea-case-description" 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="propertyId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Property</FormLabel>
                            <Select 
                              onValueChange={(value) => {
                                field.onChange(value);
                                setSelectedPropertyId(value);
                                form.setValue("unitId", "");
                              }} 
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-case-property">
                                  <SelectValue placeholder="Select a property" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {properties?.map((property) => (
                                  <SelectItem key={property.id} value={property.id}>
                                    {property.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Unit Selection - only show if property is selected, is a building type, and has units */}
                      {selectedPropertyId && isBuilding && selectedPropertyUnits.length > 0 && (
                        <FormField
                          control={form.control}
                          name="unitId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{isMultiUnit ? "Area/Unit" : "Apply to"}</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-case-unit">
                                    <SelectValue placeholder={`Select ${isMultiUnit ? "area or unit" : "application"}`} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="common">Common Areas/Building</SelectItem>
                                  {selectedPropertyUnits.map((unit) => (
                                    <SelectItem key={unit.id} value={unit.id}>
                                      {unit.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      <FormField
                        control={form.control}
                        name="priority"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Priority</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-case-priority">
                                  <SelectValue placeholder="Select priority" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Low">Low</SelectItem>
                                <SelectItem value="Medium">Medium</SelectItem>
                                <SelectItem value="High">High</SelectItem>
                                <SelectItem value="Urgent">Urgent</SelectItem>
                              </SelectContent>
                            </Select>
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
                            <FormControl>
                              <Input 
                                placeholder="e.g., Plumbing, Electrical, HVAC" 
                                value={field.value || ""}
                                onChange={field.onChange}
                                onBlur={field.onBlur}
                                name={field.name}
                                data-testid="input-case-category" 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex justify-end space-x-2">
                        <Button type="button" variant="outline" onClick={handleCloseForm} data-testid="button-cancel-case">
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createCaseMutation.isPending || updateCaseMutation.isPending} data-testid="button-submit-case">
                          {(createCaseMutation.isPending || updateCaseMutation.isPending) 
                            ? (editingCase ? "Updating..." : "Creating...") 
                            : (editingCase ? "Update Case" : "Create Case")
                          }
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {casesLoading ? (
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
          ) : filteredCases.length > 0 ? (
            <div className="grid grid-cols-1 gap-6">
              {filteredCases.map((smartCase, index) => (
                <Card key={smartCase.id} className="hover:shadow-md transition-shadow" data-testid={`card-case-${index}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                          {getStatusIcon(smartCase.status)}
                        </div>
                        <div>
                          <CardTitle className="text-lg" data-testid={`text-case-title-${index}`}>{smartCase.title}</CardTitle>
                          {smartCase.category && (
                            <p className="text-sm text-muted-foreground" data-testid={`text-case-category-${index}`}>
                              {smartCase.category}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {getPriorityBadge(smartCase.priority)}
                        {getStatusBadge(smartCase.status)}
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    {smartCase.description && (
                      <p className="text-sm text-muted-foreground mb-4" data-testid={`text-case-description-${index}`}>
                        {smartCase.description}
                      </p>
                    )}
                    
                    <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
                      <div>
                        <span data-testid={`text-case-created-${index}`}>
                          Created {smartCase.createdAt ? new Date(smartCase.createdAt).toLocaleDateString() : 'Unknown'}
                        </span>
                        {smartCase.propertyId && (
                          <div className="mt-1">
                            <span className="text-blue-600 font-medium">Property:</span>
                            <span className="ml-1" data-testid={`text-case-property-${index}`}>
                              {(() => {
                                const property = properties?.find(p => p.id === smartCase.propertyId);
                                return property ? `${property.street}, ${property.city}` : 'Property';
                              })()}
                            </span>
                          </div>
                        )}
                      </div>
                      {smartCase.estimatedCost && (
                        <span data-testid={`text-case-cost-${index}`}>
                          Est. Cost: ${Number(smartCase.estimatedCost).toLocaleString()}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex space-x-2">
                      {smartCase.status !== "Resolved" && smartCase.status !== "Closed" && (
                        <>
                          {smartCase.status === "New" && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => updateCaseStatusMutation.mutate({ id: smartCase.id, status: "In Review" })}
                              data-testid={`button-review-case-${index}`}
                            >
                              Start Review
                            </Button>
                          )}
                          {(smartCase.status === "In Review" || smartCase.status === "Scheduled") && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => updateCaseStatusMutation.mutate({ id: smartCase.id, status: "In Progress" })}
                              data-testid={`button-start-case-${index}`}
                            >
                              Start Work
                            </Button>
                          )}
                          {smartCase.status === "In Progress" && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => updateCaseStatusMutation.mutate({ id: smartCase.id, status: "Resolved" })}
                              data-testid={`button-resolve-case-${index}`}
                            >
                              Mark Resolved
                            </Button>
                          )}
                        </>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleEditCase(smartCase)}
                        data-testid={`button-edit-case-${index}`}
                      >
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" data-testid={`button-view-case-${index}`}>
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
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
          )}
        </main>
      </div>
    </div>
  );
}
