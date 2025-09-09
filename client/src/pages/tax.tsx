import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { isUnauthorizedError } from "@/lib/authUtils";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calculator, FileText, TrendingUp } from "lucide-react";
import MortgageAdjustmentForm from "@/components/forms/mortgage-adjustment-form";
import type { Property } from "@shared/schema";

export default function Tax() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
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

  // Fetch properties
  const { data: properties = [], error } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  // Handle query errors
  useEffect(() => {
    if (error && isUnauthorizedError(error)) {
      toast({
        title: "Session Expired",
        description: "Please log in again.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 1000);
    }
  }, [error, toast]);

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

  return (
    <div className="flex h-screen bg-background" data-testid="page-tax">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Tax</h1>
        <p className="text-muted-foreground" data-testid="text-page-description">
          Manage tax-related features, adjustments, and reporting for your properties.
        </p>
      </div>

      {/* Tax Features Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        
        {/* Mortgage Interest Adjustment */}
        <Card className="hover:shadow-md transition-shadow" data-testid="card-mortgage-adjustment">
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-2">
              <Calculator className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Mortgage Adjustments</CardTitle>
            </div>
            <CardDescription>
              Adjust interest allocation for mortgage payments based on actual interest paid.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog open={showMortgageAdjustment} onOpenChange={setShowMortgageAdjustment}>
              <DialogTrigger asChild>
                <Button className="w-full" data-testid="button-mortgage-adjustments">
                  <Calculator className="h-4 w-4 mr-2" />
                  Process Adjustments
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Year-End Mortgage Interest Adjustment</DialogTitle>
                  <DialogDescription>
                    Split mortgage payments into deductible interest and non-deductible principal based on actual interest paid.
                  </DialogDescription>
                </DialogHeader>
                <MortgageAdjustmentForm
                  properties={properties}
                  onClose={() => setShowMortgageAdjustment(false)}
                />
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Tax Reports */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" data-testid="card-tax-reports">
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Tax Reports</CardTitle>
            </div>
            <CardDescription>
              Generate tax reports and summaries for your rental properties.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" disabled data-testid="button-tax-reports">
              <FileText className="h-4 w-4 mr-2" />
              Coming Soon
            </Button>
          </CardContent>
        </Card>

        {/* Year-End Summary */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" data-testid="card-year-end-summary">
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Year-End Summary</CardTitle>
            </div>
            <CardDescription>
              View comprehensive year-end tax summary for all properties.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" disabled data-testid="button-year-end-summary">
              <TrendingUp className="h-4 w-4 mr-2" />
              Coming Soon
            </Button>
          </CardContent>
        </Card>

      </div>

      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Tax Management</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            This section consolidates all tax-related features for your rental properties. 
            Use mortgage adjustments to accurately allocate interest vs. principal for tax reporting. 
            Additional tax features will be added over time to support comprehensive rental property tax management.
          </p>
        </CardContent>
      </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}