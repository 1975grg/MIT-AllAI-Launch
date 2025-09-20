import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import UserProfileForm from "@/components/forms/user-profile-form";
import { Building, Home, Users, Wrench, Receipt, DollarSign, Bell, Settings, Building2, User, LogOut, ChevronDown, Calculator, GraduationCap, HomeIcon } from "lucide-react";
import mitLogoUrl from "@assets/generated_images/MIT_logo_black_transparent_d4456daa.png";

export default function Sidebar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const [showProfileModal, setShowProfileModal] = useState(false);

  const navigation = [
    { name: "Dashboard", href: "/", icon: Home },
    { name: "Housing Facilities", href: "/properties", icon: Building },
    { name: "Housing Administration", href: "/entities", icon: Building2 },
    { name: "Students", href: "/tenants", icon: GraduationCap },
    { name: "Maintenance Requests", href: "/maintenance", icon: Wrench },
    { name: "Campus Contractors", href: "/vendors", icon: Receipt },
    { name: "Housing Payments", href: "/revenue", icon: DollarSign },
    { name: "Occupancy Analytics", href: "/tax", icon: Calculator },
    { name: "System Alerts", href: "/reminders", icon: Bell },
  ];

  const isActive = (path: string) => {
    if (path === "/" && location === "/") return true;
    if (path !== "/" && location.startsWith(path)) return true;
    return false;
  };

  return (
    <div className="w-64 !bg-white dark:!bg-gray-900 border-r border-border flex flex-col" data-testid="sidebar">
      {/* Logo/Header */}
      <div className="p-4 border-b border-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full p-0 h-auto justify-start hover:bg-muted/50" data-testid="button-brand-menu">
              <div className="flex items-center space-x-3">
                <img 
                  src={mitLogoUrl} 
                  alt="MIT" 
                  className="h-8 w-auto"
                />
                <div className="flex flex-col">
                  <span className="text-lg font-bold text-gray-800 dark:text-gray-200">MIT Student Housing</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">AI-Powered Campus Management</span>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground ml-1" />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={() => setShowProfileModal(true)} data-testid="menu-edit-profile">
              <User className="h-4 w-4 mr-2" />
              Edit Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild data-testid="menu-sign-out">
              <a href="/api/logout" className="flex items-center">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      {/* Navigation Menu */}
      <nav className="flex-1 p-4 space-y-2">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          
          return (
            <Button
              key={item.name}
              variant="ghost"
              className={`w-full justify-start ${active ? "!bg-blue-50 !text-blue-700 dark:!bg-blue-950 dark:!text-blue-300" : ""}`}
              asChild
              data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <a href={item.href} className="flex items-center space-x-3">
                <Icon className="h-5 w-5" />
                <span>{item.name}</span>
              </a>
            </Button>
          );
        })}
      </nav>
      
      {/* User Menu */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center overflow-hidden">
            {user?.profileImageUrl ? (
              <img 
                src={user.profileImageUrl} 
                alt="Profile" 
                className="w-full h-full object-cover"
                data-testid="img-user-avatar"
              />
            ) : (
              <div className="w-full h-full bg-muted rounded-full flex items-center justify-center">
                <span className="text-xs font-medium text-muted-foreground">
                  {user?.firstName?.charAt(0) || user?.email?.charAt(0) || "U"}
                </span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate" data-testid="text-user-name">
              {user?.firstName && user?.lastName 
                ? `${user.firstName} ${user.lastName}`
                : user?.email || "User"
              }
            </p>
            <p className="text-xs text-muted-foreground truncate" data-testid="text-user-email">
              {user?.email || ""}
            </p>
          </div>
        </div>
      </div>

      {/* Profile Edit Modal */}
      <Dialog open={showProfileModal} onOpenChange={setShowProfileModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>
          {user && (
            <UserProfileForm
              user={user}
              onSuccess={() => setShowProfileModal(false)}
              onCancel={() => setShowProfileModal(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
