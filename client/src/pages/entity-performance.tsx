import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/lib/authUtils";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building, DollarSign, TrendingUp, Home, ArrowLeft, Building2, Globe } from "lucide-react";
import { useParams, useLocation } from "wouter";
import type { OwnershipEntity } from "@shared/schema";

// Type for entity performance data
type EntityPerformance = {
  entity: OwnershipEntity;
  properties: Array<{
    id: string;
    name: string;
    type: string;
    street: string;
    city: string;
    state: string;
    ownershipPercent: number;
    estimatedValue?: number;
  }>;
  metrics: {
    totalProperties: number;
    totalValue: number;
    monthlyRevenue: number;
    monthlyExpenses: number;
    netCashFlow: number;
    totalOwnershipValue: number;
  };
};

export default function EntityPerformance() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const { id } = useParams();
  const [, setLocation] = useLocation();

  // Redirect to login if not authenticated
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

  const { data: performance, isLoading: performanceLoading, error } = useQuery<EntityPerformance>({
    queryKey: ["/api/entities", id, "performance"],
    retry: false,
    enabled: !!id,
  });

  if (isLoading || !isAuthenticated) {
    return null;
  }

  if (error && isUnauthorizedError(error as Error)) {
    return null;
  }

  const getEntityIcon = (type: string) => {
    switch (type) {
      case "LLC":
        return <Building2 className="h-6 w-6 text-blue-600" />;
      case "Individual":
        return <Globe className="h-6 w-6 text-green-600" />;
      default:
        return <Building2 className="h-6 w-6 text-gray-600" />;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="flex h-screen bg-background" data-testid="page-entity-performance">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Entity Performance" />
        
        <main className="flex-1 overflow-auto p-6 bg-muted/30">
          <div className="mb-6">
            <Button 
              variant="outline" 
              onClick={() => setLocation("/entities")}
              className="mb-4"
              data-testid="button-back-to-entities"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Entities
            </Button>

            {performance && (
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center">
                  {getEntityIcon(performance.entity.type)}
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-foreground" data-testid="text-entity-name">
                    {performance.entity.name}
                  </h1>
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary" data-testid="badge-entity-type">
                      {performance.entity.type}
                    </Badge>
                    {performance.entity.state && (
                      <span className="text-muted-foreground">• {performance.entity.state}</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {performanceLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div className="h-6 bg-muted animate-pulse rounded" />
                      <div className="h-8 bg-muted animate-pulse rounded w-3/4" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : performance ? (
            <>
              {/* Performance Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Properties</CardTitle>
                    <Home className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-total-properties">
                      {performance.metrics.totalProperties}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Portfolio Value</CardTitle>
                    <Building className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-portfolio-value">
                      {formatCurrency(performance.metrics.totalOwnershipValue)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Based on ownership percentages
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-monthly-revenue">
                      {formatCurrency(performance.metrics.monthlyRevenue)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Net Cash Flow</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${performance.metrics.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid="text-net-cash-flow">
                      {formatCurrency(performance.metrics.netCashFlow)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Revenue - Expenses
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Properties Owned */}
              <Card>
                <CardHeader>
                  <CardTitle>Properties Owned</CardTitle>
                </CardHeader>
                <CardContent>
                  {performance.properties.length > 0 ? (
                    <div className="space-y-4">
                      {performance.properties.map((property, index) => (
                        <div key={property.id} className="flex items-center justify-between p-4 border rounded-lg" data-testid={`property-item-${index}`}>
                          <div className="flex-1">
                            <h4 className="font-semibold" data-testid={`text-property-name-${index}`}>
                              {property.name}
                            </h4>
                            <p className="text-sm text-muted-foreground" data-testid={`text-property-address-${index}`}>
                              {property.street}, {property.city}, {property.state}
                            </p>
                            <div className="flex items-center space-x-2 mt-1">
                              <Badge variant="outline">{property.type}</Badge>
                              <span className="text-sm text-muted-foreground">
                                {property.ownershipPercent}% ownership
                              </span>
                            </div>
                          </div>
                          {property.estimatedValue && (
                            <div className="text-right">
                              <p className="font-semibold" data-testid={`text-property-value-${index}`}>
                                {formatCurrency(property.estimatedValue * (property.ownershipPercent / 100))}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Your share
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2" data-testid="text-no-properties">No Properties</h3>
                      <p className="text-muted-foreground">This entity doesn't own any properties yet.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2" data-testid="text-entity-not-found">Entity Not Found</h3>
                <p className="text-muted-foreground mb-4">The requested entity could not be found.</p>
                <Button onClick={() => setLocation("/entities")} data-testid="button-back-to-entities-error">
                  Back to Entities
                </Button>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}