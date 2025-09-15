import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calculator, FileText, Users, Download, AlertCircle, TrendingUp, Clock } from "lucide-react";
import PropertyAssistant from "@/components/ai/property-assistant";
import MortgageAdjustmentForm from "@/components/forms/mortgage-adjustment-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Property, Transaction, Vendor } from "@shared/schema";

interface TaxData {
  properties: Property[];
  transactions: Transaction[];
  vendors: Vendor[];
  depreciationAssets: any[];
}

export default function Tax() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("schedule-e");
  const [showMortgageAdjustment, setShowMortgageAdjustment] = useState(false);

  // Redirect to home if not authenticated
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

  // Fetch all tax-related data
  const { data: properties = [], error: propertiesError } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });
  const { data: transactions = [], error: transactionsError } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });
  const { data: vendors = [], error: vendorsError } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });
  const { data: depreciationAssets = [] } = useQuery<any[]>({
    queryKey: ["/api/depreciation-assets"],
  });

  // Handle query errors
  useEffect(() => {
    const errors = [propertiesError, transactionsError, vendorsError];
    for (const error of errors) {
      if (error && isUnauthorizedError(error)) {
        toast({
          title: "Session Expired",
          description: "Please log in again.",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 1000);
        return;
      }
    }
  }, [propertiesError, transactionsError, vendorsError, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Calculate tax metrics
  const expenseTransactions = transactions.filter((t: Transaction) => t.type === "Expense");
  const uncategorizedExpenses = expenseTransactions.filter((t: Transaction) => 
    t.taxDeductible && !t.scheduleECategory
  );
  const vendorsNeed1099 = vendors.filter((v: Vendor) => v.vendorType === "individual" && !v.w9OnFile);
  
  // Calculate total annual expenses by Schedule E category
  const currentYear = new Date().getFullYear();
  const currentYearExpenses = expenseTransactions.filter((t: Transaction) => 
    new Date(t.date).getFullYear() === currentYear
  );
  
  const totalExpenses = currentYearExpenses.reduce((sum: number, t: Transaction) => 
    sum + parseFloat(t.amount), 0
  );

  // Prepare context for Mailla AI
  const taxData: TaxData = {
    properties,
    transactions: currentYearExpenses,
    vendors,
    depreciationAssets
  };

  const contextInfo = `Tax Center Analysis - ${currentYear} Tax Year:
- Total Properties: ${properties.length}
- Current Year Expenses: ${currentYearExpenses.length} transactions totaling $${totalExpenses.toLocaleString()}
- Uncategorized Expenses: ${uncategorizedExpenses.length} (${((uncategorizedExpenses.length / Math.max(expenseTransactions.length, 1)) * 100).toFixed(1)}%)
- Schedule E Categories: ${new Set(currentYearExpenses.filter((t: Transaction) => t.scheduleECategory).map((t: Transaction) => t.scheduleECategory)).size} different categories used
- 1099 Vendors: ${vendorsNeed1099.length} vendors need W-9 forms
- Depreciation Assets: ${depreciationAssets.length} assets being tracked
- Tax Readiness: ${uncategorizedExpenses.length === 0 ? 'Ready for Schedule E preparation' : 'Needs expense categorization'}`;

  return (
    <div className="flex h-screen bg-background" data-testid="page-tax">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Tax Center" />
        
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Tax Center</h1>
                <p className="text-muted-foreground mt-1">
                  Schedule E preparation, depreciation tracking, and 1099 reporting
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" data-testid="button-export-all">
                  <Download className="h-4 w-4 mr-2" />
                  Export All
                </Button>
              </div>
            </div>

            {/* Mortgage Split Tool - Top Priority Banner */}
            {(() => {
              const mortgageExpenses = expenseTransactions.filter((t: Transaction) => 
                t.category === "Mortgage" && new Date(t.date).getFullYear() === currentYear
              );
              
              if (mortgageExpenses.length > 0) {
                return (
                  <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 border-blue-200 dark:border-blue-800">
                    <CardHeader className="pb-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                            <Calculator className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div>
                            <CardTitle className="text-xl text-blue-900 dark:text-blue-100">🏠 Year-End Mortgage Interest Split</CardTitle>
                            <CardDescription className="text-blue-700 dark:text-blue-300 mt-1">
                              Ready for tax season? Split your {mortgageExpenses.length} mortgage payments into deductible interest vs non-deductible principal
                            </CardDescription>
                          </div>
                        </div>
                        <Button 
                          onClick={() => setShowMortgageAdjustment(true)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2"
                          data-testid="button-mortgage-split-top"
                        >
                          Split Mortgage Payments
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                          <FileText className="h-4 w-4" />
                          <span><strong>When:</strong> After receiving Form 1098</span>
                        </div>
                        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                          <TrendingUp className="h-4 w-4" />
                          <span><strong>Result:</strong> Auto-categorizes interest as deductible</span>
                        </div>
                        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                          <Clock className="h-4 w-4" />
                          <span><strong>Saves:</strong> Manual categorization for each payment</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              }
              return null;
            })()}

            {/* Tax Metrics Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${totalExpenses.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">{currentYear} tax year</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Uncategorized</CardTitle>
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{uncategorizedExpenses.length}</div>
                  <p className="text-xs text-muted-foreground">expenses need categories</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">1099 Vendors</CardTitle>
                  <Users className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{vendorsNeed1099.length}</div>
                  <p className="text-xs text-muted-foreground">need W-9 forms</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Assets</CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{depreciationAssets.length}</div>
                  <p className="text-xs text-muted-foreground">depreciation assets</p>
                </CardContent>
              </Card>
            </div>

            {/* Mailla AI Assistant for Tax Analysis */}
            <PropertyAssistant 
              context={contextInfo}
              exampleQuestions={[
                "What Schedule E categories am I missing?",
                "How much depreciation can I claim this year?", 
                "Which vendors need 1099 forms?",
                "Am I ready for tax season?"
              ]}
            />

            {/* Main Tax Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="schedule-e" data-testid="tab-schedule-e">
                  <FileText className="h-4 w-4 mr-2" />
                  Schedule E
                </TabsTrigger>
                <TabsTrigger value="depreciation" data-testid="tab-depreciation">
                  <Calculator className="h-4 w-4 mr-2" />
                  Depreciation
                </TabsTrigger>
                <TabsTrigger value="1099" data-testid="tab-1099">
                  <Users className="h-4 w-4 mr-2" />
                  1099 Reports
                </TabsTrigger>
                <TabsTrigger value="exports" data-testid="tab-exports">
                  <Download className="h-4 w-4 mr-2" />
                  Exports
                </TabsTrigger>
              </TabsList>

              <TabsContent value="schedule-e" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Schedule E - Rental Income & Expenses</CardTitle>
                    <CardDescription>
                      IRS Schedule E categorization for your rental properties
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {uncategorizedExpenses.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertCircle className="h-4 w-4 text-amber-600" />
                          <h3 className="font-semibold text-amber-800">Action Required</h3>
                        </div>
                        <p className="text-amber-700 text-sm mb-3">
                          You have {uncategorizedExpenses.length} uncategorized expenses that need Schedule E categories.
                        </p>
                        <Button 
                          size="sm" 
                          data-testid="button-categorize-expenses"
                          onClick={() => window.location.href = '/expenses?filter=uncategorized'}
                        >
                          Categorize Expenses
                        </Button>
                      </div>
                    )}

                    {/* Mortgage Interest Adjustment */}
                    <Card className="bg-blue-50 dark:bg-blue-950/50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Calculator className="h-5 w-5" />
                          Mortgage Interest Adjustment
                        </CardTitle>
                        <CardDescription>
                          Split mortgage payments into deductible interest vs. non-deductible principal using your Form 1098
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <p className="text-sm text-muted-foreground">
                            Enter your actual interest paid from your mortgage company's year-end statement (Form 1098) 
                            to accurately split mortgage payments for tax reporting.
                          </p>
                          <div className="bg-white dark:bg-gray-900 p-3 rounded border text-xs">
                            <strong>How it works:</strong> Finds all "Mortgage" expenses for the year and splits them 
                            into "Interest" (Schedule E deductible) and "Principal" (non-deductible) based on your actual Form 1098 amounts.
                            Handles partial year ownership automatically.
                          </div>
                          <Button 
                            onClick={() => setShowMortgageAdjustment(true)}
                            className="w-full"
                            data-testid="button-mortgage-adjustment"
                          >
                            Adjust Mortgage Interest
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <h3 className="font-semibold mb-2">Schedule E Report</h3>
                      <p className="text-sm">
                        Detailed Schedule E report will be displayed here once categorization is complete.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="depreciation" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Depreciation Assets</CardTitle>
                    <CardDescription>
                      Track building, improvement, and equipment depreciation
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-semibold">Assets ({depreciationAssets.length})</h3>
                      <Button data-testid="button-add-asset">Add Asset</Button>
                    </div>

                    {depreciationAssets.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Calculator className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <h3 className="font-semibold mb-2">No Depreciation Assets</h3>
                        <p className="text-sm">
                          Add your buildings, improvements, and equipment to start tracking depreciation.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {depreciationAssets.map((asset: any) => (
                          <div key={asset.id} className="border rounded-lg p-4">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-semibold">{asset.name}</h4>
                                <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                                  <span>Type: <Badge variant="outline">{asset.assetType}</Badge></span>
                                  <span>Cost: ${parseFloat(asset.originalCost).toLocaleString()}</span>
                                  <span>Recovery: {asset.recoveryPeriod} years</span>
                                </div>
                              </div>
                              <Button variant="outline" size="sm">Edit</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="1099" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>1099 Vendor Reports</CardTitle>
                    <CardDescription>
                      Track contractors and service providers for 1099-NEC reporting
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {vendorsNeed1099.length > 0 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Users className="h-4 w-4 text-blue-600" />
                          <h3 className="font-semibold text-blue-800">W-9 Forms Needed</h3>
                        </div>
                        <p className="text-blue-700 text-sm mb-3">
                          {vendorsNeed1099.length} vendors need W-9 forms on file before you can generate 1099s.
                        </p>
                        <Button size="sm" variant="outline" data-testid="button-manage-w9">
                          Manage W-9 Forms
                        </Button>
                      </div>
                    )}

                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <h3 className="font-semibold mb-2">1099 Report</h3>
                      <p className="text-sm">
                        1099-NEC report for vendors with payments over $600 will be displayed here.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="exports" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Tax Data Exports</CardTitle>
                    <CardDescription>
                      Export tax data for TurboTax, TaxAct, and other tax software
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Schedule E Export</CardTitle>
                          <CardDescription>CSV format compatible with tax software</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Button className="w-full" data-testid="button-export-schedule-e">
                            <Download className="h-4 w-4 mr-2" />
                            Export Schedule E
                          </Button>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">1099 Export</CardTitle>
                          <CardDescription>Vendor payment summaries for 1099 preparation</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Button className="w-full" data-testid="button-export-1099">
                            <Download className="h-4 w-4 mr-2" />
                            Export 1099 Data
                          </Button>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Depreciation Export</CardTitle>
                          <CardDescription>Asset depreciation schedules and calculations</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Button className="w-full" data-testid="button-export-depreciation">
                            <Download className="h-4 w-4 mr-2" />
                            Export Depreciation
                          </Button>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Complete Package</CardTitle>
                          <CardDescription>All tax data in a ZIP file</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Button className="w-full" variant="default" data-testid="button-export-package">
                            <Download className="h-4 w-4 mr-2" />
                            Export Tax Package
                          </Button>
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>

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
    </div>
  );
}