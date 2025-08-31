import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import PropertyForm from "@/components/forms/property-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Building, Plus, MapPin, Home, Calendar, Building2, Filter, ChevronDown, ChevronRight, Bed, Bath, DollarSign } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Property, OwnershipEntity, Unit } from "@shared/schema";

// Extended property type that includes ownership information  
type PropertyWithOwnerships = Property & {
  ownerships?: Array<{
    entityId: string;
    percent: number;
    entityName: string;
    entityType: string;
  }>;
};

export default function Properties() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<string>("all");
  const [editingProperty, setEditingProperty] = useState<PropertyWithOwnerships | null>(null);
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());

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

  const { data: properties, isLoading: propertiesLoading, error } = useQuery<PropertyWithOwnerships[]>({
    queryKey: ["/api/properties"],
    retry: false,
  });

  const { data: entities } = useQuery<OwnershipEntity[]>({
    queryKey: ["/api/entities"],
    retry: false,
  });

  // Fetch units for expanded properties
  const { data: allUnits = [] } = useQuery<Unit[]>({
    queryKey: ["/api/units"],
    retry: false,
    enabled: expandedProperties.size > 0,
  });

  const createPropertyMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/properties", data);
      return response.json();
    },
    onSuccess: (response) => {
      // Invalidate both properties and units queries since we might have created a unit too
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/units"] });
      setShowPropertyForm(false);
      
      const message = response.unit 
        ? "Property and default unit created successfully" 
        : "Property created successfully";
      
      toast({
        title: "Success",
        description: message,
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
        description: "Failed to create property",
        variant: "destructive",
      });
    },
  });

  const updatePropertyMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/properties/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      setShowPropertyForm(false);
      setEditingProperty(null);
      toast({
        title: "Success",
        description: "Property updated successfully",
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
        description: "Failed to update property",
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

  // Filter properties by selected ownership entity
  const filteredProperties = properties?.filter((property) => {
    if (selectedEntity === "all") return true;
    return property.ownerships?.some((ownership: any) => ownership.entityId === selectedEntity);
  }) || [];

  const handleEditProperty = async (property: PropertyWithOwnerships) => {
    setEditingProperty(property);
    
    // Fetch the property's units to get appliance data
    try {
      const unitsResponse = await apiRequest("GET", `/api/units`);
      const units: Unit[] = await unitsResponse.json();
      const propertyUnits = units.filter(unit => unit.propertyId === property.id);
      
      // Add the first unit as defaultUnit to the editing property
      if (propertyUnits.length > 0) {
        const firstUnit = propertyUnits[0];
        
        // Fetch appliances for this unit
        const appliancesResponse = await apiRequest("GET", `/api/units/${firstUnit.id}/appliances`);
        const appliances = await appliancesResponse.json();
        
        (property as any).defaultUnit = {
          id: firstUnit.id,
          label: firstUnit.label,
          bedrooms: firstUnit.bedrooms,
          bathrooms: firstUnit.bathrooms ? parseFloat(firstUnit.bathrooms) : undefined,
          sqft: firstUnit.sqft,
          rentAmount: firstUnit.rentAmount,
          deposit: firstUnit.deposit,
          notes: firstUnit.notes,
          hvacBrand: firstUnit.hvacBrand,
          hvacModel: firstUnit.hvacModel,
          hvacYear: firstUnit.hvacYear,
          hvacLifetime: firstUnit.hvacLifetime,
          hvacReminder: firstUnit.hvacReminder,
          waterHeaterBrand: firstUnit.waterHeaterBrand,
          waterHeaterModel: firstUnit.waterHeaterModel,
          waterHeaterYear: firstUnit.waterHeaterYear,
          waterHeaterLifetime: firstUnit.waterHeaterLifetime,
          waterHeaterReminder: firstUnit.waterHeaterReminder,
          applianceNotes: firstUnit.applianceNotes,
          appliances: appliances || [],
        };
      }
    } catch (error) {
      console.error("Error loading unit data:", error);
      // Continue with editing even if unit data fails to load
    }
    
    setShowPropertyForm(true);
  };

  const handleCloseForm = () => {
    setShowPropertyForm(false);
    setEditingProperty(null);
  };

  const handleFormSubmit = (data: any) => {
    if (editingProperty) {
      updatePropertyMutation.mutate({ id: editingProperty.id, data });
    } else {
      createPropertyMutation.mutate(data);
    }
  };

  const togglePropertyUnits = (propertyId: string) => {
    setExpandedProperties(prev => {
      const newSet = new Set(prev);
      if (newSet.has(propertyId)) {
        newSet.delete(propertyId);
      } else {
        newSet.add(propertyId);
      }
      return newSet;
    });
  };

  const getPropertyUnits = (propertyId: string): Unit[] => {
    return allUnits.filter(unit => unit.propertyId === propertyId);
  };

  return (
    <div className="flex h-screen bg-background" data-testid="page-properties">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="My Properties" />
        
        <main className="flex-1 overflow-auto p-6 bg-muted/30">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">Properties</h1>
              <p className="text-muted-foreground">Manage your property portfolio</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedEntity} onValueChange={setSelectedEntity}>
                  <SelectTrigger className="w-48" data-testid="select-entity-filter">
                    <SelectValue placeholder="Filter by ownership" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Entities</SelectItem>
                    {entities?.map((entity) => (
                      <SelectItem key={entity.id} value={entity.id}>
                        <div className="flex items-center space-x-2">
                          <Building2 className="h-3 w-3" />
                          <span>{entity.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {entity.type}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Button onClick={() => setShowPropertyForm(true)} data-testid="button-add-property">
                <Plus className="h-4 w-4 mr-2" />
                Add Property
              </Button>
              
              <Dialog open={showPropertyForm} onOpenChange={handleCloseForm}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingProperty ? "Edit Property" : "Add New Property"}</DialogTitle>
                </DialogHeader>
                <PropertyForm 
                  entities={entities || []}
                  onSubmit={handleFormSubmit}
                  onCancel={handleCloseForm}
                  isLoading={createPropertyMutation.isPending || updatePropertyMutation.isPending}
                  initialData={editingProperty ? {
                    name: editingProperty.name,
                    type: editingProperty.type,
                    street: editingProperty.street,
                    city: editingProperty.city,
                    state: editingProperty.state,
                    zipCode: editingProperty.zipCode,
                    yearBuilt: editingProperty.yearBuilt || undefined,
                    sqft: editingProperty.sqft || undefined,
                    hoaName: editingProperty.hoaName || "",
                    hoaContact: editingProperty.hoaContact || "",
                    notes: editingProperty.notes || "",
                    ownerships: editingProperty.ownerships?.map(o => ({
                      entityId: o.entityId,
                      percent: o.percent
                    })) || [],
                    createDefaultUnit: (editingProperty as any).defaultUnit ? true : false,
                    defaultUnit: (editingProperty as any).defaultUnit || {
                      label: "",
                      bedrooms: undefined,
                      bathrooms: undefined,
                      sqft: undefined,
                      rentAmount: "",
                      deposit: "",
                      notes: "",
                      hvacBrand: "",
                      hvacModel: "",
                      hvacYear: undefined,
                      hvacLifetime: undefined,
                      hvacReminder: false,
                      waterHeaterBrand: "",
                      waterHeaterModel: "",
                      waterHeaterYear: undefined,
                      waterHeaterLifetime: undefined,
                      waterHeaterReminder: false,
                      applianceNotes: "",
                      appliances: [],
                    }
                  } : undefined}
                />
              </DialogContent>
            </Dialog>
            </div>
          </div>

          {propertiesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} data-testid={`skeleton-property-${i}`}>
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
          ) : (filteredProperties && filteredProperties.length > 0) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProperties.map((property, index) => (
                <Card key={property.id} className="hover:shadow-md transition-shadow" data-testid={`card-property-${index}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Building className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg" data-testid={`text-property-name-${index}`}>{property.name}</CardTitle>
                          <div className="flex items-center space-x-2 mt-1">
                            <Badge variant="secondary" data-testid={`badge-property-type-${index}`}>{property.type}</Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span data-testid={`text-property-address-${index}`}>
                          {property.street}, {property.city}, {property.state} {property.zipCode}
                        </span>
                      </div>
                      
                      {property.yearBuilt && (
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span data-testid={`text-property-year-${index}`}>Built in {property.yearBuilt}</span>
                        </div>
                      )}
                      
                      {property.sqft && (
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                          <Home className="h-4 w-4" />
                          <span data-testid={`text-property-sqft-${index}`}>{property.sqft.toLocaleString()} sq ft</span>
                        </div>
                      )}
                      
                      {property.notes && (
                        <p className="text-sm text-muted-foreground" data-testid={`text-property-notes-${index}`}>
                          {property.notes}
                        </p>
                      )}
                      
                      {/* Ownership Information */}
                      {property.ownerships && property.ownerships.length > 0 && (
                        <div className="border-t pt-3 mt-3">
                          <div className="flex items-center space-x-2 mb-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-foreground">Ownership</span>
                          </div>
                          <div className="space-y-1">
                            {property.ownerships.map((ownership, ownershipIndex) => (
                              <div key={ownershipIndex} className="flex items-center justify-between text-sm">
                                <div className="flex items-center space-x-2">
                                  <Badge variant="outline" className="text-xs">
                                    {ownership.entityType}
                                  </Badge>
                                  <span data-testid={`text-ownership-entity-${index}-${ownershipIndex}`}>
                                    {ownership.entityName}
                                  </span>
                                </div>
                                <span className="font-medium text-primary" data-testid={`text-ownership-percent-${index}-${ownershipIndex}`}>
                                  {ownership.percent}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Units Section - Show when expanded */}
                    {expandedProperties.has(property.id) && (
                      <div className="border-t pt-4 mt-4">
                        <div className="flex items-center space-x-2 mb-3">
                          <Home className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium text-foreground">Units</span>
                        </div>
                        
                        {getPropertyUnits(property.id).length > 0 ? (
                          <div className="space-y-3">
                            {getPropertyUnits(property.id).map((unit, unitIndex) => (
                              <div key={unit.id} className="bg-muted/50 rounded-lg p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-medium text-sm" data-testid={`text-unit-label-${index}-${unitIndex}`}>
                                    {unit.label}
                                  </h4>
                                  {unit.rentAmount && (
                                    <div className="flex items-center space-x-1 text-sm font-medium text-green-600">
                                      <DollarSign className="h-3 w-3" />
                                      <span data-testid={`text-unit-rent-${index}-${unitIndex}`}>
                                        ${unit.rentAmount.toLocaleString()}/mo
                                      </span>
                                    </div>
                                  )}
                                </div>
                                
                                <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                                  {unit.bedrooms !== null && (
                                    <div className="flex items-center space-x-1">
                                      <Bed className="h-3 w-3" />
                                      <span>{unit.bedrooms} bed</span>
                                    </div>
                                  )}
                                  {unit.bathrooms !== null && (
                                    <div className="flex items-center space-x-1">
                                      <Bath className="h-3 w-3" />
                                      <span>{unit.bathrooms} bath</span>
                                    </div>
                                  )}
                                  {unit.sqft && (
                                    <div className="flex items-center space-x-1">
                                      <Home className="h-3 w-3" />
                                      <span>{unit.sqft.toLocaleString()} sq ft</span>
                                    </div>
                                  )}
                                </div>
                                
                                {unit.notes && (
                                  <p className="text-xs text-muted-foreground" data-testid={`text-unit-notes-${index}-${unitIndex}`}>
                                    {unit.notes}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-4 text-muted-foreground">
                            <Home className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Default Unit</p>
                            <p className="text-xs">This property has one main unit. Click Edit to add unit details.</p>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="flex space-x-2 mt-4">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1" 
                        onClick={() => togglePropertyUnits(property.id)}
                        data-testid={`button-view-units-${index}`}
                      >
                        {expandedProperties.has(property.id) ? (
                          <ChevronDown className="h-4 w-4 mr-2" />
                        ) : (
                          <ChevronRight className="h-4 w-4 mr-2" />
                        )}
                        Units ({Math.max(getPropertyUnits(property.id).length, 1)})
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1" 
                        onClick={() => handleEditProperty(property)}
                        data-testid={`button-edit-property-${index}`}
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
                <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2" data-testid="text-no-properties">No Properties Yet</h3>
                <p className="text-muted-foreground mb-4">Start building your property portfolio by adding your first property.</p>
                <Button onClick={() => setShowPropertyForm(true)} data-testid="button-add-first-property">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Property
                </Button>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
