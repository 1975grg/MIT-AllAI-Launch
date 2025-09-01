import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import TenantForm from "@/components/forms/tenant-form";
import LeaseForm from "@/components/forms/lease-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, Mail, Phone, User, FileText, DollarSign, Calendar, AlertTriangle, Trash2 } from "lucide-react";
import type { TenantGroup, Property, OwnershipEntity, Lease, Unit, InsertLease } from "@shared/schema";

export default function Tenants() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [showTenantForm, setShowTenantForm] = useState(false);
  const [showLeaseForm, setShowLeaseForm] = useState(false);
  const [selectedTenantGroup, setSelectedTenantGroup] = useState<TenantGroup | null>(null);
  const [selectedLease, setSelectedLease] = useState<Lease | null>(null);
  const [isRenewalMode, setIsRenewalMode] = useState(false);
  const [editingTenant, setEditingTenant] = useState<TenantGroup | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");

  // Helper function to determine tenant status
  const getTenantStatus = (group: TenantGroup, groupLeases: Lease[]) => {
    const activeLease = groupLeases.find(lease => lease.status === "Active");
    if (activeLease) {
      return "Current";
    } else if (groupLeases.length > 0) {
      return "Prior";
    }
    return "No Lease";
  };

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

  const { data: tenantGroups, isLoading: tenantsLoading, error } = useQuery<TenantGroup[]>({
    queryKey: ["/api/tenants"],
    retry: false,
  });

  const { data: properties } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    retry: false,
  });

  const { data: entities = [] } = useQuery<OwnershipEntity[]>({
    queryKey: ["/api/entities"],
    retry: false,
  });

  const { data: leases = [] } = useQuery<Lease[]>({
    queryKey: ["/api/leases"],
    retry: false,
  });

  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ["/api/units"],
    retry: false,
  });

  const createTenantMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/tenants", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      setShowTenantForm(false);
      toast({
        title: "Success",
        description: "Tenant created successfully",
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
        description: "Failed to create tenant",
        variant: "destructive",
      });
    },
  });

  const updateTenantMutation = useMutation({
    mutationFn: async ({ groupId, data }: { groupId: string; data: any }) => {
      const response = await apiRequest("PUT", `/api/tenants/${groupId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      setEditingTenant(null);
      setShowTenantForm(false);
      toast({
        title: "Success",
        description: "Tenant updated successfully",
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
        description: "Failed to update tenant",
        variant: "destructive",
      });
    },
  });

  const deleteTenantMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const response = await apiRequest("DELETE", `/api/tenants/${groupId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leases"] });
      setShowDeleteConfirm(null);
      toast({
        title: "Success",
        description: "Tenant deleted successfully",
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
        description: "Failed to delete tenant",
        variant: "destructive",
      });
    },
  });

  const createLeaseMutation = useMutation({
    mutationFn: async (data: InsertLease) => {
      const response = await apiRequest("POST", "/api/leases", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
      setShowLeaseForm(false);
      setSelectedTenantGroup(null);
      toast({
        title: "Success",
        description: "Lease created successfully",
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
        description: "Failed to create lease",
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

  const filteredProperties = properties || [];
  
  const filteredTenantGroups = tenantGroups?.filter(group => {
    // Filter by property
    const propertyMatch = propertyFilter === "all" || group.propertyId === propertyFilter;
    
    // Filter by entity (via property)
    if (entityFilter !== "all") {
      const property = properties?.find(p => p.id === group.propertyId);
      // For now, we'll skip entity filtering since we need property-entity relationships
      // This will be enhanced when we have the full property ownership data
    }
    
    return propertyMatch;
  }) || [];

  return (
    <div className="flex h-screen bg-background" data-testid="page-tenants">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Tenants" />
        
        <main className="flex-1 overflow-auto p-6 bg-muted/30">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">Tenants</h1>
              <p className="text-muted-foreground">Manage your tenant relationships</p>
            </div>
            
            <div className="flex items-center space-x-3">
              {/* Entity Filter */}
              <Select value={entityFilter} onValueChange={(value) => {
                setEntityFilter(value);
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

              {/* Property Filter */}
              <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                <SelectTrigger className="w-52" data-testid="select-property-filter">
                  <SelectValue placeholder="All Properties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Properties</SelectItem>
                  {(properties || []).map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.street}, {property.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Dialog open={showTenantForm} onOpenChange={(open) => {
                setShowTenantForm(open);
                if (!open) {
                  setEditingTenant(null);
                }
              }}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-tenant">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Tenant
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{editingTenant ? "Edit Tenant" : "Add New Tenant"}</DialogTitle>
                  </DialogHeader>
                  <TenantForm 
                    initialData={editingTenant || undefined}
                    onSubmit={(data) => {
                      if (editingTenant) {
                        updateTenantMutation.mutate({ groupId: editingTenant.id, data });
                      } else {
                        createTenantMutation.mutate(data);
                      }
                    }}
                    onCancel={() => {
                      setShowTenantForm(false);
                      setEditingTenant(null);
                    }}
                    isLoading={createTenantMutation.isPending || updateTenantMutation.isPending}
                  />
                </DialogContent>
              </Dialog>

              {/* Lease Management Dialog */}
              <Dialog open={showLeaseForm} onOpenChange={setShowLeaseForm}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Lease Management</DialogTitle>
                  </DialogHeader>
                  {selectedTenantGroup && (
                    <LeaseForm
                      tenantGroup={selectedTenantGroup}
                      units={units}
                      properties={properties}
                      existingLease={selectedLease || undefined}
                      isRenewal={isRenewalMode}
                      onSubmit={(data) => {
                        if (isRenewalMode) {
                          // For renewal, create a new lease with updated dates and rent
                          const renewalData = {
                            ...data,
                            // Set start date as day after current lease ends
                            startDate: selectedLease?.endDate ? new Date(new Date(selectedLease.endDate).getTime() + 24 * 60 * 60 * 1000) : data.startDate,
                          };
                          createLeaseMutation.mutate(renewalData);
                        } else {
                          createLeaseMutation.mutate(data);
                        }
                      }}
                      onCancel={() => {
                        setShowLeaseForm(false);
                        setSelectedTenantGroup(null);
                        setSelectedLease(null);
                        setIsRenewalMode(false);
                      }}
                      isLoading={createLeaseMutation.isPending}
                    />
                  )}
                </DialogContent>
              </Dialog>

              {/* Delete Confirmation Dialog */}
              <Dialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete Tenant</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Are you sure you want to delete this tenant? This action cannot be undone and will remove:
                    </p>
                    <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                      <li>All tenant information and contacts</li>
                      <li>Associated lease agreements</li>
                      <li>Historical rental data</li>
                    </ul>
                    <div className="flex justify-end space-x-2 pt-4">
                      <Button 
                        variant="outline" 
                        onClick={() => setShowDeleteConfirm(null)}
                        disabled={deleteTenantMutation.isPending}
                      >
                        Cancel
                      </Button>
                      <Button 
                        variant="destructive" 
                        onClick={() => {
                          if (showDeleteConfirm) {
                            deleteTenantMutation.mutate(showDeleteConfirm);
                          }
                        }}
                        disabled={deleteTenantMutation.isPending}
                      >
                        {deleteTenantMutation.isPending ? "Deleting..." : "Delete Tenant"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {tenantsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} data-testid={`skeleton-tenant-${i}`}>
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
          ) : (filteredTenantGroups && filteredTenantGroups.length > 0) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTenantGroups.map((group, index) => {
              const groupLeases = leases.filter(lease => lease.tenantGroupId === group.id);
              const activeLease = groupLeases.find(lease => lease.status === "Active");
              const isLeaseEndingSoon = (endDate: string | Date | null) => {
                if (!endDate) return false;
                const daysUntilEnd = Math.ceil((new Date(endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                return daysUntilEnd <= 90 && daysUntilEnd > 0;
              };
              
              return (
                <Card key={group.id} className="hover:shadow-md transition-shadow" data-testid={`card-tenant-${index}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                          <Users className="h-6 w-6 text-green-600" />
                        </div>
                        <div>
                          <CardTitle className="text-lg" data-testid={`text-tenant-name-${index}`}>{group.name}</CardTitle>
                          <Badge 
                            variant={getTenantStatus(group, groupLeases) === "Current" ? "default" : "secondary"} 
                            className={getTenantStatus(group, groupLeases) === "Current" ? "bg-green-100 text-green-800" : ""}
                            data-testid={`badge-tenant-status-${index}`}
                          >
                            {getTenantStatus(group, groupLeases)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground">
                        {group.propertyId && (
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="text-blue-600 font-medium">Property:</span>
                            <span data-testid={`text-tenant-property-${index}`}>
                              {(() => {
                                const property = properties?.find(p => p.id === group.propertyId);
                                return property ? `${property.street}, ${property.city}` : 'Property';
                              })()}
                            </span>
                          </div>
                        )}
                        
                        {/* Lease Information */}
                        {activeLease ? (
                          <>
                            <div className="flex items-center space-x-2 mb-2">
                              <DollarSign className="h-4 w-4 text-green-600" />
                              <span data-testid={`text-lease-rent-${index}`}>
                                ${activeLease.rent}/month
                              </span>
                              {isLeaseEndingSoon(activeLease.endDate) && (
                                <Badge variant="destructive" className="ml-2">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Expiring Soon
                                </Badge>
                              )}
                            </div>
                            
                            <div className="flex items-center space-x-2 mb-2">
                              <Calendar className="h-4 w-4" />
                              <span data-testid={`text-lease-dates-${index}`}>
                                {activeLease.startDate ? new Date(activeLease.startDate).toLocaleDateString() : 'N/A'} - {activeLease.endDate ? new Date(activeLease.endDate).toLocaleDateString() : 'N/A'}
                              </span>
                            </div>
                            
                            <div className="flex items-center space-x-2 mb-2">
                              <FileText className="h-4 w-4" />
                              <span data-testid={`text-lease-status-${index}`}>
                                Lease: {activeLease.status}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center space-x-2 mb-2 text-orange-600">
                            <AlertTriangle className="h-4 w-4" />
                            <span data-testid={`text-no-lease-${index}`}>No Active Lease</span>
                          </div>
                        )}
                        
                        <div className="flex items-center space-x-2 mb-2">
                          <User className="h-4 w-4" />
                          <span data-testid={`text-tenant-type-${index}`}>Tenant Group</span>
                        </div>
                      </div>
                      
                      <p className="text-sm text-muted-foreground" data-testid={`text-tenant-created-${index}`}>
                        Added {group.createdAt ? new Date(group.createdAt).toLocaleDateString() : 'Unknown'}
                      </p>
                    </div>
                    
                    <div className="flex space-x-2 mt-4">
                      {activeLease ? (
                        <>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1" 
                            onClick={() => {
                              setSelectedTenantGroup(group);
                              setShowLeaseForm(true);
                            }}
                            data-testid={`button-view-lease-${index}`}
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            Manage Lease
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1" 
                            onClick={() => {
                              setSelectedTenantGroup(group);
                              setSelectedLease(activeLease);
                              setIsRenewalMode(true);
                              setShowLeaseForm(true);
                            }}
                            data-testid={`button-renew-lease-${index}`}
                          >
                            <Calendar className="h-3 w-3 mr-1" />
                            Renew
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button 
                            variant="default" 
                            size="sm" 
                            className="flex-1" 
                            onClick={() => {
                              setSelectedTenantGroup(group);
                              setShowLeaseForm(true);
                            }}
                            data-testid={`button-create-lease-${index}`}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Create Lease
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1" 
                            onClick={() => {
                              setEditingTenant(group);
                              setShowTenantForm(true);
                            }}
                            data-testid={`button-edit-tenant-${index}`}
                          >
                            Edit
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm" 
                            className="flex-1" 
                            onClick={() => setShowDeleteConfirm(group.id)}
                            data-testid={`button-delete-tenant-${index}`}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2" data-testid="text-no-tenants">No Tenants Yet</h3>
                <p className="text-muted-foreground mb-4">Start managing tenant relationships by adding your first tenant.</p>
                <Button onClick={() => setShowTenantForm(true)} data-testid="button-add-first-tenant">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Tenant
                </Button>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
