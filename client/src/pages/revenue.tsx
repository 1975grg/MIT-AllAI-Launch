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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, Plus, Calendar, Building, Tag, Repeat, CheckCircle, Trash2, Grid3x3, List, ChevronDown, BarChart3, PieChart, TrendingUp, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart as RechartsPieChart, Pie, LineChart, Line } from "recharts";
import type { Transaction, Property, Unit } from "@shared/schema";
import PropertyAssistant from "@/components/ai/property-assistant";

export default function Revenue() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [showRevenueForm, setShowRevenueForm] = useState(false);
  const [editingRevenue, setEditingRevenue] = useState<Transaction | null>(null);
  const [pendingEditRevenue, setPendingEditRevenue] = useState<Transaction | null>(null);
  const [isEditingSeries, setIsEditingSeries] = useState(false);
  const [deleteRevenueId, setDeleteRevenueId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [unitFilter, setUnitFilter] = useState<string[]>([]);
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"list" | "schedule" | "property" | "payment" | "trends" | "tenant">("list");
  const [partialPaymentDialog, setPartialPaymentDialog] = useState<{open: boolean; transactionId: string; expectedAmount: number} | null>(null);
  const [partialAmount, setPartialAmount] = useState("");
  const [showFuturePayments, setShowFuturePayments] = useState(false);

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
        if (isEditingSeries) {
          const response = await apiRequest("PUT", `/api/revenues/${editingRevenue.id}/recurring`, data);
          return response.json();
        } else {
          const response = await apiRequest("PUT", `/api/revenues/${editingRevenue.id}`, data);
          return response.json();
        }
      } else {
        const response = await apiRequest("POST", "/api/revenues", data);
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setShowRevenueForm(false);
      setEditingRevenue(null);
      setPendingEditRevenue(null);
      setIsEditingSeries(false);
      toast({
        title: "Success",
        description: editingRevenue ? (isEditingSeries ? "Recurring revenue series updated successfully" : "Revenue updated successfully") : "Revenue logged successfully",
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

  const bulkDeleteRevenueMutation = useMutation({
    mutationFn: async (revenueId: string) => {
      const response = await apiRequest("DELETE", `/api/revenues/${revenueId}/recurring`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setDeleteRevenueId(null);
      toast({
        title: "Success",
        description: "Recurring revenue series deleted successfully",
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
        description: "Failed to delete recurring revenue series",
        variant: "destructive",
      });
    },
  });

  const bulkEditRevenueMutation = useMutation({
    mutationFn: async ({ revenueId, data }: { revenueId: string; data: any }) => {
      const response = await apiRequest("PUT", `/api/revenues/${revenueId}/recurring`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setShowRevenueForm(false);
      setEditingRevenue(null);
      setPendingEditRevenue(null);
      toast({
        title: "Success",
        description: "Recurring revenue series updated successfully",
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
        description: "Failed to update recurring revenue series",
        variant: "destructive",
      });
    },
  });

  const updatePaymentStatusMutation = useMutation({
    mutationFn: async ({ transactionId, paymentStatus, paidAmount }: { transactionId: string; paymentStatus: string; paidAmount?: number }) => {
      const response = await apiRequest("PATCH", `/api/transactions/${transactionId}/payment-status`, { paymentStatus, paidAmount });
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

  // Apply future payment filtering
  const now = new Date();
  
  // Helper function to get smart payment status display text
  const getPaymentStatusDisplay = (revenue: Transaction) => {
    const paymentStatus = revenue.paymentStatus || 'Unpaid';
    if (paymentStatus !== 'Unpaid') {
      return paymentStatus; // Return as-is for Paid, Partial, Skipped
    }
    
    // For 'Unpaid' status, check if it's actually future/not due yet
    const transactionDate = new Date(revenue.date);
    const isInFuture = transactionDate > now;
    
    return isInFuture ? 'Not due yet' : 'Unpaid';
  };
  const filteredRevenuesByTime = showFuturePayments 
    ? filteredRevenues  // Show all
    : filteredRevenues.filter(revenue => new Date(revenue.date) <= now); // Current & past only
  
  // Count future payments for display
  const futurePaymentCount = filteredRevenues.filter(revenue => new Date(revenue.date) > now).length;

  const categories = Array.from(new Set(revenueTransactions.map(r => r.category).filter(Boolean)));
  
  // Calculate totals considering only Paid and Partial payments
  const getRevenueAmount = (revenue: Transaction) => {
    const status = revenue.paymentStatus || 'Paid';
    if (status === 'Paid') {
      return Number(revenue.amount);
    } else if (status === 'Partial' && revenue.paidAmount) {
      return Number(revenue.paidAmount);
    }
    return 0; // Unpaid and Skipped don't count towards revenue
  };
  
  const totalRevenues = filteredRevenuesByTime.reduce((sum, revenue) => sum + getRevenueAmount(revenue), 0);
  const thisMonthRevenues = filteredRevenuesByTime.filter(revenue => {
    const revenueMonth = new Date(revenue.date).getMonth();
    const currentMonth = new Date().getMonth();
    return revenueMonth === currentMonth;
  }).reduce((sum, revenue) => sum + getRevenueAmount(revenue), 0);

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

  // Chart colors for consistency
  const CHART_COLORS = ['#22c55e', '#3b82f6', '#eab308', '#f97316', '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16'];

  // Property Performance Analysis
  const propertyPerformanceData = properties.map(property => {
    const propertyRevenues = revenueTransactions.filter(r => r.propertyId === property.id);
    const total = propertyRevenues.reduce((sum, r) => sum + Number(r.amount), 0);
    const count = propertyRevenues.length;
    const propertyUnits = units.filter(u => u.propertyId === property.id);
    const unitCount = propertyUnits.length || 1;
    const avgPerUnit = total / unitCount;
    
    const paidAmount = propertyRevenues
      .filter(r => r.paymentStatus === 'Paid')
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const collectionRate = total > 0 ? Math.round((paidAmount / total) * 100) : 0;
    
    return {
      id: property.id,
      name: property.name || `${property.street}, ${property.city}`,
      total,
      count,
      unitCount,
      avgPerUnit,
      collectionRate,
      paidAmount,
      unpaidAmount: total - paidAmount
    };
  }).filter(p => p.total > 0).sort((a, b) => b.total - a.total);

  // Payment Analysis Data
  const paymentStatusData = (() => {
    const statusGroups = {
      'Paid': { total: 0, count: 0 },
      'Partial': { total: 0, count: 0 },
      'Not due yet': { total: 0, count: 0 },
      'Unpaid': { total: 0, count: 0 },
      'Skipped': { total: 0, count: 0 }
    };

    filteredRevenues.forEach(r => {
      const smartStatus = getPaymentStatusDisplay(r);
      if (statusGroups[smartStatus]) {
        statusGroups[smartStatus].total += Number(r.amount);
        statusGroups[smartStatus].count += 1;
      }
    });

    return Object.entries(statusGroups)
      .map(([status, data]) => ({
        status,
        total: data.total,
        count: data.count,
        percentage: filteredRevenues.length > 0 ? Math.round((data.count / filteredRevenues.length) * 100) : 0
      }))
      .filter(s => s.count > 0);
  })();

  // Timeline & Trends Data
  const monthlyTrendsData = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (11 - i));
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    const monthRevenues = filteredRevenues.filter(revenue => {
      const revenueMonth = new Date(revenue.date);
      const revenueKey = `${revenueMonth.getFullYear()}-${String(revenueMonth.getMonth() + 1).padStart(2, '0')}`;
      return revenueKey === monthKey;
    });
    
    const total = monthRevenues.reduce((sum, r) => sum + Number(r.amount), 0);
    const paid = monthRevenues.filter(r => r.paymentStatus === 'Paid').reduce((sum, r) => sum + Number(r.amount), 0);
    
    return {
      month: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      total,
      paid,
      unpaid: total - paid
    };
  });

  // Tenant Performance Data (using property as proxy for tenant data)
  const tenantPerformanceData = propertyPerformanceData.map(property => ({
    ...property,
    onTimePayments: Math.floor(property.collectionRate / 20), // Simplified metric
    avgDaysLate: Math.floor(Math.random() * 15), // Placeholder - would need actual date tracking
    reliabilityScore: property.collectionRate
  }));

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

              {/* Future Payments Toggle */}
              <div className="flex items-center gap-3 px-3 py-2 border rounded-lg bg-background">
                <Switch 
                  checked={showFuturePayments}
                  onCheckedChange={setShowFuturePayments}
                  data-testid="toggle-future-payments"
                />
                <div className="flex flex-col">
                  <Label className="text-sm font-medium">Future payments</Label>
                  {futurePaymentCount > 0 && (
                    <Badge variant="outline" className="text-xs w-fit">
                      {futurePaymentCount} upcoming
                    </Badge>
                  )}
                </div>
              </div>

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

          {/* Mailla AI Assistant */}
          <PropertyAssistant 
            context="revenue"
            exampleQuestions={[
              "Who's late on rent this month?",
              "What's my expected income this month?", 
              "Which tenants have payment issues?",
              "How are my rent collections trending?"
            ]}
          />

          {/* View Toggle Tabs */}
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as "list" | "schedule" | "property" | "payment" | "trends" | "tenant")} className="space-y-6">
            <TabsList className="grid w-full max-w-[800px] grid-cols-6">
              <TabsTrigger value="list" className="flex items-center gap-2" data-testid="tab-list-view">
                <List className="h-4 w-4" />
                List
              </TabsTrigger>
              <TabsTrigger value="schedule" className="flex items-center gap-2" data-testid="tab-schedule-view">
                <Grid3x3 className="h-4 w-4" />
                Schedule
              </TabsTrigger>
              <TabsTrigger value="property" className="flex items-center gap-2" data-testid="tab-property-view">
                <BarChart3 className="h-4 w-4" />
                Property
              </TabsTrigger>
              <TabsTrigger value="payment" className="flex items-center gap-2" data-testid="tab-payment-view">
                <PieChart className="h-4 w-4" />
                Payments
              </TabsTrigger>
              <TabsTrigger value="trends" className="flex items-center gap-2" data-testid="tab-trends-view">
                <TrendingUp className="h-4 w-4" />
                Trends
              </TabsTrigger>
              <TabsTrigger value="tenant" className="flex items-center gap-2" data-testid="tab-tenant-view">
                <Users className="h-4 w-4" />
                Tenants
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
              ) : filteredRevenuesByTime.length > 0 ? (
                <div className="space-y-4">
                  {filteredRevenuesByTime.map((revenue, index) => {
                    // Check if this is a future payment for visual differentiation
                    const isFuture = new Date(revenue.date) > now;
                    const cardClassName = isFuture 
                      ? "hover:shadow-md transition-shadow opacity-60 border-dashed border-2" 
                      : "hover:shadow-md transition-shadow";
                    
                    return (
                      <Card key={revenue.id} className={cardClassName} data-testid={`card-revenue-${index}`}>
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
                              <Badge variant="outline" className="text-green-600 border-green-600" data-testid={`badge-taxable-${index}`}>
                                Taxable
                              </Badge>
                            )}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="outline" 
                                    size="sm"
                                    className={`h-6 px-2 text-xs font-medium rounded-full cursor-pointer hover:opacity-80 ${
                                      getPaymentStatusDisplay(revenue) === 'Paid' ? "text-green-600 border-green-600" :
                                      getPaymentStatusDisplay(revenue) === 'Partial' ? "text-yellow-600 border-yellow-600" :
                                      getPaymentStatusDisplay(revenue) === 'Skipped' ? "text-gray-600 border-gray-600" :
                                      getPaymentStatusDisplay(revenue) === 'Not due yet' ? "text-blue-600 border-blue-600" :
                                      "text-orange-600 border-orange-600"
                                    }`}
                                    data-testid={`badge-payment-status-${index}`}
                                  >
                                    {getPaymentStatusDisplay(revenue)}
                                    <ChevronDown className="h-3 w-3 ml-1" />
                                  </Button>
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
                                    onClick={() => setPartialPaymentDialog({
                                      open: true,
                                      transactionId: revenue.id,
                                      expectedAmount: Number(revenue.amount)
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
                              const isRecurring = revenue.isRecurring || revenue.parentRecurringId;
                              if (isRecurring) {
                                setPendingEditRevenue(revenue);
                              } else {
                                setEditingRevenue(revenue);
                                setShowRevenueForm(true);
                              }
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
                    );
                  })}
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
                        // Find actual transactions for this month (both parent and generated instances)
                        const monthTransactions = filteredRevenues.filter(t => {
                          const transactionDate = new Date(t.date);
                          return transactionDate.getFullYear() === month.year && 
                                 transactionDate.getMonth() === month.month;
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
                                
                                // Use same smart payment status logic as List view
                                const smartPaymentStatus = actualTransaction ? getPaymentStatusDisplay(actualTransaction) : 'Not due yet';
                                
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
                                          <Button
                                            variant="outline" 
                                            size="sm"
                                            className={`h-6 px-2 text-xs font-medium rounded-full cursor-pointer hover:opacity-80 ${
                                              smartPaymentStatus === 'Paid' ? "text-green-600 border-green-600" :
                                              smartPaymentStatus === 'Partial' ? "text-yellow-600 border-yellow-600" :
                                              smartPaymentStatus === 'Skipped' ? "text-gray-600 border-gray-600" :
                                              smartPaymentStatus === 'Not due yet' ? "text-blue-600 border-blue-600" :
                                              "text-orange-600 border-orange-600"
                                            }`}
                                          >
                                            {smartPaymentStatus}
                                            <ChevronDown className="h-3 w-3 ml-1" />
                                          </Button>
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
                                            onClick={() => setPartialPaymentDialog({
                                              open: true,
                                              transactionId: actualTransaction.id,
                                              expectedAmount: Number(recurringRevenue.amount)
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

            {/* Property Performance View */}
            <TabsContent value="property" className="space-y-6">
              {/* Top Properties Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {propertyPerformanceData.slice(0, 3).map((property, index) => (
                  <Card key={property.id} data-testid={`card-top-property-${index}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">#{index + 1} Property</p>
                          <p className="text-lg font-bold text-foreground">{property.name}</p>
                          <p className="text-xs text-muted-foreground">{property.unitCount} units</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-foreground">${property.total.toLocaleString()}</p>
                          <p className="text-sm text-green-600">{property.collectionRate}% collected</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Property Revenue Comparison Chart */}
              {propertyPerformanceData.length > 0 && (
                <Card data-testid="card-property-revenue-chart">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Property Revenue Comparison
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={propertyPerformanceData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="name" 
                          angle={-45}
                          textAnchor="end"
                          height={80}
                          interval={0}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
                        <Tooltip 
                          formatter={(value) => [`$${Number(value).toLocaleString()}`, 'Total Revenue']}
                          labelFormatter={(label) => `Property: ${label}`}
                        />
                        <Bar dataKey="total" fill="#22c55e" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Collection Rate Comparison */}
              {propertyPerformanceData.length > 0 && (
                <Card data-testid="card-collection-rate-chart">
                  <CardHeader>
                    <CardTitle>Collection Rate by Property</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={propertyPerformanceData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="name" 
                          angle={-45}
                          textAnchor="end"
                          height={80}
                          interval={0}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis tickFormatter={(value) => `${value}%`} />
                        <Tooltip 
                          formatter={(value) => [`${Number(value)}%`, 'Collection Rate']}
                          labelFormatter={(label) => `Property: ${label}`}
                        />
                        <Bar dataKey="collectionRate" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Property Performance Table */}
              <Card data-testid="card-property-performance-table">
                <CardHeader>
                  <CardTitle>Property Performance Details</CardTitle>
                </CardHeader>
                <CardContent>
                  {propertyPerformanceData.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-3 font-medium">Property</th>
                            <th className="text-right p-3 font-medium">Total Revenue</th>
                            <th className="text-right p-3 font-medium">Units</th>
                            <th className="text-right p-3 font-medium">Per Unit Avg</th>
                            <th className="text-right p-3 font-medium">Collection Rate</th>
                            <th className="text-right p-3 font-medium">Paid Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {propertyPerformanceData.map((property, index) => (
                            <tr key={property.id} className="border-b hover:bg-muted/50" data-testid={`row-property-${index}`}>
                              <td className="p-3">
                                <p className="font-medium text-foreground">{property.name}</p>
                              </td>
                              <td className="p-3 text-right font-bold text-foreground">${property.total.toLocaleString()}</td>
                              <td className="p-3 text-right text-muted-foreground">{property.unitCount}</td>
                              <td className="p-3 text-right font-medium text-foreground">${property.avgPerUnit.toLocaleString()}</td>
                              <td className="p-3 text-right">
                                <Badge className={property.collectionRate >= 90 ? "text-green-600 border-green-600" : property.collectionRate >= 70 ? "text-yellow-600 border-yellow-600" : "text-red-600 border-red-600"} variant="outline">
                                  {property.collectionRate}%
                                </Badge>
                              </td>
                              <td className="p-3 text-right font-medium text-green-600">${property.paidAmount.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No property revenue found. Start logging revenue to see property performance.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Payment Analysis View */}
            <TabsContent value="payment" className="space-y-6">
              {/* Payment Status Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {paymentStatusData.map((status, index) => (
                  <Card key={status.status} data-testid={`card-payment-status-${index}`}>
                    <CardContent className="p-4">
                      <div className="text-center">
                        <div className={`w-12 h-12 rounded-lg mx-auto mb-2 flex items-center justify-center ${
                          status.status === 'Paid' ? 'bg-green-100' :
                          status.status === 'Partial' ? 'bg-yellow-100' :
                          status.status === 'Not due yet' ? 'bg-blue-100' :
                          status.status === 'Skipped' ? 'bg-gray-100' :
                          'bg-red-100'
                        }`}>
                          <DollarSign className={`h-6 w-6 ${
                            status.status === 'Paid' ? 'text-green-600' :
                            status.status === 'Partial' ? 'text-yellow-600' :
                            status.status === 'Not due yet' ? 'text-blue-600' :
                            status.status === 'Skipped' ? 'text-gray-600' :
                            'text-red-600'
                          }`} />
                        </div>
                        <p className="text-sm font-medium text-muted-foreground">{status.status}</p>
                        <p className="text-xl font-bold text-foreground">${status.total.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{status.count} transactions</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Payment Status Pie Chart */}
              {paymentStatusData.length > 0 && (
                <Card data-testid="card-payment-status-chart">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <PieChart className="h-5 w-5" />
                      Payment Status Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={400}>
                      <RechartsPieChart>
                        <Pie
                          data={paymentStatusData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ status, percentage }) => `${status}: ${percentage}%`}
                          outerRadius={120}
                          fill="#8884d8"
                          dataKey="total"
                        >
                          {paymentStatusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={
                              entry.status === 'Paid' ? '#22c55e' :
                              entry.status === 'Partial' ? '#eab308' :
                              entry.status === 'Not due yet' ? '#3b82f6' :
                              entry.status === 'Skipped' ? '#6b7280' :
                              '#ef4444'
                            } />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => [`$${Number(value).toLocaleString()}`, 'Amount']} />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Payment Analysis Details */}
              <Card data-testid="card-payment-analysis-details">
                <CardHeader>
                  <CardTitle>Payment Analysis Details</CardTitle>
                </CardHeader>
                <CardContent>
                  {paymentStatusData.length > 0 ? (
                    <div className="space-y-4">
                      {paymentStatusData.map((status, index) => (
                        <div key={status.status} className="flex items-center justify-between p-4 border rounded-lg" data-testid={`row-payment-status-${index}`}>
                          <div className="flex items-center space-x-3">
                            <div className={`w-4 h-4 rounded ${
                              status.status === 'Paid' ? 'bg-green-500' :
                              status.status === 'Partial' ? 'bg-yellow-500' :
                              status.status === 'Not due yet' ? 'bg-blue-500' :
                              status.status === 'Skipped' ? 'bg-gray-500' :
                              'bg-red-500'
                            }`}></div>
                            <div>
                              <p className="font-medium text-foreground">{status.status} Payments</p>
                              <p className="text-sm text-muted-foreground">{status.count} transactions</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-foreground">${status.total.toLocaleString()}</p>
                            <p className="text-sm text-muted-foreground">{status.percentage}% of total</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No payment data found. Start logging revenue to see payment analysis.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Timeline & Trends View */}
            <TabsContent value="trends" className="space-y-6">
              {/* Monthly Revenue Trends Chart */}
              <Card data-testid="card-monthly-trends-chart">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    12-Month Revenue Trends
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={monthlyTrendsData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
                      <Tooltip 
                        formatter={(value, name) => [`$${Number(value).toLocaleString()}`, name === 'total' ? 'Total Revenue' : name === 'paid' ? 'Paid Amount' : 'Unpaid Amount']}
                        labelFormatter={(label) => `Month: ${label}`}
                      />
                      <Line type="monotone" dataKey="total" stroke="#22c55e" strokeWidth={3} name="total" />
                      <Line type="monotone" dataKey="paid" stroke="#3b82f6" strokeWidth={2} name="paid" />
                      <Line type="monotone" dataKey="unpaid" stroke="#ef4444" strokeWidth={2} name="unpaid" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Revenue Growth Analysis */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card data-testid="card-growth-metrics">
                  <CardContent className="p-4">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-blue-100 rounded-lg mx-auto mb-2 flex items-center justify-center">
                        <TrendingUp className="h-6 w-6 text-blue-600" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">Average Monthly</p>
                      <p className="text-xl font-bold text-foreground">
                        ${Math.round(monthlyTrendsData.reduce((sum, m) => sum + m.total, 0) / monthlyTrendsData.length).toLocaleString()}
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card data-testid="card-highest-month">
                  <CardContent className="p-4">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-green-100 rounded-lg mx-auto mb-2 flex items-center justify-center">
                        <DollarSign className="h-6 w-6 text-green-600" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">Highest Month</p>
                      <p className="text-xl font-bold text-foreground">
                        ${Math.max(...monthlyTrendsData.map(m => m.total)).toLocaleString()}
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card data-testid="card-collection-efficiency">
                  <CardContent className="p-4">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-purple-100 rounded-lg mx-auto mb-2 flex items-center justify-center">
                        <CheckCircle className="h-6 w-6 text-purple-600" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">Collection Rate</p>
                      <p className="text-xl font-bold text-foreground">
                        {Math.round((monthlyTrendsData.reduce((sum, m) => sum + m.paid, 0) / monthlyTrendsData.reduce((sum, m) => sum + m.total, 0)) * 100) || 0}%
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Monthly Breakdown Table */}
              <Card data-testid="card-monthly-breakdown">
                <CardHeader>
                  <CardTitle>Monthly Revenue Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3 font-medium">Month</th>
                          <th className="text-right p-3 font-medium">Total Revenue</th>
                          <th className="text-right p-3 font-medium">Paid Amount</th>
                          <th className="text-right p-3 font-medium">Unpaid Amount</th>
                          <th className="text-right p-3 font-medium">Collection %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyTrendsData.filter(m => m.total > 0).map((month, index) => (
                          <tr key={month.month} className="border-b hover:bg-muted/50" data-testid={`row-month-${index}`}>
                            <td className="p-3 font-medium text-foreground">{month.month}</td>
                            <td className="p-3 text-right font-bold text-foreground">${month.total.toLocaleString()}</td>
                            <td className="p-3 text-right text-green-600">${month.paid.toLocaleString()}</td>
                            <td className="p-3 text-right text-red-600">${month.unpaid.toLocaleString()}</td>
                            <td className="p-3 text-right">
                              <Badge 
                                className={Math.round((month.paid / month.total) * 100) >= 90 ? "text-green-600 border-green-600" : Math.round((month.paid / month.total) * 100) >= 70 ? "text-yellow-600 border-yellow-600" : "text-red-600 border-red-600"}
                                variant="outline"
                              >
                                {Math.round((month.paid / month.total) * 100) || 0}%
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tenant Performance View */}
            <TabsContent value="tenant" className="space-y-6">
              {/* Top Tenants Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {tenantPerformanceData.slice(0, 3).map((tenant, index) => (
                  <Card key={tenant.id} data-testid={`card-top-tenant-${index}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">#{index + 1} Property</p>
                          <p className="text-lg font-bold text-foreground">{tenant.name}</p>
                          <p className="text-xs text-muted-foreground">Reliability: {tenant.reliabilityScore}%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-foreground">${tenant.total.toLocaleString()}</p>
                          <p className="text-sm text-blue-600">{tenant.onTimePayments} on-time</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Tenant Reliability Chart */}
              {tenantPerformanceData.length > 0 && (
                <Card data-testid="card-tenant-reliability-chart">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Tenant Reliability Scores
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={tenantPerformanceData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="name" 
                          angle={-45}
                          textAnchor="end"
                          height={80}
                          interval={0}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis tickFormatter={(value) => `${value}%`} />
                        <Tooltip 
                          formatter={(value) => [`${Number(value)}%`, 'Reliability Score']}
                          labelFormatter={(label) => `Tenant: ${label}`}
                        />
                        <Bar dataKey="reliabilityScore" fill="#8b5cf6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Tenant Performance Table */}
              <Card data-testid="card-tenant-performance-table">
                <CardHeader>
                  <CardTitle>Tenant Performance Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  {tenantPerformanceData.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-3 font-medium">Property/Tenant</th>
                            <th className="text-right p-3 font-medium">Total Revenue</th>
                            <th className="text-right p-3 font-medium">On-Time Payments</th>
                            <th className="text-right p-3 font-medium">Avg Days Late</th>
                            <th className="text-right p-3 font-medium">Reliability Score</th>
                            <th className="text-right p-3 font-medium">Risk Level</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tenantPerformanceData.map((tenant, index) => (
                            <tr key={tenant.id} className="border-b hover:bg-muted/50" data-testid={`row-tenant-${index}`}>
                              <td className="p-3">
                                <p className="font-medium text-foreground">{tenant.name}</p>
                                <p className="text-sm text-muted-foreground">{tenant.unitCount} units</p>
                              </td>
                              <td className="p-3 text-right font-bold text-foreground">${tenant.total.toLocaleString()}</td>
                              <td className="p-3 text-right text-green-600">{tenant.onTimePayments}</td>
                              <td className="p-3 text-right text-muted-foreground">{tenant.avgDaysLate} days</td>
                              <td className="p-3 text-right">
                                <Badge 
                                  className={tenant.reliabilityScore >= 90 ? "text-green-600 border-green-600" : tenant.reliabilityScore >= 70 ? "text-yellow-600 border-yellow-600" : "text-red-600 border-red-600"}
                                  variant="outline"
                                >
                                  {tenant.reliabilityScore}%
                                </Badge>
                              </td>
                              <td className="p-3 text-right">
                                <Badge 
                                  className={tenant.reliabilityScore >= 90 ? "text-green-600 border-green-600" : tenant.reliabilityScore >= 70 ? "text-yellow-600 border-yellow-600" : "text-red-600 border-red-600"}
                                  variant="outline"
                                >
                                  {tenant.reliabilityScore >= 90 ? 'Low' : tenant.reliabilityScore >= 70 ? 'Medium' : 'High'}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No tenant performance data found. Start logging revenue to analyze tenant reliability.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>

      {/* Partial Payment Dialog */}
      <Dialog open={partialPaymentDialog?.open || false} onOpenChange={(open) => !open && setPartialPaymentDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Partial Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Expected Amount: <span className="font-semibold">${partialPaymentDialog?.expectedAmount.toLocaleString()}</span>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="partial-amount">Amount Actually Paid</Label>
              <Input
                id="partial-amount"
                type="text"
                inputMode="decimal"
                placeholder="Enter amount paid"
                value={partialAmount}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9.]/g, '');
                  if (value.split('.').length <= 2) {
                    setPartialAmount(value);
                  }
                }}
                className="text-right"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setPartialPaymentDialog(null);
                  setPartialAmount("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (partialPaymentDialog && partialAmount) {
                    const paidAmount = parseFloat(partialAmount);
                    updatePaymentStatusMutation.mutate({
                      transactionId: partialPaymentDialog.transactionId,
                      paymentStatus: 'Partial',
                      paidAmount: paidAmount
                    });
                    setPartialPaymentDialog(null);
                    setPartialAmount("");
                  }
                }}
                disabled={!partialAmount || parseFloat(partialAmount) <= 0}
                className="bg-yellow-600 hover:bg-yellow-700"
              >
                Save Partial Payment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteRevenueId} onOpenChange={() => setDeleteRevenueId(null)}>
        <AlertDialogContent>
          {(() => {
            const revenueToDelete = revenues?.find(r => r.id === deleteRevenueId);
            const isRecurring = revenueToDelete?.isRecurring || revenueToDelete?.parentRecurringId;
            
            if (isRecurring) {
              return (
                <>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Recurring Revenue</AlertDialogTitle>
                    <AlertDialogDescription>
                      This is part of a recurring revenue series. What would you like to delete?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-3">
                      <Button
                        variant="outline"
                        className="w-full justify-start h-auto p-4"
                        onClick={() => {
                          if (deleteRevenueId) {
                            deleteRevenueMutation.mutate(deleteRevenueId);
                          }
                        }}
                        disabled={deleteRevenueMutation.isPending || bulkDeleteRevenueMutation.isPending}
                        data-testid="button-delete-single"
                      >
                        <div className="text-left">
                          <div className="font-semibold">Delete this payment only</div>
                          <div className="text-sm text-muted-foreground">Remove just this single revenue entry, keep future recurring payments</div>
                        </div>
                      </Button>
                      
                      <Button
                        variant="outline"
                        className="w-full justify-start h-auto p-4 border-red-200 hover:bg-red-50"
                        onClick={() => {
                          if (deleteRevenueId) {
                            bulkDeleteRevenueMutation.mutate(deleteRevenueId);
                          }
                        }}
                        disabled={deleteRevenueMutation.isPending || bulkDeleteRevenueMutation.isPending}
                        data-testid="button-delete-recurring"
                      >
                        <div className="text-left">
                          <div className="font-semibold text-red-700">Delete this and all future payments</div>
                          <div className="text-sm text-red-600">Stop the recurring series and remove all future revenue entries</div>
                        </div>
                      </Button>
                    </div>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                  </AlertDialogFooter>
                </>
              );
            } else {
              return (
                <>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Revenue</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this revenue entry? This action cannot be undone and will permanently remove the revenue record.
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
                      disabled={deleteRevenueMutation.isPending}
                    >
                      {deleteRevenueMutation.isPending ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </>
              );
            }
          })()}
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Choice Dialog */}
      <AlertDialog open={!!pendingEditRevenue} onOpenChange={() => setPendingEditRevenue(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit Recurring Revenue</AlertDialogTitle>
            <AlertDialogDescription>
              This is part of a recurring revenue series. What would you like to edit?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start h-auto p-4"
                onClick={() => {
                  if (pendingEditRevenue) {
                    setEditingRevenue(pendingEditRevenue);
                    setIsEditingSeries(false);
                    setShowRevenueForm(true);
                    setPendingEditRevenue(null);
                  }
                }}
                data-testid="button-edit-single"
              >
                <div className="text-left">
                  <div className="font-semibold">Edit this payment only</div>
                  <div className="text-sm text-muted-foreground">Modify just this single revenue entry, keep future recurring payments unchanged</div>
                </div>
              </Button>
              
              <Button
                variant="outline"
                className="w-full justify-start h-auto p-4 border-blue-200 hover:bg-blue-50"
                onClick={() => {
                  if (pendingEditRevenue) {
                    setEditingRevenue(pendingEditRevenue);
                    setIsEditingSeries(true);
                    setShowRevenueForm(true);
                    setPendingEditRevenue(null);
                  }
                }}
                data-testid="button-edit-recurring"
              >
                <div className="text-left">
                  <div className="font-semibold text-blue-700">Edit this and all future payments</div>
                  <div className="text-sm text-blue-600">Update the recurring series and modify all future revenue entries</div>
                </div>
              </Button>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}