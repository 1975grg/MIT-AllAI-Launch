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
import { Search, Bell, Plus, Settings } from "lucide-react";
import type { Notification, Property, OwnershipEntity, Unit } from "@shared/schema";
import mitLogoUrl from "@assets/generated_images/MIT_logo_black_transparent_d4456daa.png";

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { previewRole, setPreviewRole, isPreviewing, originalRole, isDevMode } = useRolePreview();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
      <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6" data-testid="header">
        <div className="flex items-center space-x-4 min-w-0 flex-1">
          <div className="flex items-center space-x-3 min-w-0">
            <img 
              src={mitLogoUrl} 
              alt="MIT" 
              className="h-8 w-auto flex-shrink-0"
              data-testid="img-mit-logo"
            />
            <div className="flex flex-col min-w-0 max-w-xs">
              <h1 className="text-base font-bold text-primary truncate" data-testid="text-header-title">MIT Student Housing</h1>
              <span className="text-xs text-muted-foreground truncate" data-testid="text-subtitle">Campus Management - {title}</span>
            </div>
          </div>
          <span className="text-sm text-muted-foreground hidden md:block" data-testid="text-welcome">
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
            className="relative" 
            onClick={() => setShowReminderForm(true)}
            data-testid="button-notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadNotifications > 0 && (
              <Badge className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center p-0" data-testid="badge-notification-count">
                {unreadNotifications}
              </Badge>
            )}
          </Button>
          
          {/* Dev Role Preview Toggle */}
          {isDevMode && (
            <div className="flex items-center space-x-2 px-3 py-1 bg-yellow-100 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-700 rounded-md">
              <Settings className="h-4 w-4 text-yellow-700 dark:text-yellow-300" />
              <Select 
                value={previewRole ?? "original"} 
                onValueChange={(value) => setPreviewRole(value === "original" ? null : value as UserRole)}
                data-testid="select-role-preview"
              >
                <SelectTrigger className="w-32 h-7 text-xs bg-transparent border-none shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {originalRole && (
                    <SelectItem value="original" data-testid="option-original-role">
                      Original ({originalRole})
                    </SelectItem>
                  )}
                  <SelectItem value="admin" data-testid="option-admin">Admin</SelectItem>
                  <SelectItem value="manager" data-testid="option-manager">Manager</SelectItem>
                  <SelectItem value="staff" data-testid="option-staff">Staff</SelectItem>
                  <SelectItem value="vendor" data-testid="option-vendor">Contractor</SelectItem>
                </SelectContent>
              </Select>
              {isPreviewing && (
                <Badge variant="outline" className="text-xs bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200">
                  Preview
                </Badge>
              )}
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
