import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import ExpenseForm from "@/components/forms/expense-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, Plus, DollarSign, Calendar, Building, Tag, Repeat, CheckCircle, Trash2 } from "lucide-react";
import type { Transaction, Property, Unit } from "@shared/schema";

export default function Expenses() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Transaction | null>(null);
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [unitFilter, setUnitFilter] = useState<string[]>([]);
  const [entityFilter, setEntityFilter] = useState<string>("all");

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

  const { data: entities = [] } = useQuery({
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
    const categoryMatch = categoryFilter === "all" || expense.category === categoryFilter;
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
    };
    return colors[category as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

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
                  />
                </DialogContent>
              </Dialog>
            </div>
          </div>

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
                            {expense.taxDeductible === false && (
                              <Badge variant="outline" className="text-orange-600 border-orange-600" data-testid={`badge-non-deductible-${index}`}>
                                Non-deductible
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <p className="text-xl font-bold text-foreground" data-testid={`text-expense-amount-${index}`}>
                            ${Number(expense.amount).toLocaleString()}
                          </p>
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
    </div>
  );
}
