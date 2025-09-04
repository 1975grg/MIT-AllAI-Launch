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
import { Building, DollarSign, TrendingUp, Home, ArrowLeft, Building2, Users, Calendar } from "lucide-react";
import { useParams, useLocation } from "wouter";
import type { Property } from "@shared/schema";

// Type for property performance data
type PropertyPerformance = {
  property: Property;
  entities: Array<{
    id: string;
    name: string;
    type: string;
    ownershipPercent: number;
  }>;
  units: Array<{
    id: string;
    label: string;
    bedrooms?: number;
    bathrooms?: string;
    sqft?: number;
    rentAmount?: string;
  }>;
  metrics: {
    totalUnits: number;
    estimatedValue: number;
    currentValue: number;
    monthlyRevenue: number;
    expectedMonthlyRevenue: number;
    actualMonthlyRevenue: number;
    collectionRate: number;
    monthlyExpenses: number;
    netCashFlow: number;
    appreciationGain: number;
    totalOwners: number;
  };
};

export default function PropertyPerformance() {
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

  const { data: performance, isLoading: performanceLoading, error } = useQuery<PropertyPerformance>({
    queryKey: ["/api/properties", id, "performance"],
    retry: false,
    enabled: !!id,
  });

  if (isLoading || !isAuthenticated) {
    return null;
  }

  if (error && isUnauthorizedError(error as Error)) {
    return null;
  }

  const getPropertyIcon = (type: string) => {
    switch (type) {
      case "Single Family":
        return <Home className="h-6 w-6 text-blue-600" />;
      case "Townhome":
        return <Building className="h-6 w-6 text-green-600" />;
      case "Condo":
        return <Building2 className="h-6 w-6 text-purple-600" />;
      case "Multi-Family":
        return <Building2 className="h-6 w-6 text-orange-600" />;
      case "Commercial":
        return <Building2 className="h-6 w-6 text-red-600" />;
      default:
        return <Building className="h-6 w-6 text-gray-600" />;
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
    <div className="flex h-screen bg-background" data-testid="page-property-performance">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Property Performance" />
        
        <main className="flex-1 overflow-auto p-6 bg-muted/30">
          <div className="mb-6">
            <Button 
              variant="outline" 
              onClick={() => setLocation("/properties")}
              className="mb-4"
              data-testid="button-back-to-properties"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Properties
            </Button>

            {performance && (
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center">
                  {getPropertyIcon(performance.property.type)}
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-foreground" data-testid="text-property-name">
                    {performance.property.name}
                  </h1>
                  <p className="text-muted-foreground" data-testid="text-property-address">
                    {performance.property.street}, {performance.property.city}, {performance.property.state} {performance.property.zipCode}
                  </p>
                  <div className="flex items-center space-x-2 mt-1">
                    <Badge variant="secondary" data-testid="badge-property-type">
                      {performance.property.type}
                    </Badge>
                    {performance.property.yearBuilt && (
                      <span className="text-muted-foreground">• Built in {performance.property.yearBuilt}</span>
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
                    <CardTitle className="text-sm font-medium">Current Value</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-current-value">
                      {formatCurrency(performance.metrics.currentValue)}
                    </div>
                    {performance.metrics.appreciationGain !== 0 && (
                      <p className={`text-xs ${performance.metrics.appreciationGain > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {performance.metrics.appreciationGain > 0 ? '+' : ''}{formatCurrency(performance.metrics.appreciationGain)} appreciation
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Units</CardTitle>
                    <Home className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-total-units">
                      {performance.metrics.totalUnits}
                    </div>
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

              {/* Revenue Collection Analysis */}
              <div className="mb-8">
                <h2 className="text-xl font-semibold mb-4 flex items-center space-x-2">
                  <Calendar className="h-5 w-5" />
                  <span>Revenue Collection Analysis</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Expected Revenue</CardTitle>
                      <DollarSign className="h-4 w-4 text-orange-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-orange-600" data-testid="text-expected-revenue">
                        {formatCurrency(performance.metrics.expectedMonthlyRevenue)}
                      </div>
                      <p className="text-xs text-muted-foreground">From recurring revenue rules</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Actual Collected</CardTitle>
                      <DollarSign className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600" data-testid="text-actual-revenue">
                        {formatCurrency(performance.metrics.actualMonthlyRevenue)}
                      </div>
                      <p className="text-xs text-muted-foreground">Paid & partial payments</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Collection Rate</CardTitle>
                      <TrendingUp className={`h-4 w-4 ${performance.metrics.collectionRate >= 95 ? 'text-green-600' : performance.metrics.collectionRate >= 80 ? 'text-yellow-600' : 'text-red-600'}`} />
                    </CardHeader>
                    <CardContent>
                      <div className={`text-2xl font-bold ${performance.metrics.collectionRate >= 95 ? 'text-green-600' : performance.metrics.collectionRate >= 80 ? 'text-yellow-600' : 'text-red-600'}`} data-testid="text-collection-rate">
                        {performance.metrics.collectionRate}%
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {performance.metrics.expectedMonthlyRevenue > 0 
                          ? `${formatCurrency(performance.metrics.expectedMonthlyRevenue - performance.metrics.actualMonthlyRevenue)} outstanding`
                          : 'No recurring revenue set up'
                        }
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Property Details Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Ownership Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Users className="h-5 w-5" />
                      <span>Ownership Structure</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {performance.entities.length > 0 ? (
                      <div className="space-y-4">
                        {performance.entities.map((entity, index) => (
                          <div key={entity.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`ownership-item-${index}`}>
                            <div className="flex-1">
                              <h4 className="font-semibold" data-testid={`text-entity-name-${index}`}>
                                {entity.name}
                              </h4>
                              <Badge variant="outline">{entity.type}</Badge>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-lg" data-testid={`text-ownership-percent-${index}`}>
                                {entity.ownershipPercent}%
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatCurrency(performance.metrics.currentValue * (entity.ownershipPercent / 100))}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2" data-testid="text-no-owners">No Ownership Data</h3>
                        <p className="text-muted-foreground">No ownership entities assigned to this property.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Units Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Building className="h-5 w-5" />
                      <span>Units</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {performance.units.length > 0 ? (
                      <div className="space-y-4">
                        {performance.units.map((unit, index) => (
                          <div key={unit.id} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`unit-item-${index}`}>
                            <div className="flex-1">
                              <h4 className="font-semibold" data-testid={`text-unit-label-${index}`}>
                                {unit.label || `Unit ${index + 1}`}
                              </h4>
                              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                                {unit.bedrooms && <span>{unit.bedrooms} bed</span>}
                                {unit.bathrooms && <span>• {unit.bathrooms} bath</span>}
                                {unit.sqft && <span>• {unit.sqft} sq ft</span>}
                              </div>
                            </div>
                            {unit.rentAmount && (
                              <div className="text-right">
                                <p className="font-semibold" data-testid={`text-unit-rent-${index}`}>
                                  {formatCurrency(Number(unit.rentAmount))}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Monthly rent
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2" data-testid="text-no-units">No Units</h3>
                        <p className="text-muted-foreground">No units have been created for this property.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2" data-testid="text-property-not-found">Property Not Found</h3>
                <p className="text-muted-foreground mb-4">The requested property could not be found.</p>
                <Button onClick={() => setLocation("/properties")} data-testid="button-back-to-properties-error">
                  Back to Properties
                </Button>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}