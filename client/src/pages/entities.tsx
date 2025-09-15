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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Building2, Plus, Calendar, FileText, Globe, Bell, Archive, RotateCcw, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import type { OwnershipEntity, Property, Unit } from "@shared/schema";
import EntityForm from "@/components/forms/entity-form";
import ReminderForm from "@/components/forms/reminder-form";
import { useEntityPropertyCount } from "@/hooks/useEntityPropertyCount";

// Extended entity type that includes status information  
type EntityWithStatus = OwnershipEntity & {
  status?: "Active" | "Archived"; // Add status with default
};

export default function Entities() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [editingEntity, setEditingEntity] = useState<EntityWithStatus | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState<string | null>(null);
  const [showUnarchiveConfirm, setShowUnarchiveConfirm] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [, setLocation] = useLocation();

  // Get property count for the entity being archived
  const { data: propertyCount, isLoading: propertyCountLoading } = useEntityPropertyCount(showArchiveConfirm || undefined);

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

  const { data: entities, isLoading: entitiesLoading, error } = useQuery<EntityWithStatus[]>({
    queryKey: ["/api/entities"],
    retry: false,
  });

  const { data: properties } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    retry: false,
  });

  const { data: units } = useQuery<Unit[]>({
    queryKey: ["/api/units"],
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

  const archiveEntityMutation = useMutation({
    mutationFn: async (entityId: string) => {
      const response = await apiRequest("PATCH", `/api/entities/${entityId}/archive`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(JSON.stringify(errorData));
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities"] });
      setShowArchiveConfirm(null);
      toast({
        title: "Success",
        description: "Entity archived successfully",
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
      
      // Handle property ownership error
      try {
        const errorData = JSON.parse(error.message);
        if (errorData.error === "ENTITY_OWNS_PROPERTIES") {
          toast({
            title: "Cannot Archive Entity",
            description: errorData.details || "Entity owns properties. Please reassign ownership first.",
            variant: "destructive",
          });
          return;
        }
      } catch {
        // Fall through to default error handling
      }
      
      toast({
        title: "Error",
        description: "Failed to archive entity",
        variant: "destructive",
      });
    },
  });

  const unarchiveEntityMutation = useMutation({
    mutationFn: async (entityId: string) => {
      const response = await apiRequest("PATCH", `/api/entities/${entityId}/unarchive`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities"] });
      setShowUnarchiveConfirm(null);
      toast({
        title: "Success",
        description: "Entity unarchived successfully",
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
        description: "Failed to unarchive entity",
        variant: "destructive",
      });
    },
  });

  const createReminderMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/reminders", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reminders"] });
      setShowReminderForm(false);
      toast({
        title: "Success",
        description: "Reminder created successfully",
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
        description: "Failed to create reminder",
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

  const handleEditEntity = (entity: EntityWithStatus) => {
    setEditingEntity(entity);
    setShowEntityForm(true);
  };

  const handleCloseForm = () => {
    setShowEntityForm(false);
    setEditingEntity(null);
  };

  const handleOpenChange = (open: boolean) => {
    setShowEntityForm(open);
    if (!open) {
      setEditingEntity(null);
    }
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

  // Filter entities based on archive status
  const filteredEntities = entities?.filter((entity) => {
    // Filter by archive status
    const isArchived = entity.status === "Archived";
    const statusMatch = showArchived ? isArchived : !isArchived;
    
    return statusMatch;
  }) || [];

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
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Switch 
                  id="show-archived-entities"
                  checked={showArchived}
                  onCheckedChange={setShowArchived}
                  data-testid="toggle-view-archived-entities"
                />
                <Label htmlFor="show-archived-entities" className="text-sm">
                  View Archived ({showArchived ? filteredEntities.length : 'Hidden'})
                </Label>
              </div>
              
              <div className="flex gap-2">
              <Button 
                variant="outline"
                onClick={() => setShowReminderForm(true)}
                data-testid="button-add-reminder"
              >
                <Bell className="h-4 w-4 mr-2" />
                Add Reminder
              </Button>
              
              <Dialog open={showEntityForm} onOpenChange={handleOpenChange}>
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
                  onCancel={handleCloseForm}
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
            </div>
          </div>

          {/* Archive Confirmation Dialog */}
            <Dialog open={!!showArchiveConfirm} onOpenChange={() => setShowArchiveConfirm(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Archive Entity</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {propertyCountLoading ? (
                    <div className="text-sm text-muted-foreground">
                      Checking property ownership...
                    </div>
                  ) : propertyCount && propertyCount.count > 0 ? (
                    // Show warning if entity owns properties
                    <div className="space-y-4">
                      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Archive className="h-4 w-4 text-red-600" />
                          <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                            Cannot Archive Entity
                          </p>
                        </div>
                        <p className="text-sm text-red-700 dark:text-red-300 mb-3">
                          This entity owns {propertyCount.count} propert{propertyCount.count === 1 ? 'y' : 'ies'}:
                        </p>
                        <ul className="text-sm text-red-700 dark:text-red-300 list-disc list-inside space-y-1">
                          {propertyCount.properties.map(property => (
                            <li key={property.id}>{property.name}</li>
                          ))}
                        </ul>
                        <p className="text-sm text-red-700 dark:text-red-300 mt-3 font-medium">
                          Please reassign property ownership before archiving this entity.
                        </p>
                      </div>
                    </div>
                  ) : (
                    // Show normal archive dialog if no properties owned
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Archive this ownership entity? This will:
                      </p>
                      <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                        <li>Mark entity as "Archived" - it won't show in active lists</li>
                        <li>Preserve all historical data and ownership records</li>
                        <li>Allow you to view it in archived entity reports</li>
                      </ul>
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                          💡 <strong>Tip:</strong> Use this when you dissolve an entity or stop using it for property ownership while keeping compliance records.
                        </p>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex justify-end space-x-2 pt-4">
                    <Button 
                      variant="outline" 
                      onClick={() => setShowArchiveConfirm(null)}
                      disabled={archiveEntityMutation.isPending}
                    >
                      Cancel
                    </Button>
                    <Button 
                      variant="secondary" 
                      onClick={() => {
                        if (showArchiveConfirm) {
                          archiveEntityMutation.mutate(showArchiveConfirm);
                        }
                      }}
                      disabled={archiveEntityMutation.isPending || (propertyCount && propertyCount.count > 0)}
                      data-testid="button-archive-entity"
                    >
                      <Archive className="h-4 w-4 mr-2" />
                      {archiveEntityMutation.isPending ? "Archiving..." : "Archive Entity"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Unarchive Confirmation Dialog */}
            <Dialog open={!!showUnarchiveConfirm} onOpenChange={() => setShowUnarchiveConfirm(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Unarchive Entity</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Unarchive this entity? This will:
                  </p>
                  <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                    <li>Mark entity as "Active" - it will show in active entity lists</li>
                    <li>Restore access to all property ownership features</li>
                    <li>Include it in active entity reports and dashboards</li>
                  </ul>
                  <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                    <p className="text-sm text-green-800 dark:text-green-200">
                      ✅ <strong>Tip:</strong> Use this to reactivate an entity you want to use for property ownership again.
                    </p>
                  </div>
                  <div className="flex justify-end space-x-2 pt-4">
                    <Button 
                      variant="outline" 
                      onClick={() => setShowUnarchiveConfirm(null)}
                      disabled={unarchiveEntityMutation.isPending}
                    >
                      Cancel
                    </Button>
                    <Button 
                      variant="default" 
                      onClick={() => {
                        if (showUnarchiveConfirm) {
                          unarchiveEntityMutation.mutate(showUnarchiveConfirm);
                        }
                      }}
                      disabled={unarchiveEntityMutation.isPending}
                      data-testid="button-unarchive-entity"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      {unarchiveEntityMutation.isPending ? "Unarchiving..." : "Unarchive Entity"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Reminder Dialog */}
            <Dialog open={showReminderForm} onOpenChange={setShowReminderForm}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create New Reminder</DialogTitle>
                </DialogHeader>
                <ReminderForm 
                  properties={properties || []}
                  entities={entities || []}
                  units={units || []}
                  onSubmit={(data) => createReminderMutation.mutate(data)}
                  onCancel={() => setShowReminderForm(false)}
                  isLoading={createReminderMutation.isPending}
                />
              </DialogContent>
            </Dialog>

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
              {filteredEntities.map((entity, index) => (
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
                      {entity.status === "Archived" ? (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="px-3" 
                          onClick={() => setShowUnarchiveConfirm(entity.id)}
                          data-testid={`button-unarchive-entity-${index}`}
                          disabled={unarchiveEntityMutation.isPending}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="px-3" 
                          onClick={() => setShowArchiveConfirm(entity.id)}
                          data-testid={`button-archive-entity-${index}`}
                          disabled={archiveEntityMutation.isPending}
                        >
                          <Archive className="h-3 w-3" />
                        </Button>
                      )}
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