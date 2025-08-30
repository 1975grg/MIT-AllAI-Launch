import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import TenantForm from "@/components/forms/tenant-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, Mail, Phone, User } from "lucide-react";

export default function Tenants() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [showTenantForm, setShowTenantForm] = useState(false);

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

  const { data: tenantGroups, isLoading: tenantsLoading, error } = useQuery({
    queryKey: ["/api/tenants"],
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

  if (isLoading || !isAuthenticated) {
    return null;
  }

  if (error && isUnauthorizedError(error as Error)) {
    return null;
  }

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
            
            <Dialog open={showTenantForm} onOpenChange={setShowTenantForm}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-tenant">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Tenant
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add New Tenant</DialogTitle>
                </DialogHeader>
                <TenantForm 
                  onSubmit={(data) => createTenantMutation.mutate(data)}
                  isLoading={createTenantMutation.isPending}
                />
              </DialogContent>
            </Dialog>
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
          ) : tenantGroups?.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tenantGroups.map((group, index) => (
                <Card key={group.id} className="hover:shadow-md transition-shadow" data-testid={`card-tenant-${index}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                          <Users className="h-6 w-6 text-green-600" />
                        </div>
                        <div>
                          <CardTitle className="text-lg" data-testid={`text-tenant-name-${index}`}>{group.name}</CardTitle>
                          <Badge variant="secondary" data-testid={`badge-tenant-status-${index}`}>Active</Badge>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground">
                        <div className="flex items-center space-x-2 mb-2">
                          <User className="h-4 w-4" />
                          <span data-testid={`text-tenant-type-${index}`}>Tenant Group</span>
                        </div>
                        
                        <div className="flex items-center space-x-2 mb-2">
                          <Mail className="h-4 w-4" />
                          <span data-testid={`text-tenant-email-${index}`}>contact@example.com</span>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Phone className="h-4 w-4" />
                          <span data-testid={`text-tenant-phone-${index}`}>(555) 123-4567</span>
                        </div>
                      </div>
                      
                      <p className="text-sm text-muted-foreground" data-testid={`text-tenant-created-${index}`}>
                        Added {new Date(group.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    
                    <div className="flex space-x-2 mt-4">
                      <Button variant="outline" size="sm" className="flex-1" data-testid={`button-view-lease-${index}`}>
                        View Lease
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1" data-testid={`button-edit-tenant-${index}`}>
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
