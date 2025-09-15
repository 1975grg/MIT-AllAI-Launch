import { useState, useEffect } from "react";
import { useLocation } from "wouter";
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
import { Building, Plus, MapPin, Home, Calendar, Building2, Filter, ChevronDown, ChevronRight, Bed, Bath, DollarSign, Settings, Bell, Archive, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { Property, OwnershipEntity, Unit } from "@shared/schema";

// Extended property type that includes ownership information  
type PropertyWithOwnerships = Property & {
  status?: "Active" | "Archived"; // Add status with default
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
  const [, setLocation] = useLocation();
  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<string>("all");
  const [editingProperty, setEditingProperty] = useState<PropertyWithOwnerships | null>(null);
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());
  const [showArchiveConfirm, setShowArchiveConfirm] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

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

  // Fetch units for properties
  const { data: allUnits = [] } = useQuery<Unit[]>({
    queryKey: ["/api/units"],
    retry: false,
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
      queryClient.invalidateQueries({ queryKey: ["/api/units"] });
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

  const archivePropertyMutation = useMutation({
    mutationFn: async (propertyId: string) => {
      const response = await apiRequest("PATCH", `/api/properties/${propertyId}/archive`);
      if (response.status === 204) return null;
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/units"] });
      setShowArchiveConfirm(null);
      toast({
        title: "Success",
        description: "Property archived successfully",
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
        description: "Failed to archive property",
        variant: "destructive",
      });
    },
  });

  const deletePropertyMutation = useMutation({
    mutationFn: async (propertyId: string) => {
      const response = await apiRequest("DELETE", `/api/properties/${propertyId}/permanent`);
      if (response.status === 204) return null;
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/units"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leases"] });
      setShowDeleteConfirm(null);
      toast({
        title: "Success",
        description: "Property deleted permanently",
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
        description: "Failed to delete property",
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

  // Filter properties by selected ownership entity and archive status
  const filteredProperties = properties?.filter((property) => {
    // Filter by entity
    const entityMatch = selectedEntity === "all" || property.ownerships?.some((ownership: any) => ownership.entityId === selectedEntity);
    
    // Filter by archive status
    const isArchived = property.status === "Archived";
    const statusMatch = showArchived ? isArchived : !isArchived;
    
    return entityMatch && statusMatch;
  }) || [];

  const handleEditProperty = async (property: PropertyWithOwnerships) => {
    // Convert string values to correct types for form compatibility
    const propertyForEditing = {
      ...property,
      propertyValue: property.propertyValue ? Number(property.propertyValue) : undefined,
      appreciationRate: property.appreciationRate ? Number(property.appreciationRate) : undefined,
      // Convert mortgage fields to proper types
      monthlyMortgage: property.monthlyMortgage ? Number(property.monthlyMortgage) : undefined,
      interestRate: property.interestRate ? Number(property.interestRate) : undefined,
      purchasePrice: property.purchasePrice ? Number(property.purchasePrice) : undefined,
      downPayment: property.downPayment ? Number(property.downPayment) : undefined,
      salePrice: property.salePrice ? Number(property.salePrice) : undefined,
      // Convert date fields to Date objects
      acquisitionDate: property.acquisitionDate ? new Date(property.acquisitionDate) : undefined,
      saleDate: property.saleDate ? new Date(property.saleDate) : undefined,
      mortgageStartDate: property.mortgageStartDate ? new Date(property.mortgageStartDate) : undefined,
      mortgageStartDate2: property.mortgageStartDate2 ? new Date(property.mortgageStartDate2) : undefined,
    };
    
    // Fetch the property's units to get appliance data and determine numberOfUnits
    try {
      const unitsResponse = await apiRequest("GET", `/api/units`);
      const units: Unit[] = await unitsResponse.json();
      const propertyUnits = units.filter(unit => unit.propertyId === property.id);
      
      // Add units-related fields based on actual units (using type casting)
      (propertyForEditing as any).numberOfUnits = propertyUnits.length || 1;
      (propertyForEditing as any).hasMultipleUnits = propertyUnits.length > 1;
      (propertyForEditing as any).createDefaultUnit = propertyUnits.length > 0;
      
      console.log("🔧 Setting numberOfUnits to:", propertyUnits.length);
      console.log("🔧 Setting hasMultipleUnits to:", propertyUnits.length > 1);
      console.log("🔧 Final propertyForEditing:", propertyForEditing);
      
      // Add the first unit as defaultUnit to the editing property
      if (propertyUnits.length > 0) {
        const firstUnit = propertyUnits[0];
        
        // Fetch appliances for this unit
        const appliancesResponse = await apiRequest("GET", `/api/units/${firstUnit.id}/appliances`);
        const appliances = await appliancesResponse.json();
        
        (propertyForEditing as any).defaultUnit = {
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
        
        // Mark that this property has existing unit data but don't check the creation checkbox
        (propertyForEditing as any).hasExistingUnit = true;
        (propertyForEditing as any).createDefaultUnit = false;
      }
    } catch (error) {
      console.error("Error loading unit data:", error);
      // Continue with editing even if unit data fails to load
    }
    
    // Update the editing property with unit data (cast to expected type)
    setEditingProperty(propertyForEditing as any);
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
                
                <div className="flex items-center space-x-2">
                  <Switch 
                    id="show-archived"
                    checked={showArchived}
                    onCheckedChange={setShowArchived}
                    data-testid="toggle-view-archived"
                  />
                  <Label htmlFor="show-archived" className="text-sm">
                    View Archived ({showArchived ? filteredProperties.length : 'Hidden'})
                  </Label>
                </div>
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
                  initialData={editingProperty || undefined}
                />
              </DialogContent>
            </Dialog>

            {/* Archive Confirmation Dialog */}
            <Dialog open={!!showArchiveConfirm} onOpenChange={() => setShowArchiveConfirm(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Archive Property</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Archive this property? This will:
                  </p>
                  <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                    <li>Mark property as "Archived" - it won't show in active lists</li>
                    <li>Preserve all historical data, units, and lease information</li>
                    <li>Allow you to view it in archived property reports</li>
                  </ul>
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="text-sm text-blue-800">
                      💡 <strong>Tip:</strong> Use this when you sell a property or want to remove it from active management while keeping records.
                    </p>
                  </div>
                  <div className="flex justify-end space-x-2 pt-4">
                    <Button 
                      variant="outline" 
                      onClick={() => setShowArchiveConfirm(null)}
                      disabled={archivePropertyMutation.isPending}
                    >
                      Cancel
                    </Button>
                    <Button 
                      variant="secondary" 
                      onClick={() => {
                        if (showArchiveConfirm) {
                          archivePropertyMutation.mutate(showArchiveConfirm);
                        }
                      }}
                      disabled={archivePropertyMutation.isPending}
                    >
                      <Archive className="h-4 w-4 mr-2" />
                      {archivePropertyMutation.isPending ? "Archiving..." : "Archive Property"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-destructive">⚠️ Permanently Delete Property</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-destructive">This action cannot be undone.</strong> Permanently delete this property will:
                  </p>
                  <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                    <li className="text-destructive">Completely remove the property and all related data</li>
                    <li className="text-destructive">Delete all units, leases, and tenant information</li>
                    <li className="text-destructive">Remove all transaction history and financial records</li>
                    <li className="text-destructive">Delete all reminders and maintenance records</li>
                  </ul>
                  <div className="bg-red-50 border border-red-200 p-3 rounded-lg">
                    <p className="text-sm text-red-800">
                      🚨 <strong>Warning:</strong> Use this only for properties created by mistake. For properties you no longer manage, use <strong>Archive</strong> instead to preserve records.
                    </p>
                  </div>
                  <div className="flex justify-end space-x-2 pt-4">
                    <Button 
                      variant="outline" 
                      onClick={() => setShowDeleteConfirm(null)}
                      disabled={deletePropertyMutation.isPending}
                    >
                      Cancel
                    </Button>
                    <Button 
                      variant="destructive" 
                      onClick={() => {
                        if (showDeleteConfirm) {
                          deletePropertyMutation.mutate(showDeleteConfirm);
                        }
                      }}
                      disabled={deletePropertyMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {deletePropertyMutation.isPending ? "Deleting..." : "Delete Permanently"}
                    </Button>
                  </div>
                </div>
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
                <Card key={property.id} className={`hover:shadow-md transition-shadow ${property.status === "Archived" ? "border-orange-300 bg-orange-50/30 opacity-80" : ""}`} data-testid={`card-property-${index}`}>
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
                            {property.status === "Archived" && (
                              <Badge variant="outline" className="border-orange-300 text-orange-700 bg-orange-50" data-testid={`badge-archived-${index}`}>
                                Archived
                              </Badge>
                            )}
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

                    {/* Central Building Equipment Section - Show when expanded and is a building */}
                    {expandedProperties.has(property.id) && (property.type === "Residential Building" || property.type === "Commercial Building") && (
                      <div className="border-t pt-4 mt-4">
                        <div className="flex items-center space-x-2 mb-3">
                          <Settings className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium text-foreground">Central Building Equipment</span>
                        </div>
                        
                        {(property.buildingHvacBrand || property.buildingWaterBrand || property.buildingWaterShutoff || property.buildingElectricalPanel || property.buildingEquipmentNotes) ? (
                          <div className="bg-muted/30 rounded-lg p-3 space-y-3">
                            {/* Central HVAC */}
                            {(property.buildingHvacBrand || property.buildingHvacModel || property.buildingHvacYear) && (
                              <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                  <Settings className="h-3 w-3 text-blue-500" />
                                  <span className="text-xs font-medium text-blue-700">Central HVAC System</span>
                                  {property.buildingHvacReminder && (
                                    <div className="flex items-center space-x-1 text-xs text-orange-600">
                                      <span>📅</span>
                                      <span>Reminder</span>
                                    </div>
                                  )}
                                </div>
                                <div className="ml-5 text-xs text-muted-foreground space-y-1">
                                  {property.buildingHvacBrand && (
                                    <div><span className="font-medium">Brand:</span> {property.buildingHvacBrand}</div>
                                  )}
                                  {property.buildingHvacModel && (
                                    <div><span className="font-medium">Model:</span> {property.buildingHvacModel}</div>
                                  )}
                                  <div className="flex items-center space-x-4">
                                    {property.buildingHvacYear && (
                                      <span><span className="font-medium">Year:</span> {property.buildingHvacYear}</span>
                                    )}
                                    {property.buildingHvacLifetime && (
                                      <span><span className="font-medium">Expected lifetime:</span> {property.buildingHvacLifetime} years</span>
                                    )}
                                  </div>
                                  {property.buildingHvacLocation && (
                                    <div><span className="font-medium">Location:</span> {property.buildingHvacLocation}</div>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {/* Central Water/Boiler */}
                            {(property.buildingWaterBrand || property.buildingWaterModel || property.buildingWaterYear) && (
                              <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                  <Settings className="h-3 w-3 text-blue-500" />
                                  <span className="text-xs font-medium text-blue-700">Central Water/Boiler System</span>
                                  {property.buildingWaterReminder && (
                                    <div className="flex items-center space-x-1 text-xs text-orange-600">
                                      <span>📅</span>
                                      <span>Reminder</span>
                                    </div>
                                  )}
                                </div>
                                <div className="ml-5 text-xs text-muted-foreground space-y-1">
                                  {property.buildingWaterBrand && (
                                    <div><span className="font-medium">Brand:</span> {property.buildingWaterBrand}</div>
                                  )}
                                  {property.buildingWaterModel && (
                                    <div><span className="font-medium">Model:</span> {property.buildingWaterModel}</div>
                                  )}
                                  <div className="flex items-center space-x-4">
                                    {property.buildingWaterYear && (
                                      <span><span className="font-medium">Year:</span> {property.buildingWaterYear}</span>
                                    )}
                                    {property.buildingWaterLifetime && (
                                      <span><span className="font-medium">Expected lifetime:</span> {property.buildingWaterLifetime} years</span>
                                    )}
                                  </div>
                                  {property.buildingWaterLocation && (
                                    <div><span className="font-medium">Location:</span> {property.buildingWaterLocation}</div>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {/* Building Utilities */}
                            {(property.buildingWaterShutoff || property.buildingElectricalPanel) && (
                              <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                  <Settings className="h-3 w-3 text-green-500" />
                                  <span className="text-xs font-medium text-green-700">Building Utilities</span>
                                </div>
                                <div className="ml-5 text-xs text-muted-foreground space-y-1">
                                  {property.buildingWaterShutoff && (
                                    <div><span className="font-medium">Water shut-off:</span> {property.buildingWaterShutoff}</div>
                                  )}
                                  {property.buildingElectricalPanel && (
                                    <div><span className="font-medium">Electrical panel:</span> {property.buildingElectricalPanel}</div>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {/* Building Equipment Notes */}
                            {property.buildingEquipmentNotes && (
                              <div className="space-y-2">
                                <div className="flex items-center space-x-2">
                                  <Settings className="h-3 w-3 text-gray-500" />
                                  <span className="text-xs font-medium text-gray-700">Equipment Notes</span>
                                </div>
                                <div className="ml-5 text-xs text-muted-foreground">
                                  {property.buildingEquipmentNotes}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-4 text-muted-foreground">
                            <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No Central Equipment</p>
                            <p className="text-xs">Click Edit to add building equipment details.</p>
                          </div>
                        )}
                      </div>
                    )}

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
                                
                                {/* Equipment Section */}
                                {(unit.hvacBrand || unit.waterHeaterBrand || unit.applianceNotes) && (
                                  <div className="border-t pt-3 mt-3">
                                    <div className="flex items-center justify-between mb-3">
                                      <h5 className="text-xs font-medium text-foreground flex items-center space-x-1">
                                        <Settings className="h-3 w-3" />
                                        <span>Equipment</span>
                                      </h5>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-xs"
                                        onClick={() => handleEditProperty(property)}
                                        data-testid={`button-edit-equipment-${index}-${unitIndex}`}
                                      >
                                        Edit
                                      </Button>
                                    </div>
                                    
                                    <div className="space-y-3">
                                      {/* HVAC */}
                                      {unit.hvacBrand && (
                                        <div className="bg-blue-50 dark:bg-blue-950/20 rounded-md p-2 border-l-2 border-blue-400">
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-2">
                                              <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                                                <span className="text-blue-600 dark:text-blue-400 text-xs font-medium">H</span>
                                              </div>
                                              <div>
                                                <div className="text-xs font-medium text-blue-900 dark:text-blue-100">HVAC System</div>
                                                <div className="text-xs text-blue-700 dark:text-blue-300">
                                                  {unit.hvacBrand}
                                                  {unit.hvacModel && ` ${unit.hvacModel}`}
                                                  {unit.hvacYear && ` (${unit.hvacYear})`}
                                                </div>
                                              </div>
                                            </div>
                                            {unit.hvacReminder && (
                                              <div className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400">
                                                <Bell className="h-3 w-3" />
                                                <span>Reminder</span>
                                              </div>
                                            )}
                                          </div>
                                          {unit.hvacLifetime && (
                                            <div className="text-xs text-blue-600 dark:text-blue-400 mt-1 ml-8">
                                              Expected lifetime: {unit.hvacLifetime} years
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      
                                      {/* Water Heater */}
                                      {unit.waterHeaterBrand && (
                                        <div className="bg-orange-50 dark:bg-orange-950/20 rounded-md p-2 border-l-2 border-orange-400">
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-2">
                                              <div className="w-6 h-6 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                                                <span className="text-orange-600 dark:text-orange-400 text-xs font-medium">W</span>
                                              </div>
                                              <div>
                                                <div className="text-xs font-medium text-orange-900 dark:text-orange-100">Water Heater</div>
                                                <div className="text-xs text-orange-700 dark:text-orange-300">
                                                  {unit.waterHeaterBrand}
                                                  {unit.waterHeaterModel && ` ${unit.waterHeaterModel}`}
                                                  {unit.waterHeaterYear && ` (${unit.waterHeaterYear})`}
                                                </div>
                                              </div>
                                            </div>
                                            {unit.waterHeaterReminder && (
                                              <div className="flex items-center space-x-1 text-xs text-orange-600 dark:text-orange-400">
                                                <Bell className="h-3 w-3" />
                                                <span>Reminder</span>
                                              </div>
                                            )}
                                          </div>
                                          {unit.waterHeaterLifetime && (
                                            <div className="text-xs text-orange-600 dark:text-orange-400 mt-1 ml-8">
                                              Expected lifetime: {unit.waterHeaterLifetime} years
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      
                                      {/* Equipment Notes */}
                                      {unit.applianceNotes && (
                                        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-md p-2 border border-gray-200 dark:border-gray-700">
                                          <div className="text-xs">
                                            <span className="font-medium text-gray-700 dark:text-gray-300">Equipment Notes:</span>
                                            <div className="text-gray-600 dark:text-gray-400 mt-1">{unit.applianceNotes}</div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
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
                    
                    <div className="flex gap-2 mt-4 px-1">
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
                        onClick={() => setLocation(`/properties/${property.id}/performance`)}
                        data-testid={`button-view-performance-${index}`}
                      >
                        View Performance
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
                      {property.status !== "Archived" && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-10 justify-center" 
                          onClick={() => setShowArchiveConfirm(property.id)}
                          data-testid={`button-archive-property-${index}`}
                          disabled={archivePropertyMutation.isPending}
                        >
                          <Archive className="h-3 w-3" />
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-10 justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" 
                        onClick={() => setShowDeleteConfirm(property.id)}
                        data-testid={`button-delete-property-${index}`}
                      >
                        <Trash2 className="h-3 w-3" />
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
