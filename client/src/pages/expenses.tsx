import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import ExpenseForm from "@/components/forms/expense-form";
import MortgageAdjustmentForm from "@/components/forms/mortgage-adjustment-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Receipt, Plus, DollarSign, Calendar, Building, Tag, Repeat, CheckCircle, Trash2, List, BarChart3, GitCompare, Grid3x3, Clock, PieChart } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart as RechartsPieChart, Pie } from "recharts";
import type { Transaction, Property, Unit } from "@shared/schema";
import { getExpenseDeductionForYear, getAmortizationStatus, formatAmortizationDisplay } from "@/lib/calculations";

export default function Expenses() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Transaction | null>(null);
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);
  const [showMortgageAdjustment, setShowMortgageAdjustment] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [unitFilter, setUnitFilter] = useState<string[]>([]);
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"list" | "category" | "property" | "calendar" | "timeline">("list");

  // Check for URL parameters and set filters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const filterParam = urlParams.get('filter');
    if (filterParam === 'uncategorized') {
      setCategoryFilter('uncategorized');
    }
  }, []);

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

  const { data: expenses, isLoading: expensesLoading, error } = useQuery<Transaction[]>({
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

  const createExpenseMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingExpense) {
        const response = await apiRequest("PUT", `/api/expenses/${editingExpense.id}`, data);
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/expenses", data);
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setShowExpenseForm(false);
      setEditingExpense(null);
      toast({
        title: "Success",
        description: editingExpense ? "Expense updated successfully" : "Expense logged successfully",
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
        description: editingExpense ? "Failed to update expense" : "Failed to log expense",
        variant: "destructive",
      });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      const response = await apiRequest("DELETE", `/api/expenses/${expenseId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      setDeleteExpenseId(null);
      toast({
        title: "Success",
        description: "Expense deleted successfully",
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
        description: "Failed to delete expense",
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

  const expenseTransactions = expenses?.filter(t => t.type === "Expense") || [];
  
  // Since properties can be owned by multiple entities (junction table relationship),
  // we show all properties in the dropdown regardless of entity filter.
  // The expense filtering will still work correctly based on the expense's entityId.
  const filteredProperties = properties;
    
  const filteredExpenses = expenseTransactions.filter(expense => {
    const categoryMatch = categoryFilter === "all" || 
      (categoryFilter === "uncategorized" && !expense.scheduleECategory) ||
      expense.category === categoryFilter;
    const propertyMatch = propertyFilter === "all" || expense.propertyId === propertyFilter;
    const entityMatch = entityFilter === "all" || expense.entityId === entityFilter;
    
    // Unit filtering logic - only apply if unit filter is active
    let unitMatch = true;
    if (unitFilter.length > 0 && expense.propertyId === propertyFilter) {
      unitMatch = false;
      
      // Check if expense matches selected units
      if (expense.unitId && unitFilter.includes(expense.unitId)) {
        unitMatch = true;
      } else if (!expense.unitId && unitFilter.includes("common")) {
        // Expenses without specific unit ID are considered common area
        unitMatch = true;
      }
    }
    
    return categoryMatch && propertyMatch && entityMatch && unitMatch;
  });

  const categories = Array.from(new Set(expenseTransactions.map(e => e.category).filter(Boolean)));
  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const thisMonthExpenses = filteredExpenses.filter(expense => {
    const expenseMonth = new Date(expense.date).getMonth();
    const currentMonth = new Date().getMonth();
    return expenseMonth === currentMonth;
  }).reduce((sum, expense) => sum + Number(expense.amount), 0);

  const getCategoryColor = (category: string) => {
    const colors = {
      "Maintenance": "bg-yellow-100 text-yellow-800",
      "Cleaning and Maintenance": "bg-yellow-100 text-yellow-800",
      "Repairs": "bg-red-100 text-red-800",
      "Insurance": "bg-blue-100 text-blue-800",
      "Utilities": "bg-green-100 text-green-800",
      "Property Management": "bg-purple-100 text-purple-800",
      "Supplies": "bg-orange-100 text-orange-800",
      "Legal": "bg-gray-100 text-gray-800",
      "Marketing": "bg-pink-100 text-pink-800",
      "Taxes": "bg-indigo-100 text-indigo-800",
      "Advertising": "bg-cyan-100 text-cyan-800",
      "Professional Services": "bg-teal-100 text-teal-800",
      // Mortgage-related categories
      "Mortgage": "bg-amber-100 text-amber-800 border-amber-300", // Full payments (temporary)
      "Mortgage Interest Paid to Banks": "bg-emerald-100 text-emerald-800", // Tax deductible
      "Mortgage Principal Payment": "bg-slate-100 text-slate-800", // Non-deductible
    };
    return colors[category as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

  // Category analysis data
  const categoryData = categories.map(category => {
    const categoryExpenses = filteredExpenses.filter(e => e.category === category);
    const total = categoryExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const count = categoryExpenses.length;
    return {
      name: category,
      total,
      count,
      percentage: totalExpenses > 0 ? Math.round((total / totalExpenses) * 100) : 0
    };
  }).sort((a, b) => b.total - a.total);

  // Chart colors for consistency
  const CHART_COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#8dd1e1', '#d084d0', '#ffb3ba', '#87ceeb'];

  // Monthly expense data for trends
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - i));
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    const monthExpenses = filteredExpenses.filter(expense => {
      const expenseMonth = new Date(expense.date);
      const expenseKey = `${expenseMonth.getFullYear()}-${String(expenseMonth.getMonth() + 1).padStart(2, '0')}`;
      return expenseKey === monthKey;
    });
    
    return {
      month: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      total: monthExpenses.reduce((sum, e) => sum + Number(e.amount), 0)
    };
  });

  // Property comparison data
  const propertyComparisonData = properties.map(property => {
    const propertyExpenses = expenseTransactions.filter(e => e.propertyId === property.id);
    const total = propertyExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const count = propertyExpenses.length;
    const propertyUnits = units.filter(u => u.propertyId === property.id);
    const unitCount = propertyUnits.length || 1; // Avoid division by zero
    const avgPerUnit = total / unitCount;
    
    // Most expensive category for this property
    const categoriesForProperty = propertyExpenses.reduce((acc, expense) => {
      if (expense.category) {
        acc[expense.category] = (acc[expense.category] || 0) + Number(expense.amount);
      }
      return acc;
    }, {} as Record<string, number>);
    
    const topCategory = Object.entries(categoriesForProperty)
      .sort(([,a], [,b]) => b - a)[0];
    
    return {
      id: property.id,
      name: property.name || `${property.street}, ${property.city}`,
      total,
      count,
      unitCount,
      avgPerUnit,
      topCategory: topCategory ? { name: topCategory[0], amount: topCategory[1] } : null,
      monthlyData: Array.from({ length: 6 }, (_, i) => {
        const date = new Date();
        date.setMonth(date.getMonth() - (5 - i));
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        const monthExpenses = propertyExpenses.filter(expense => {
          const expenseMonth = new Date(expense.date);
          const expenseKey = `${expenseMonth.getFullYear()}-${String(expenseMonth.getMonth() + 1).padStart(2, '0')}`;
          return expenseKey === monthKey;
        });
        
        return {
          month: date.toLocaleDateString('en-US', { month: 'short' }),
          amount: monthExpenses.reduce((sum, e) => sum + Number(e.amount), 0)
        };
      })
    };
  }).filter(p => p.total > 0).sort((a, b) => b.total - a.total);

  // Calendar/Schedule data - group expenses by month and category
  const calendarData = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(i);
    const monthKey = `${date.getFullYear()}-${String(i + 1).padStart(2, '0')}`;
    
    const monthExpenses = filteredExpenses.filter(expense => {
      const expenseMonth = new Date(expense.date);
      const expenseKey = `${expenseMonth.getFullYear()}-${String(expenseMonth.getMonth() + 1).padStart(2, '0')}`;
      return expenseKey === monthKey;
    });
    
    const total = monthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const expensesByCategory = monthExpenses.reduce((acc, expense) => {
      const category = expense.category || 'Other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(expense);
      return acc;
    }, {} as Record<string, typeof monthExpenses>);
    
    return {
      month: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      monthShort: date.toLocaleDateString('en-US', { month: 'short' }),
      total,
      count: monthExpenses.length,
      expensesByCategory,
      expenses: monthExpenses
    };
  });

  // Timeline data - sort expenses chronologically and group by date
  const timelineData = filteredExpenses
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .reduce((acc, expense) => {
      const dateKey = new Date(expense.date).toDateString();
      if (!acc[dateKey]) {
        acc[dateKey] = {
          date: new Date(expense.date),
          expenses: [],
          total: 0
        };
      }
      acc[dateKey].expenses.push(expense);
      acc[dateKey].total += Number(expense.amount);
      return acc;
    }, {} as Record<string, { date: Date; expenses: typeof filteredExpenses; total: number }>);

  const timelineEntries = Object.values(timelineData).sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="flex h-screen bg-background" data-testid="page-expenses">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Expenses" />
        
        <main className="flex-1 overflow-auto p-6 bg-muted/30">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">Expenses</h1>
              <p className="text-muted-foreground">Track and categorize property expenses</p>
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
                  <SelectItem value="uncategorized">Uncategorized</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category!}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Dialog open={showExpenseForm} onOpenChange={setShowExpenseForm}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-expense">
                    <Plus className="h-4 w-4 mr-2" />
                    Log Expense
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{editingExpense ? "Edit Expense" : "Log New Expense"}</DialogTitle>
                  </DialogHeader>
                  <ExpenseForm 
                    properties={properties}
                    units={units}
                    entities={entities}
                    expense={editingExpense}
                    onSubmit={(data) => createExpenseMutation.mutate(data)}
                    onClose={() => {
                      setShowExpenseForm(false);
                      setEditingExpense(null);
                    }}
                    isLoading={createExpenseMutation.isPending}
                    onTriggerMortgageAdjustment={() => {
                      setShowExpenseForm(false);
                      setShowMortgageAdjustment(true);
                    }}
                  />
                </DialogContent>
              </Dialog>

            </div>
          </div>

          {/* Mortgage Split Tool - Smart Banner */}
          {(() => {
            const allExpenses = expenses?.filter(t => t.type === "Expense") || [];
            const currentYear = new Date().getFullYear();
            const mortgageExpenses = allExpenses.filter((t: Transaction) => 
              t.category === "Mortgage" && new Date(t.date).getFullYear() === currentYear
            );
            
            if (mortgageExpenses.length > 0) {
              return (
                <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 border-blue-200 dark:border-blue-800 mb-6">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                          <GitCompare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <CardTitle className="text-lg text-blue-900 dark:text-blue-100">📊 Ready for tax season? Split your mortgage payments</CardTitle>
                          <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                            {currentYear}: {mortgageExpenses.length} mortgage payments ready to split into interest (deductible) vs principal (non-deductible)
                          </p>
                        </div>
                      </div>
                      <Button 
                        onClick={() => setShowMortgageAdjustment(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        data-testid="button-mortgage-split-expenses"
                      >
                        Split Payments
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="text-sm text-blue-600 dark:text-blue-300 bg-white dark:bg-gray-900 p-3 rounded border">
                      <strong>💡 Tax Tip:</strong> Do this once per year after receiving your Form 1098. 
                      Automatically categorizes interest as deductible and principal as non-deductible without manual work.
                    </div>
                  </CardContent>
                </Card>
              );
            }
            return null;
          })()}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card data-testid="card-total-expenses">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Total Expenses</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-total-expenses">
                      ${totalExpenses.toLocaleString()}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                    <Receipt className="text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card data-testid="card-month-expenses">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">This Month</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-month-expenses">
                      ${thisMonthExpenses.toLocaleString()}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <Calendar className="text-yellow-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card data-testid="card-expense-count">
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Total Transactions</p>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-expense-count">
                      {filteredExpenses.length}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* View Toggle Tabs */}
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as "list" | "category" | "property" | "calendar" | "timeline")} className="space-y-6">
            <TabsList className="grid w-full max-w-[800px] grid-cols-5">
              <TabsTrigger value="list" className="flex items-center gap-2" data-testid="tab-list-view">
                <List className="h-4 w-4" />
                List View
              </TabsTrigger>
              <TabsTrigger value="category" className="flex items-center gap-2" data-testid="tab-category-view">
                <BarChart3 className="h-4 w-4" />
                Category
              </TabsTrigger>
              <TabsTrigger value="property" className="flex items-center gap-2" data-testid="tab-property-view">
                <GitCompare className="h-4 w-4" />
                Properties
              </TabsTrigger>
              <TabsTrigger value="calendar" className="flex items-center gap-2" data-testid="tab-calendar-view">
                <Grid3x3 className="h-4 w-4" />
                Calendar
              </TabsTrigger>
              <TabsTrigger value="timeline" className="flex items-center gap-2" data-testid="tab-timeline-view">
                <Clock className="h-4 w-4" />
                Timeline
              </TabsTrigger>
            </TabsList>

            {/* List View */}
            <TabsContent value="list" className="space-y-0">
              {expensesLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Card key={i} data-testid={`skeleton-expense-${i}`}>
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
              ) : filteredExpenses.length > 0 ? (
            <div className="space-y-4">
              {filteredExpenses.map((expense, index) => (
                <Card key={expense.id} className="hover:shadow-md transition-shadow" data-testid={`card-expense-${index}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                          <Receipt className="h-6 w-6 text-orange-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground" data-testid={`text-expense-description-${index}`}>
                            {expense.description}
                          </h3>
                          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                            <span data-testid={`text-expense-date-${index}`}>
                              {new Date(expense.date).toLocaleDateString()}
                            </span>
                            {expense.category && (
                              <Badge className={getCategoryColor(expense.category)} data-testid={`badge-expense-category-${index}`}>
                                {expense.category}
                              </Badge>
                            )}
                            {expense.isRecurring && (
                              <Badge variant="outline" className="text-blue-600 border-blue-600" data-testid={`badge-recurring-${index}`}>
                                <Repeat className="h-3 w-3 mr-1" />
                                {expense.recurringFrequency}
                              </Badge>
                            )}
                            {expense.parentRecurringId && (
                              <Badge variant="outline" className="text-purple-600 border-purple-600" data-testid={`badge-recurring-instance-${index}`}>
                                Auto-generated
                              </Badge>
                            )}
                            {(() => {
                              const currentYear = new Date().getFullYear();
                              const amortizationStatus = getAmortizationStatus(expense, currentYear);
                              const displayInfo = formatAmortizationDisplay(amortizationStatus);
                              
                              return (
                                <>
                                  <Badge 
                                    variant="outline" 
                                    className={expense.taxDeductible === false 
                                      ? "text-orange-600 border-orange-600" 
                                      : "text-green-600 border-green-600"
                                    } 
                                    data-testid={`badge-tax-deductible-${index}`}
                                  >
                                    {displayInfo.badge}
                                  </Badge>
                                  {expense.taxDeductible && amortizationStatus.isAmortized && (
                                    <Badge 
                                      variant="outline" 
                                      className="text-blue-600 border-blue-600" 
                                      data-testid={`badge-amortization-${index}`}
                                    >
                                      {amortizationStatus.yearsRemaining > 0 
                                        ? `${amortizationStatus.yearsRemaining} Years Left`
                                        : amortizationStatus.isCompleted 
                                          ? "Complete" 
                                          : "Final Year"}
                                    </Badge>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          {(() => {
                            const currentYear = new Date().getFullYear();
                            const currentYearDeduction = getExpenseDeductionForYear(expense, currentYear);
                            const amortizationStatus = getAmortizationStatus(expense, currentYear);
                            const totalAmount = Number(expense.amount);
                            
                            if (expense.taxDeductible && amortizationStatus.isAmortized) {
                              return (
                                <>
                                  <p className="text-xl font-bold text-foreground" data-testid={`text-expense-amount-${index}`}>
                                    ${totalAmount.toLocaleString()}
                                  </p>
                                  <p className="text-sm font-medium text-blue-600" data-testid={`text-current-year-deduction-${index}`}>
                                    ${currentYearDeduction.toLocaleString()} this year
                                  </p>
                                  {amortizationStatus.remainingToDeduct > 0 && (
                                    <p className="text-xs text-muted-foreground" data-testid={`text-remaining-amount-${index}`}>
                                      ${amortizationStatus.remainingToDeduct.toLocaleString()} remaining
                                    </p>
                                  )}
                                </>
                              );
                            } else {
                              return (
                                <>
                                  <p className="text-xl font-bold text-foreground" data-testid={`text-expense-amount-${index}`}>
                                    ${totalAmount.toLocaleString()}
                                  </p>
                                  {expense.taxDeductible && currentYearDeduction > 0 && (
                                    <p className="text-sm text-green-600" data-testid={`text-current-year-deduction-${index}`}>
                                      Deductible {currentYear}
                                    </p>
                                  )}
                                </>
                              );
                            }
                          })()}
                          <div className="text-sm text-muted-foreground">
                            {expense.scope === 'property' && expense.propertyId && (
                              <>
                                <p data-testid={`text-expense-scope-${index}`}>Property</p>
                                <p data-testid={`text-expense-property-${index}`}>
                                  {(() => {
                                    const property = properties.find(p => p.id === expense.propertyId);
                                    return property ? (property.name || `${property.street}, ${property.city}`) : 'Property';
                                  })()}
                                </p>
                              </>
                            )}
                            {expense.scope === 'operational' && (
                              <>
                                <p data-testid={`text-expense-scope-${index}`}>Operational</p>
                                <p data-testid={`text-expense-entity-${index}`}>
                                  {entities.find(e => e.id === expense.entityId)?.name || 'Entity'}
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
                              setEditingExpense(expense);
                              setShowExpenseForm(true);
                            }}
                            data-testid={`button-edit-expense-${index}`}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteExpenseId(expense.id)}
                            data-testid={`button-delete-expense-${index}`}
                            className="text-red-600 hover:text-red-700 hover:border-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    {expense.notes && (
                      <p className="text-sm text-muted-foreground mt-3 pl-16" data-testid={`text-expense-notes-${index}`}>
                        {expense.notes}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2" data-testid="text-no-expenses">No Expenses Logged</h3>
                    <p className="text-muted-foreground mb-4">Start tracking your property expenses for better financial management and tax preparation.</p>
                    <Button onClick={() => setShowExpenseForm(true)} data-testid="button-add-first-expense">
                      <Plus className="h-4 w-4 mr-2" />
                      Log Your First Expense
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Category Dashboard View */}
            <TabsContent value="category" className="space-y-6">
              {/* Top Categories Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {categoryData.slice(0, 3).map((category, index) => (
                  <Card key={category.name} data-testid={`card-top-category-${index}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">#{index + 1} Category</p>
                          <p className="text-lg font-bold text-foreground">{category.name}</p>
                          <p className="text-xs text-muted-foreground">{category.count} transactions</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-foreground">${category.total.toLocaleString()}</p>
                          <p className="text-sm text-muted-foreground">{category.percentage}%</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Category Breakdown Pie Chart */}
                <Card data-testid="card-category-pie-chart">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <PieChart className="h-5 w-5" />
                      Expense Breakdown by Category
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {categoryData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <RechartsPieChart>
                          <Pie
                            data={categoryData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percentage }) => `${name}: ${percentage}%`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="total"
                          >
                            {categoryData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => [`$${Number(value).toLocaleString()}`, 'Amount']} />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                        No expense data available
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Monthly Spending Trends */}
                <Card data-testid="card-monthly-trend-chart">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Monthly Spending Trend
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {monthlyData.some(d => d.total > 0) ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
                          <Tooltip formatter={(value) => [`$${Number(value).toLocaleString()}`, 'Total']} />
                          <Bar dataKey="total" fill="#8884d8" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                        No expense trends available
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Category Details Table */}
              <Card data-testid="card-category-details">
                <CardHeader>
                  <CardTitle>Category Details</CardTitle>
                </CardHeader>
                <CardContent>
                  {categoryData.length > 0 ? (
                    <div className="space-y-3">
                      {categoryData.map((category, index) => (
                        <div key={category.name} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`row-category-${index}`}>
                          <div className="flex items-center space-x-3">
                            <div className={`w-4 h-4 rounded`} style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}></div>
                            <div>
                              <p className="font-medium text-foreground">{category.name}</p>
                              <p className="text-sm text-muted-foreground">{category.count} transactions</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-foreground">${category.total.toLocaleString()}</p>
                            <p className="text-sm text-muted-foreground">{category.percentage}% of total</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No categories found. Start adding expenses to see category breakdown.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Property Comparison View */}
            <TabsContent value="property" className="space-y-6">
              {/* Property Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {propertyComparisonData.slice(0, 6).map((property, index) => (
                  <Card key={property.id} data-testid={`card-property-${index}`}>
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-foreground truncate">{property.name}</p>
                            <p className="text-xs text-muted-foreground">{property.unitCount} units</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-foreground">${property.total.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">{property.count} expenses</p>
                          </div>
                        </div>
                        
                        <div className="border-t pt-2">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-muted-foreground">Per Unit Avg:</span>
                            <span className="text-sm font-medium">${property.avgPerUnit.toLocaleString()}</span>
                          </div>
                          {property.topCategory && (
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-muted-foreground">Top Category:</span>
                              <span className="text-xs font-medium truncate ml-2">{property.topCategory.name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Property Expense Comparison Chart */}
              {propertyComparisonData.length > 0 && (
                <Card data-testid="card-property-comparison-chart">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <GitCompare className="h-5 w-5" />
                      Property Expense Comparison
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={propertyComparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
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
                          formatter={(value) => [`$${Number(value).toLocaleString()}`, 'Total Expenses']}
                          labelFormatter={(label) => `Property: ${label}`}
                        />
                        <Bar dataKey="total" fill="#8884d8" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Property Expense Per Unit Chart */}
              {propertyComparisonData.length > 0 && (
                <Card data-testid="card-property-per-unit-chart">
                  <CardHeader>
                    <CardTitle>Expense Per Unit Comparison</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={propertyComparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
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
                          formatter={(value) => [`$${Number(value).toLocaleString()}`, 'Per Unit Average']}
                          labelFormatter={(label) => `Property: ${label}`}
                        />
                        <Bar dataKey="avgPerUnit" fill="#82ca9d" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Detailed Property Analysis Table */}
              <Card data-testid="card-property-analysis-table">
                <CardHeader>
                  <CardTitle>Detailed Property Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  {propertyComparisonData.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-3 font-medium">Property</th>
                            <th className="text-right p-3 font-medium">Total Expenses</th>
                            <th className="text-right p-3 font-medium">Units</th>
                            <th className="text-right p-3 font-medium">Per Unit Avg</th>
                            <th className="text-right p-3 font-medium">Transactions</th>
                            <th className="text-left p-3 font-medium">Top Category</th>
                          </tr>
                        </thead>
                        <tbody>
                          {propertyComparisonData.map((property, index) => (
                            <tr key={property.id} className="border-b hover:bg-muted/50" data-testid={`row-property-${index}`}>
                              <td className="p-3">
                                <div>
                                  <p className="font-medium text-foreground">{property.name}</p>
                                </div>
                              </td>
                              <td className="p-3 text-right font-bold text-foreground">${property.total.toLocaleString()}</td>
                              <td className="p-3 text-right text-muted-foreground">{property.unitCount}</td>
                              <td className="p-3 text-right font-medium text-foreground">${property.avgPerUnit.toLocaleString()}</td>
                              <td className="p-3 text-right text-muted-foreground">{property.count}</td>
                              <td className="p-3">
                                {property.topCategory ? (
                                  <div>
                                    <p className="text-sm font-medium">{property.topCategory.name}</p>
                                    <p className="text-xs text-muted-foreground">${property.topCategory.amount.toLocaleString()}</p>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No property expenses found. Start adding expenses to see property comparison.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Calendar/Schedule View */}
            <TabsContent value="calendar" className="space-y-6">
              {/* Calendar Navigation */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Monthly Expense Calendar</h3>
                <p className="text-sm text-muted-foreground">Organized by category</p>
              </div>

              {/* Monthly Expense Calendar Grid */}
              {calendarData.filter(month => month.count > 0).length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {calendarData.filter(month => month.count > 0).map((month, index) => (
                    <Card key={index} className="h-fit" data-testid={`card-calendar-month-${index}`}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center justify-between">
                          {month.month}
                          <Badge variant="outline" className="text-red-600 border-red-600">
                            ${month.total.toLocaleString()}
                          </Badge>
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">{month.count} expenses</p>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {Object.entries(month.expensesByCategory).map(([category, categoryExpenses]) => {
                          const categoryTotal = categoryExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
                          return (
                            <div key={category} className="space-y-2">
                              <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                                <div className="flex items-center space-x-2">
                                  <div className={`w-3 h-3 rounded ${getCategoryColor(category).split(' ')[0]}`}></div>
                                  <span className="font-medium text-sm">{category}</span>
                                </div>
                                <Badge variant="outline" className="text-xs">
                                  ${categoryTotal.toLocaleString()}
                                </Badge>
                              </div>
                              
                              {/* Individual expenses in this category */}
                              <div className="space-y-1 ml-4">
                                {categoryExpenses.slice(0, 3).map((expense, expenseIndex) => (
                                  <div key={expense.id} className="flex items-center justify-between text-sm" data-testid={`expense-item-${index}-${expenseIndex}`}>
                                    <div className="flex-1 truncate">
                                      <span className="text-foreground">{expense.description}</span>
                                      <span className="text-muted-foreground ml-2">
                                        {new Date(expense.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                      </span>
                                    </div>
                                    <span className="font-medium text-foreground">${Number(expense.amount).toLocaleString()}</span>
                                  </div>
                                ))}
                                {categoryExpenses.length > 3 && (
                                  <div className="text-xs text-muted-foreground text-center">
                                    +{categoryExpenses.length - 3} more expenses
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        
                        {month.count === 0 && (
                          <div className="text-center py-4 text-muted-foreground text-sm">
                            No expenses recorded
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Grid3x3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No Expenses Found</h3>
                    <p className="text-muted-foreground mb-4">Start logging expenses to see them organized in a monthly calendar view.</p>
                    <Button onClick={() => setShowExpenseForm(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Log Your First Expense
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Monthly Summary Chart */}
              {calendarData.some(month => month.total > 0) && (
                <Card data-testid="card-calendar-summary-chart">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Monthly Expense Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={calendarData.filter(m => m.total > 0)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="monthShort" />
                        <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
                        <Tooltip 
                          formatter={(value) => [`$${Number(value).toLocaleString()}`, 'Total Expenses']}
                          labelFormatter={(label) => `Month: ${label}`}
                        />
                        <Bar dataKey="total" fill="#ef4444" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Timeline View */}
            <TabsContent value="timeline" className="space-y-6">
              {/* Timeline Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Expense Timeline</h3>
                <p className="text-sm text-muted-foreground">Chronological order (newest first)</p>
              </div>

              {/* Timeline Content */}
              {timelineEntries.length > 0 ? (
                <div className="space-y-6">
                  {timelineEntries.map((entry, entryIndex) => (
                    <div key={entry.date.toDateString()} className="relative" data-testid={`timeline-entry-${entryIndex}`}>
                      {/* Timeline Date Header */}
                      <div className="flex items-center space-x-4 mb-4">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <div className="flex-1 border-t border-muted"></div>
                        <div className="bg-background px-3">
                          <h4 className="font-semibold text-foreground">
                            {entry.date.toLocaleDateString('en-US', { 
                              weekday: 'long', 
                              year: 'numeric', 
                              month: 'long', 
                              day: 'numeric' 
                            })}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {entry.expenses.length} expenses • ${entry.total.toLocaleString()}
                          </p>
                        </div>
                        <div className="flex-1 border-t border-muted"></div>
                      </div>

                      {/* Timeline Expenses for this date */}
                      <div className="ml-6 space-y-3">
                        {entry.expenses.map((expense, expenseIndex) => (
                          <Card key={expense.id} className="relative" data-testid={`timeline-expense-${entryIndex}-${expenseIndex}`}>
                            {/* Connecting line from timeline dot */}
                            <div className="absolute -left-8 top-6 w-6 h-px bg-muted"></div>
                            
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getCategoryColor(expense.category || 'Other').split(' ')[0]}`}>
                                    <Receipt className="h-5 w-5 text-white" />
                                  </div>
                                  <div className="flex-1">
                                    <h5 className="font-semibold text-foreground">{expense.description}</h5>
                                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                                      <span>{new Date(expense.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                      {expense.category && (
                                        <Badge className={getCategoryColor(expense.category)} variant="secondary">
                                          {expense.category}
                                        </Badge>
                                      )}
                                      {expense.scope === 'property' && expense.propertyId && (
                                        <span className="text-blue-600">
                                          {(() => {
                                            const property = properties.find(p => p.id === expense.propertyId);
                                            return property ? (property.name || `${property.street}, ${property.city}`) : 'Property';
                                          })()}
                                        </span>
                                      )}
                                      {expense.isRecurring && (
                                        <Badge variant="outline" className="text-blue-600 border-blue-600">
                                          <Repeat className="h-3 w-3 mr-1" />
                                          Recurring
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="text-right">
                                  <p className="text-xl font-bold text-foreground">${Number(expense.amount).toLocaleString()}</p>
                                  {expense.taxDeductible === false ? (
                                    <Badge variant="outline" className="text-orange-600 border-orange-600 text-xs">
                                      ⚠ Not Deductible
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                                      ✓ Tax Deductible
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              
                              {expense.notes && (
                                <div className="mt-3 pt-3 border-t">
                                  <p className="text-sm text-muted-foreground">{expense.notes}</p>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No Expenses Found</h3>
                    <p className="text-muted-foreground mb-4">Start logging expenses to see them in chronological order.</p>
                    <Button onClick={() => setShowExpenseForm(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Log Your First Expense
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Timeline Summary Stats */}
              {timelineEntries.length > 0 && (
                <Card data-testid="card-timeline-summary">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Timeline Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-foreground">{timelineEntries.length}</p>
                        <p className="text-sm text-muted-foreground">Days with Expenses</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-foreground">
                          {timelineEntries.reduce((sum, entry) => sum + entry.expenses.length, 0)}
                        </p>
                        <p className="text-sm text-muted-foreground">Total Transactions</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-foreground">
                          ${Math.round(timelineEntries.reduce((sum, entry) => sum + entry.total, 0) / timelineEntries.length).toLocaleString()}
                        </p>
                        <p className="text-sm text-muted-foreground">Average Daily Spending</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-foreground">
                          ${Math.max(...timelineEntries.map(entry => entry.total)).toLocaleString()}
                        </p>
                        <p className="text-sm text-muted-foreground">Highest Daily Total</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </main>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteExpenseId} onOpenChange={() => setDeleteExpenseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this expense? This action cannot be undone and will permanently remove the expense record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteExpenseId) {
                  deleteExpenseMutation.mutate(deleteExpenseId);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteExpenseMutation.isPending}
            >
              {deleteExpenseMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mortgage Adjustment Dialog */}
      <Dialog open={showMortgageAdjustment} onOpenChange={setShowMortgageAdjustment}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Mortgage Interest Adjustment</DialogTitle>
          </DialogHeader>
          <MortgageAdjustmentForm 
            properties={properties}
            onClose={() => setShowMortgageAdjustment(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
