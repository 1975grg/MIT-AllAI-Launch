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
import { Building, Plus, MapPin, Home, ArrowLeft, Bed, Bath, DollarSign, Hash } from "lucide-react";
import type { Property, Unit } from "@shared/schema";

interface PropertyUnitsProps {
  propertyId: string;
}

export default function PropertyUnits({ propertyId }: PropertyUnitsProps) {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);

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

  const { data: property } = useQuery<Property>({
    queryKey: ["/api/properties", propertyId],
    retry: false,
  });

  const { data: units = [], isLoading: unitsLoading } = useQuery<Unit[]>({
    queryKey: ["/api/properties", propertyId, "units"],
    retry: false,
  });

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen bg-background" data-testid="page-property-units">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={property ? `${property.name} - Units` : "Property Units"} />
        
        <main className="flex-1 overflow-auto p-6 bg-muted/30">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                onClick={() => window.history.back()}
                data-testid="button-back-to-properties"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Properties
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">
                  {property?.name} - Units
                </h1>
                <p className="text-muted-foreground">Manage units for this property</p>
              </div>
            </div>
            
            <Button onClick={() => setShowUnitForm(true)} data-testid="button-add-unit">
              <Plus className="h-4 w-4 mr-2" />
              Add Unit
            </Button>
          </div>

          {property && (
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Building className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle data-testid="text-property-name">{property.name}</CardTitle>
                    <div className="flex items-center space-x-2 mt-1">
                      <Badge variant="secondary" data-testid="badge-property-type">{property.type}</Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span data-testid="text-property-address">
                    {property.street}, {property.city}, {property.state} {property.zipCode}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {unitsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} data-testid={`skeleton-unit-${i}`}>
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
          ) : units.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {units.map((unit, index) => (
                <Card key={unit.id} className="hover:shadow-md transition-shadow" data-testid={`card-unit-${index}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Home className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg" data-testid={`text-unit-label-${index}`}>
                            {unit.label}
                          </CardTitle>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        {unit.bedrooms !== null && (
                          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                            <Bed className="h-4 w-4" />
                            <span data-testid={`text-unit-bedrooms-${index}`}>{unit.bedrooms} bed</span>
                          </div>
                        )}
                        
                        {unit.bathrooms !== null && (
                          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                            <Bath className="h-4 w-4" />
                            <span data-testid={`text-unit-bathrooms-${index}`}>{unit.bathrooms} bath</span>
                          </div>
                        )}
                      </div>
                      
                      {unit.sqft && (
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                          <Hash className="h-4 w-4" />
                          <span data-testid={`text-unit-sqft-${index}`}>{unit.sqft.toLocaleString()} sq ft</span>
                        </div>
                      )}
                      
                      {unit.floor && (
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                          <Building className="h-4 w-4" />
                          <span data-testid={`text-unit-floor-${index}`}>Floor {unit.floor}</span>
                        </div>
                      )}
                      
                      {unit.rentAmount && (
                        <div className="flex items-center space-x-2 text-sm font-medium text-green-600">
                          <DollarSign className="h-4 w-4" />
                          <span data-testid={`text-unit-rent-${index}`}>${unit.rentAmount.toLocaleString()}/month</span>
                        </div>
                      )}
                      
                      {unit.deposit && (
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                          <DollarSign className="h-4 w-4" />
                          <span data-testid={`text-unit-deposit-${index}`}>Deposit: ${unit.deposit.toLocaleString()}</span>
                        </div>
                      )}
                      
                      {unit.notes && (
                        <p className="text-sm text-muted-foreground" data-testid={`text-unit-notes-${index}`}>
                          {unit.notes}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex space-x-2 mt-4">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1" 
                        onClick={() => {
                          setEditingUnit(unit);
                          setShowUnitForm(true);
                        }}
                        data-testid={`button-edit-unit-${index}`}
                      >
                        Edit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <Home className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2" data-testid="text-no-units">No Units Yet</h3>
                <p className="text-muted-foreground mb-4">Add units to this property to start managing tenants and leases.</p>
                <Button onClick={() => setShowUnitForm(true)} data-testid="button-add-first-unit">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Unit
                </Button>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}