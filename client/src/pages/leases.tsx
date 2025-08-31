import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar, DollarSign, Users, Plus, Clock, FileText, AlertTriangle } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { Lease, Property, TenantGroup, Unit } from "@shared/schema";

export default function Leases() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [showLeaseForm, setShowLeaseForm] = useState(false);
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

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

  const { data: leases, isLoading: leasesLoading, error } = useQuery<Lease[]>({
    queryKey: ["/api/leases"],
    retry: false,
  });

  const { data: properties } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    retry: false,
  });

  const { data: tenantGroups } = useQuery<TenantGroup[]>({
    queryKey: ["/api/tenants"],
    retry: false,
  });

  const { data: units } = useQuery<Unit[]>({
    queryKey: ["/api/units"],
    retry: false,
  });

  if (isLoading || !isAuthenticated) {
    return null;
  }

  if (error && isUnauthorizedError(error as Error)) {
    return null;
  }

  const filteredLeases = leases?.filter(lease => {
    const statusMatch = statusFilter === "all" || lease.status === statusFilter;
    
    // Filter by property via unit
    const unit = units?.find(u => u.id === lease.unitId);
    const propertyMatch = propertyFilter === "all" || unit?.propertyId === propertyFilter;
    
    return statusMatch && propertyMatch;
  }) || [];

  const getLeaseStatusColor = (status: string) => {
    switch (status) {
      case "Active": return "bg-green-100 text-green-800";
      case "Pending": return "bg-yellow-100 text-yellow-800";
      case "Expired": return "bg-red-100 text-red-800";
      case "Terminated": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getLeaseInfo = (lease: Lease) => {
    const unit = units?.find(u => u.id === lease.unitId);
    const property = properties?.find(p => p.id === unit?.propertyId);
    const tenantGroup = tenantGroups?.find(tg => tg.id === lease.tenantGroupId);
    
    return {
      unit,
      property,
      tenantGroup,
    };
  };

  const isLeaseEndingSoon = (endDate: string | Date | null) => {
    if (!endDate) return false;
    const daysUntilEnd = Math.ceil((new Date(endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilEnd <= 90 && daysUntilEnd > 0;
  };

  return (
    <div className="flex h-screen bg-background" data-testid="page-leases">
      <Sidebar />
      
      <div className="flex-1 overflow-auto">
        <main className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Lease Management</h1>
              <p className="text-muted-foreground mt-1">Track and manage all your rental agreements</p>
            </div>
            
            <div className="flex items-center space-x-3">
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

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40" data-testid="select-status-filter">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Expired">Expired</SelectItem>
                  <SelectItem value="Terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>

              <Button data-testid="button-add-lease">
                <Plus className="h-4 w-4 mr-2" />
                Add Lease
              </Button>
            </div>
          </div>

          {leasesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} data-testid={`skeleton-lease-${i}`}>
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
          ) : (filteredLeases && filteredLeases.length > 0) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredLeases.map((lease, index) => {
                const { unit, property, tenantGroup } = getLeaseInfo(lease);
                const isEndingSoon = isLeaseEndingSoon(lease.endDate);
                
                return (
                  <Card key={lease.id} className="hover:shadow-md transition-shadow" data-testid={`card-lease-${index}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <FileText className="h-6 w-6 text-blue-600" />
                          </div>
                          <div>
                            <CardTitle className="text-lg" data-testid={`text-lease-property-${index}`}>
                              {property?.street || 'Property'} {unit?.label ? `(${unit.label})` : ''}
                            </CardTitle>
                            <div className="flex items-center space-x-2">
                              <Badge className={getLeaseStatusColor(lease.status)} data-testid={`badge-lease-status-${index}`}>
                                {lease.status}
                              </Badge>
                              {isEndingSoon && (
                                <Badge variant="destructive" data-testid={`badge-lease-expiring-${index}`}>
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Expiring Soon
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent>
                      <div className="space-y-3">
                        <div className="text-sm text-muted-foreground">
                          <div className="flex items-center space-x-2 mb-2">
                            <Users className="h-4 w-4" />
                            <span data-testid={`text-lease-tenant-${index}`}>
                              {tenantGroup?.name || 'Tenant Group'}
                            </span>
                          </div>
                          
                          <div className="flex items-center space-x-2 mb-2">
                            <DollarSign className="h-4 w-4" />
                            <span data-testid={`text-lease-rent-${index}`}>
                              ${lease.rent}/month
                            </span>
                          </div>
                          
                          <div className="flex items-center space-x-2 mb-2">
                            <Calendar className="h-4 w-4" />
                            <span data-testid={`text-lease-dates-${index}`}>
                              {lease.startDate ? new Date(lease.startDate).toLocaleDateString() : 'N/A'} - {lease.endDate ? new Date(lease.endDate).toLocaleDateString() : 'N/A'}
                            </span>
                          </div>

                          {lease.deposit && (
                            <div className="flex items-center space-x-2 mb-2">
                              <span className="text-blue-600 font-medium">Deposit:</span>
                              <span data-testid={`text-lease-deposit-${index}`}>
                                ${lease.deposit}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex space-x-2 mt-4">
                        <Button variant="outline" size="sm" className="flex-1" data-testid={`button-view-lease-${index}`}>
                          View Details
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1" data-testid={`button-record-payment-${index}`}>
                          <DollarSign className="h-3 w-3 mr-1" />
                          Record Payment
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="text-center py-16" data-testid="empty-leases-state">
              <CardContent>
                <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Leases Found</h3>
                <p className="text-muted-foreground mb-4">Start managing tenant relationships by creating your first lease agreement.</p>
                <Button data-testid="button-add-first-lease">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Lease
                </Button>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}