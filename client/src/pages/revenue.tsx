import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import RevenueForm from "@/components/forms/revenue-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DollarSign, Plus, Calendar, Building, Tag, Repeat, CheckCircle, Trash2, Grid3x3, List, ChevronDown } from "lucide-react";
import type { Transaction, Property, Unit } from "@shared/schema";

export default function Revenue() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [showRevenueForm, setShowRevenueForm] = useState(false);
  const [editingRevenue, setEditingRevenue] = useState<Transaction | null>(null);
  const [deleteRevenueId, setDeleteRevenueId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [unitFilter, setUnitFilter] = useState<string[]>([]);
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"list" | "schedule">("list");

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

  const { data: revenues, isLoading: revenuesLoading, error } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
    retry: false,
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    retry: false,
  });

  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ["/api/units"],
    retry: false,
  });

  const { data: entities = [] } = useQuery<{id: string; name: string}[]>({
    queryKey: ["/api/entities"],
    retry: false,
  });

  const createRevenueMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingRevenue) {
        const response = await apiRequest("PUT", `/api/revenues/${editingRevenue.id}`, data);
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/revenues", data);
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setShowRevenueForm(false);
      setEditingRevenue(null);
      toast({
        title: "Success",
        description: editingRevenue ? "Revenue updated successfully" : "Revenue logged successfully",
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
        description: editingRevenue ? "Failed to update revenue" : "Failed to log revenue",
        variant: "destructive",
      });
    },
  });

  const deleteRevenueMutation = useMutation({
    mutationFn: async (revenueId: string) => {
      const response = await apiRequest("DELETE", `/api/revenues/${revenueId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setDeleteRevenueId(null);
      toast({
        title: "Success",
        description: "Revenue deleted successfully",
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
        description: "Failed to delete revenue",
        variant: "destructive",
      });
    },
  });

  const updatePaymentStatusMutation = useMutation({
    mutationFn: async ({ transactionId, paymentStatus }: { transactionId: string; paymentStatus: string }) => {
      const response = await apiRequest("PATCH", `/api/transactions/${transactionId}/payment-status`, { paymentStatus });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({
        title: "Success",
        description: `Payment status updated to ${variables.paymentStatus}`,
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
        description: "Failed to update payment status",
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

  const revenueTransactions = revenues?.filter(t => t.type === "Income") || [];
  
  // Since properties can be owned by multiple entities (junction table relationship),
  // we show all properties in the dropdown regardless of entity filter.
  // The revenue filtering will still work correctly based on the revenue's entityId.
  const filteredProperties = properties;
    
  const filteredRevenues = revenueTransactions.filter(revenue => {
    const categoryMatch = categoryFilter === "all" || revenue.category === categoryFilter;
    const propertyMatch = propertyFilter === "all" || revenue.propertyId === propertyFilter;
    const entityMatch = entityFilter === "all" || revenue.entityId === entityFilter;
    
    // Unit filtering logic - only apply if unit filter is active
    let unitMatch = true;
    if (unitFilter.length > 0 && revenue.propertyId === propertyFilter) {
      unitMatch = false;
      
      // Check if revenue matches selected units
      if (revenue.unitId && unitFilter.includes(revenue.unitId)) {
        unitMatch = true;
      } else if (!revenue.unitId && unitFilter.includes("common")) {
        // Revenues without specific unit ID are considered common area
        unitMatch = true;
      }
    }
    
    return categoryMatch && propertyMatch && entityMatch && unitMatch;
  });

  const categories = Array.from(new Set(revenueTransactions.map(r => r.category).filter(Boolean)));
  const totalRevenues = filteredRevenues.reduce((sum, revenue) => sum + Number(revenue.amount), 0);
  const thisMonthRevenues = filteredRevenues.filter(revenue => {
    const revenueMonth = new Date(revenue.date).getMonth();
    const currentMonth = new Date().getMonth();
    return revenueMonth === currentMonth;
  }).reduce((sum, revenue) => sum + Number(revenue.amount), 0);

  const getCategoryColor = (category: string) => {
    const colors = {
      "Rental Income": "bg-green-100 text-green-800",
      "Advance Rent": "bg-blue-100 text-blue-800",
      "Security Deposits Kept": "bg-yellow-100 text-yellow-800",
      "Parking Fees": "bg-purple-100 text-purple-800",
      "Laundry Income": "bg-indigo-100 text-indigo-800",
      "Pet Rent": "bg-orange-100 text-orange-800",
      "Storage Fees": "bg-cyan-100 text-cyan-800",
      "Lease Cancellation Fees": "bg-red-100 text-red-800",
      "Other Income": "bg-gray-100 text-gray-800",
    };
    return colors[category as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="flex h-screen bg-background" data-testid="page-revenue">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Revenue" />
        
        <main className="flex-1 overflow-auto p-6 bg-muted/30">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">Revenue</h1>
              <p className="text-muted-foreground">Track rental income and other property revenue</p>
            </div>
            
            <div className="flex items-center space-x-3">
              {/* Entity Filter - First */}
              <Select value={entityFilter} onValueChange={(value) => {
                setEntityFilter(value);
                // Reset property filter when entity changes
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

              {/* Property Filter - Second, filtered by entity */}
              <Select value={propertyFilter} onValueChange={(value) => {
                setPropertyFilter(value);
                setUnitFilter([]); // Reset unit filter when property changes
              }}>
                <SelectTrigger className="w-52" data-testid="select-property-filter">
                  <SelectValue placeholder="All Properties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Properties</SelectItem>
                  {filteredProperties.map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.name || `${property.street}, ${property.city}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Unit Selection - only show for buildings with multiple units */}
              {propertyFilter !== "all" && (() => {
                const selectedProperty = properties?.find(p => p.id === propertyFilter);
                const propertyUnits = units.filter(unit => unit.propertyId === propertyFilter);
                const isBuilding = propertyUnits.length > 1;
                
                if (!isBuilding) return null;

                const handleUnitToggle = (unitId: string) => {
                  const newFilter = [...unitFilter];
                  if (newFilter.includes(unitId)) {
                    setUnitFilter(newFilter.filter(id => id !== unitId));
                  } else {
                    setUnitFilter([...newFilter, unitId]);
                  }
                };
                
                return (
                  <div className="flex flex-col space-y-2 p-3 border rounded-md bg-muted/30">
                    <span className="text-sm font-medium">Units (Optional - leave empty to show all)</span>
                    <div className="grid grid-cols-2 gap-2 max-h-24 overflow-y-auto">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={unitFilter.includes("common")}
                          onChange={() => handleUnitToggle("common")}
                          className="rounded border-gray-300"
                          data-testid="checkbox-common-area"
                        />
                        <span className="text-sm">Common Area</span>
                      </label>
                      {propertyUnits.map((unit) => (
                        <label key={unit.id} className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={unitFilter.includes(unit.id)}
                            onChange={() => handleUnitToggle(unit.id)}
                            className="rounded border-gray-300"
                            data-testid={`checkbox-unit-${unit.id}`}
                          />
                          <span className="text-sm">{unit.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Category Filter - Third */}
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

              <Dialog open={showRevenueForm} onOpenChange={setShowRevenueForm}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-revenue">
                    <Plus className="h-4 w-4 mr-2" />
                    Log Revenue
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{editingRevenue ? "Edit Revenue" : "Log New Revenue"}</DialogTitle>
                  </DialogHeader>
                  <RevenueForm 
                    properties={properties}
                    units={units}
                    entities={entities}
                    revenue={editingRevenue}
                    onSubmit={(data) => createRevenueMutation.mutate(data)}
                    onClose={() => {
                      setShowRevenueForm(false);
                      setEditingRevenue(null);
                    }}
                    isLoading={createRevenueMutation.isPending}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card data-testid="card-total-revenue">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Total Revenue</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-total-revenue">
                      ${totalRevenues.toLocaleString()}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card data-testid="card-month-revenue">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">This Month</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-month-revenue">
                      ${thisMonthRevenues.toLocaleString()}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Calendar className="text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card data-testid="card-revenue-count">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Total Transactions</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-revenue-count">
                      {filteredRevenues.length}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Building className="text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* View Toggle Tabs */}
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as "list" | "schedule")} className="space-y-6">
            <TabsList className="grid w-full max-w-[400px] grid-cols-2">
              <TabsTrigger value="list" className="flex items-center gap-2" data-testid="tab-list-view">
                <List className="h-4 w-4" />
                List View
              </TabsTrigger>
              <TabsTrigger value="schedule" className="flex items-center gap-2" data-testid="tab-schedule-view">
                <Grid3x3 className="h-4 w-4" />
                Schedule View
              </TabsTrigger>
            </TabsList>

            {/* List View */}
            <TabsContent value="list" className="space-y-0">
              {revenuesLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Card key={i} data-testid={`skeleton-revenue-${i}`}>
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
              ) : filteredRevenues.length > 0 ? (
                <div className="space-y-4">
                  {filteredRevenues.map((revenue, index) => (
                <Card key={revenue.id} className="hover:shadow-md transition-shadow" data-testid={`card-revenue-${index}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                          <DollarSign className="h-6 w-6 text-green-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground" data-testid={`text-revenue-description-${index}`}>
                            {revenue.description}
                          </h3>
                          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                            <span data-testid={`text-revenue-date-${index}`}>
                              {new Date(revenue.date).toLocaleDateString()}
                            </span>
                            {revenue.category && (
                              <Badge className={getCategoryColor(revenue.category)} data-testid={`badge-revenue-category-${index}`}>
                                {revenue.category}
                              </Badge>
                            )}
                            {revenue.isRecurring && (
                              <Badge variant="outline" className="text-blue-600 border-blue-600" data-testid={`badge-recurring-${index}`}>
                                <Repeat className="h-3 w-3 mr-1" />
                                {revenue.recurringFrequency}
                              </Badge>
                            )}
                            {revenue.parentRecurringId && (
                              <Badge variant="outline" className="text-purple-600 border-purple-600" data-testid={`badge-recurring-instance-${index}`}>
                                Auto-generated
                              </Badge>
                            )}
                            {revenue.taxDeductible === false && (
                              <Badge variant="outline" className="text-orange-600 border-orange-600" data-testid={`badge-non-taxable-${index}`}>
                                Non-taxable
                              </Badge>
                            )}
                            {revenue.paymentStatus && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Badge 
                                    variant="outline" 
                                    className={`cursor-pointer hover:opacity-80 ${
                                      revenue.paymentStatus === 'Paid' ? "text-green-600 border-green-600" :
                                      revenue.paymentStatus === 'Partial' ? "text-yellow-600 border-yellow-600" :
                                      revenue.paymentStatus === 'Skipped' ? "text-gray-600 border-gray-600" :
                                      "text-orange-600 border-orange-600"
                                    }`}
                                    data-testid={`badge-payment-status-${index}`}
                                  >
                                    {revenue.paymentStatus}
                                    <ChevronDown className="h-3 w-3 ml-1" />
                                  </Badge>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => updatePaymentStatusMutation.mutate({
                                      transactionId: revenue.id,
                                      paymentStatus: 'Paid'
                                    })}
                                    className="text-green-600"
                                    data-testid={`menu-item-paid-${index}`}
                                  >
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Mark as Paid
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => updatePaymentStatusMutation.mutate({
                                      transactionId: revenue.id,
                                      paymentStatus: 'Partial'
                                    })}
                                    className="text-yellow-600"
                                    data-testid={`menu-item-partial-${index}`}
                                  >
                                    Partial Payment
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => updatePaymentStatusMutation.mutate({
                                      transactionId: revenue.id,
                                      paymentStatus: 'Unpaid'
                                    })}
                                    className="text-orange-600"
                                    data-testid={`menu-item-unpaid-${index}`}
                                  >
                                    Mark as Unpaid
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => updatePaymentStatusMutation.mutate({
                                      transactionId: revenue.id,
                                      paymentStatus: 'Skipped'
                                    })}
                                    className="text-gray-600"
                                    data-testid={`menu-item-skipped-${index}`}
                                  >
                                    Skip Payment
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <p className="text-xl font-bold text-foreground" data-testid={`text-revenue-amount-${index}`}>
                            ${Number(revenue.amount).toLocaleString()}
                          </p>
                          <div className="text-sm text-muted-foreground">
                            {revenue.scope === 'property' && revenue.propertyId && (
                              <>
                                <p data-testid={`text-revenue-scope-${index}`}>Property</p>
                                <p data-testid={`text-revenue-property-${index}`}>
                                  {(() => {
                                    const property = properties.find(p => p.id === revenue.propertyId);
                                    return property ? (property.name || `${property.street}, ${property.city}`) : 'Property';
                                  })()}
                                </p>
                              </>
                            )}
                            {revenue.scope === 'operational' && (
                              <>
                                <p data-testid={`text-revenue-scope-${index}`}>Operational</p>
                                <p data-testid={`text-revenue-entity-${index}`}>
                                  {entities.find(e => e.id === revenue.entityId)?.name || 'Entity'}
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingRevenue(revenue);
                              setShowRevenueForm(true);
                            }}
                            data-testid={`button-edit-revenue-${index}`}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteRevenueId(revenue.id)}
                            data-testid={`button-delete-revenue-${index}`}
                            className="text-red-600 hover:text-red-700 hover:border-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    {revenue.notes && (
                      <p className="text-sm text-muted-foreground mt-3 pl-16" data-testid={`text-revenue-notes-${index}`}>
                        {revenue.notes}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2" data-testid="text-no-revenue">No Revenue Logged</h3>
                <p className="text-muted-foreground mb-4">Start tracking your rental income and property revenue for better financial management.</p>
                <Button onClick={() => setShowRevenueForm(true)} data-testid="button-add-first-revenue">
                  <Plus className="h-4 w-4 mr-2" />
                  Log Your First Revenue
                </Button>
              </CardContent>
            </Card>
          )}
            </TabsContent>

            {/* Schedule View */}
            <TabsContent value="schedule" className="space-y-0">
              <div className="space-y-6">
                {/* Calendar-style recurring revenue schedule */}
                {(() => {
                  const recurringRevenues = filteredRevenues.filter(r => r.isRecurring);
                  const currentDate = new Date();
                  const months = [];
                  
                  // Generate 6 months from current date
                  for (let i = -2; i < 4; i++) {
                    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
                    months.push({
                      year: date.getFullYear(),
                      month: date.getMonth(),
                      name: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                    });
                  }

                  if (recurringRevenues.length === 0) {
                    return (
                      <Card>
                        <CardContent className="p-12 text-center">
                          <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <h3 className="text-lg font-semibold text-foreground mb-2">No Recurring Revenue</h3>
                          <p className="text-muted-foreground mb-4">Set up recurring revenue entries to see your monthly payment schedule here.</p>
                          <Button onClick={() => setShowRevenueForm(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Recurring Revenue
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  }

                  return (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                      {months.map((month) => {
                        // Find actual transactions for this month
                        const monthTransactions = filteredRevenues.filter(t => {
                          const transactionDate = new Date(t.date);
                          return transactionDate.getFullYear() === month.year && 
                                 transactionDate.getMonth() === month.month &&
                                 t.isRecurring;
                        });

                        const monthlyTotal = monthTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
                        const expectedTotal = recurringRevenues.reduce((sum, r) => sum + Number(r.amount), 0);

                        return (
                          <Card key={`${month.year}-${month.month}`} className="h-fit">
                            <CardHeader className="pb-3">
                              <CardTitle className="text-lg flex items-center justify-between">
                                {month.name}
                                <Badge variant="outline" className={monthlyTotal >= expectedTotal ? "text-green-600 border-green-600" : "text-orange-600 border-orange-600"}>
                                  ${monthlyTotal.toLocaleString()}
                                </Badge>
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {recurringRevenues.map((recurringRevenue) => {
                                // Find actual transaction for this recurring revenue in this month
                                const actualTransaction = monthTransactions.find(t => 
                                  t.parentRecurringId === recurringRevenue.id || t.id === recurringRevenue.id
                                );
                                
                                const paymentStatus = actualTransaction?.paymentStatus || 'Unpaid';
                                const isCurrentMonth = month.year === currentDate.getFullYear() && month.month === currentDate.getMonth();
                                const isPastDue = new Date(month.year, month.month, 15) < currentDate && paymentStatus === 'Unpaid';
                                
                                return (
                                  <div key={`${month.year}-${month.month}-${recurringRevenue.id}`} 
                                       className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="flex-1">
                                      <div className="font-medium text-sm">{recurringRevenue.description}</div>
                                      <div className="text-xs text-muted-foreground">
                                        ${Number(recurringRevenue.amount).toLocaleString()}
                                      </div>
                                    </div>
                                    {actualTransaction ? (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Badge 
                                            variant="outline" 
                                            className={`cursor-pointer hover:opacity-80 ${
                                              paymentStatus === 'Paid' ? "text-green-600 border-green-600" :
                                              paymentStatus === 'Partial' ? "text-yellow-600 border-yellow-600" :
                                              paymentStatus === 'Skipped' ? "text-gray-600 border-gray-600" :
                                              isPastDue ? "text-red-600 border-red-600" :
                                              "text-orange-600 border-orange-600"
                                            }`}
                                          >
                                            {isPastDue && paymentStatus === 'Unpaid' ? 'Overdue' : paymentStatus}
                                            <ChevronDown className="h-3 w-3 ml-1" />
                                          </Badge>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem
                                            onClick={() => updatePaymentStatusMutation.mutate({
                                              transactionId: actualTransaction.id,
                                              paymentStatus: 'Paid'
                                            })}
                                            className="text-green-600"
                                          >
                                            <CheckCircle className="h-4 w-4 mr-2" />
                                            Mark as Paid
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => updatePaymentStatusMutation.mutate({
                                              transactionId: actualTransaction.id,
                                              paymentStatus: 'Partial'
                                            })}
                                            className="text-yellow-600"
                                          >
                                            Partial Payment
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => updatePaymentStatusMutation.mutate({
                                              transactionId: actualTransaction.id,
                                              paymentStatus: 'Unpaid'
                                            })}
                                            className="text-orange-600"
                                          >
                                            Mark as Unpaid
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => updatePaymentStatusMutation.mutate({
                                              transactionId: actualTransaction.id,
                                              paymentStatus: 'Skipped'
                                            })}
                                            className="text-gray-600"
                                          >
                                            Skip Payment
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    ) : (
                                      <Badge variant="outline" className="text-gray-600 border-gray-600">
                                        No Transaction
                                      </Badge>
                                    )}
                                  </div>
                                );
                              })}
                              
                              {monthTransactions.length === 0 && (
                                <div className="text-center py-4 text-muted-foreground text-sm">
                                  No transactions recorded
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteRevenueId} onOpenChange={() => setDeleteRevenueId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Revenue</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this revenue entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (deleteRevenueId) {
                  deleteRevenueMutation.mutate(deleteRevenueId);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}