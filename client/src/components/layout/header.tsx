import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import QuickAddModal from "@/components/modals/quick-add-modal";
import ReminderForm from "@/components/forms/reminder-form";
import { useAuth, UserRole } from "@/hooks/useAuth";
import { useRolePreview } from "@/hooks/useRolePreview";
import { Search, Bell, Plus, Settings, UserCheck, RefreshCw } from "lucide-react";
import type { Notification, Property, OwnershipEntity, Unit } from "@shared/schema";
import mitLogoUrl from "@assets/generated_images/MIT_logo_black_transparent_d4456daa.png";

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { previewRole, setPreviewRole, isPreviewing, originalRole, isDevMode, effectiveRole } = useRolePreview();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Role options for the switcher
  const roleOptions: { value: UserRole; label: string; description: string }[] = [
    { value: 'admin', label: 'Admin', description: 'Full system access and case management' },
    { value: 'vendor', label: 'Contractor', description: 'Maintenance cases and availability' },
    { value: 'manager', label: 'Manager', description: 'Property management access' },
    { value: 'staff', label: 'Staff', description: 'Staff level access' }
  ];

  const handleRoleChange = (newRole: UserRole) => {
    setPreviewRole(newRole);
    toast({
      title: "Role Preview Active",
      description: `Now viewing as ${roleOptions.find(r => r.value === newRole)?.label}`,
      duration: 2000
    });
  };

  const resetRole = () => {
    setPreviewRole(null);
    toast({
      title: "Role Preview Cleared",
      description: `Back to your ${originalRole} role`,
      duration: 2000
    });
  };

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    retry: false,
  });

  const { data: properties } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    retry: false,
  });

  const { data: entities } = useQuery<OwnershipEntity[]>({
    queryKey: ["/api/entities"],
    retry: false,
  });

  const { data: units } = useQuery<Unit[]>({
    queryKey: ["/api/units"],
    retry: false,
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

  const unreadNotifications = notifications?.filter(n => !n.isRead).length || 0;

  return (
    <>
      <header className="h-16 !bg-white dark:!bg-gray-900 border-b border-border flex items-center justify-between px-6" data-testid="header">
        <div className="flex items-center space-x-4 min-w-0 flex-1 !bg-transparent">
          <div className="flex items-center space-x-3 min-w-0 !bg-transparent">
            <div className="flex items-center space-x-2 min-w-0 !bg-transparent">
              <img 
                src={mitLogoUrl} 
                alt="MIT" 
                className="h-6 w-auto flex-shrink-0 opacity-90"
                data-testid="img-mit-logo"
              />
              <div className="flex flex-col min-w-0 max-w-28 !bg-transparent">
                <h1 className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate" data-testid="text-header-title">Housing</h1>
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate" data-testid="text-subtitle">Management</span>
              </div>
            </div>
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400 hidden md:block" data-testid="text-welcome">
            Welcome back, {user?.firstName || "User"}
          </span>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              type="text"
              placeholder="Search housing facilities, students, maintenance..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 w-64"
              data-testid="input-search"
            />
          </div>
          
          {/* Notifications */}
          <Button 
            variant="ghost" 
            size="sm" 
            className="relative !bg-pink-100 hover:!bg-pink-200" 
            onClick={() => setShowReminderForm(true)}
            data-testid="button-notifications"
          >
            <Bell className="h-5 w-5 text-pink-700" />
            {unreadNotifications > 0 && (
              <Badge className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-pink-500 text-white text-xs flex items-center justify-center p-0" data-testid="badge-notification-count">
                {unreadNotifications}
              </Badge>
            )}
          </Button>
          
          {/* Development Role Switcher */}
          {isDevMode && (
            <div className="flex items-center space-x-2 min-w-0">
              <div className="flex flex-col items-end min-w-0">
                <Select value={previewRole || originalRole || 'admin'} onValueChange={handleRoleChange}>
                  <SelectTrigger className="w-36 h-8 text-xs border-dashed border-orange-300 bg-orange-50 hover:bg-orange-100">
                    <div className="flex items-center space-x-1 truncate">
                      <UserCheck className="h-3 w-3 flex-shrink-0" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        <div className="flex flex-col">
                          <span className="font-medium">{role.label}</span>
                          <span className="text-xs text-muted-foreground">{role.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isPreviewing && (
                  <div className="flex items-center space-x-1 mt-1">
                    <span className="text-xs text-orange-600 font-medium whitespace-nowrap">Preview Mode</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetRole}
                      className="h-4 w-4 p-0 text-orange-600 hover:text-orange-800 flex-shrink-0"
                      data-testid="button-reset-role"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Quick Add */}
          <Button onClick={() => setShowQuickAdd(true)} data-testid="button-quick-add">
            <Plus className="h-4 w-4 mr-2" />
            Quick Add
          </Button>
        </div>
      </header>

      <QuickAddModal 
        open={showQuickAdd} 
        onOpenChange={setShowQuickAdd}
        onReminderClick={() => {
          setShowQuickAdd(false);
          setShowReminderForm(true);
        }}
      />

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
    </>
  );
}
