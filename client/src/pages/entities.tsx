import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Calendar, FileText, Globe } from "lucide-react";
import { useLocation } from "wouter";
import type { OwnershipEntity } from "@shared/schema";
import EntityForm from "@/components/forms/entity-form";

export default function Entities() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [editingEntity, setEditingEntity] = useState<OwnershipEntity | null>(null);
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

  const { data: entities, isLoading: entitiesLoading, error } = useQuery<OwnershipEntity[]>({
    queryKey: ["/api/entities"],
    retry: false,
  });

  const createEntityMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/entities", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities"] });
      setShowEntityForm(false);
      toast({
        title: "Success",
        description: "Entity created successfully",
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
        description: "Failed to create entity",
        variant: "destructive",
      });
    },
  });

  const updateEntityMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/entities/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities"] });
      setShowEntityForm(false);
      setEditingEntity(null);
      toast({
        title: "Success",
        description: "Entity updated successfully",
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
        description: "Failed to update entity",
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

  const handleEditEntity = (entity: OwnershipEntity) => {
    setEditingEntity(entity);
    setShowEntityForm(true);
  };

  const handleCloseForm = () => {
    setShowEntityForm(false);
    setEditingEntity(null);
  };

  const handleFormSubmit = (data: any) => {
    if (editingEntity) {
      updateEntityMutation.mutate({ id: editingEntity.id, data });
    } else {
      createEntityMutation.mutate(data);
    }
  };

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

  return (
    <div className="flex h-screen bg-background" data-testid="page-entities">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Ownership Entities" />
        
        <main className="flex-1 overflow-auto p-6 bg-muted/30">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">Ownership Entities</h1>
              <p className="text-muted-foreground">Manage your LLCs, partnerships, and individual ownership</p>
            </div>
            
            <Dialog open={showEntityForm} onOpenChange={handleCloseForm}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-entity">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Entity
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{editingEntity ? "Edit Ownership Entity" : "Add New Ownership Entity"}</DialogTitle>
                </DialogHeader>
                <EntityForm 
                  onSubmit={handleFormSubmit}
                  isLoading={createEntityMutation.isPending || updateEntityMutation.isPending}
                  initialData={editingEntity ? {
                    type: editingEntity.type as "LLC" | "Individual",
                    name: editingEntity.name,
                    state: editingEntity.state || "",
                    ein: editingEntity.ein || "",
                    registeredAgent: editingEntity.registeredAgent || "",
                    renewalMonth: editingEntity.renewalMonth || undefined,
                    notes: editingEntity.notes || ""
                  } : undefined}
                />
              </DialogContent>
            </Dialog>
          </div>

          {entitiesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} data-testid={`skeleton-entity-${i}`}>
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
          ) : (entities && entities.length > 0) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {entities.map((entity, index) => (
                <Card key={entity.id} className="hover:shadow-md transition-shadow" data-testid={`card-entity-${index}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                          {getEntityIcon(entity.type)}
                        </div>
                        <div>
                          <CardTitle className="text-lg" data-testid={`text-entity-name-${index}`}>{entity.name}</CardTitle>
                          <Badge variant="secondary" data-testid={`badge-entity-type-${index}`}>{entity.type}</Badge>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="space-y-3">
                      {entity.state && (
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                          <Globe className="h-4 w-4" />
                          <span data-testid={`text-entity-state-${index}`}>Registered in {entity.state}</span>
                        </div>
                      )}
                      
                      {entity.ein && (
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                          <FileText className="h-4 w-4" />
                          <span data-testid={`text-entity-ein-${index}`}>EIN: {entity.ein}</span>
                        </div>
                      )}
                      
                      {entity.renewalMonth && (
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span data-testid={`text-entity-renewal-${index}`}>
                            Renewal: {new Date(2024, entity.renewalMonth - 1).toLocaleString('default', { month: 'long' })}
                          </span>
                        </div>
                      )}
                      
                      {entity.registeredAgent && (
                        <div className="text-sm text-muted-foreground">
                          <strong>Registered Agent:</strong> {entity.registeredAgent}
                        </div>
                      )}
                      
                      {entity.notes && (
                        <p className="text-sm text-muted-foreground" data-testid={`text-entity-notes-${index}`}>
                          {entity.notes}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex space-x-2 mt-4">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1" 
                        onClick={() => setLocation(`/entities/${entity.id}/performance`)}
                        data-testid={`button-view-performance-${index}`}
                      >
                        View Performance
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1" 
                        onClick={() => handleEditEntity(entity)}
                        data-testid={`button-edit-entity-${index}`}
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
                <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2" data-testid="text-no-entities">No Entities Yet</h3>
                <p className="text-muted-foreground mb-4">Create your first ownership entity to organize your property portfolio.</p>
                <Button onClick={() => setShowEntityForm(true)} data-testid="button-create-first-entity">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Entity
                </Button>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}