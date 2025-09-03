import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Building, Users, Receipt, DollarSign, Bell, Wrench } from "lucide-react";
import { useLocation } from "wouter";

interface QuickAddModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReminderClick?: () => void;
}

export default function QuickAddModal({ open, onOpenChange, onReminderClick }: QuickAddModalProps) {
  const [, setLocation] = useLocation();
  const quickActions = [
    {
      title: "Property",
      icon: Building,
      color: "text-primary",
      bgColor: "bg-primary/10",
      href: "/properties",
      action: "addProperty",
    },
    {
      title: "Tenant",
      icon: Users,
      color: "text-green-600",
      bgColor: "bg-green-100",
      href: "/tenants",
      action: "addTenant",
    },
    {
      title: "Maintenance",
      icon: Wrench,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
      href: "/maintenance",
      action: "createCase",
    },
    {
      title: "Expense",
      icon: Receipt,
      color: "text-yellow-600",
      bgColor: "bg-yellow-100",
      href: "/expenses",
      action: "logExpense",
    },
    {
      title: "Revenue",
      icon: DollarSign,
      color: "text-green-600",
      bgColor: "bg-green-100",
      href: "/revenue",
      action: "logRevenue",
    },
    {
      title: "Reminder",
      icon: Bell,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
      href: "/reminders",
      action: "createReminder",
    },
  ];

  const handleActionClick = (href: string, action: string) => {
    if (action === "createReminder" && onReminderClick) {
      onReminderClick();
    } else {
      onOpenChange(false);
      setLocation(href);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="modal-quick-add">
        <DialogHeader>
          <DialogTitle>Quick Add</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.title}
                variant="ghost"
                className="h-20 flex flex-col items-center justify-center space-y-2 border border-border hover:bg-muted/50"
                onClick={() => handleActionClick(action.href, action.action)}
                data-testid={`button-quick-${action.action}`}
              >
                <div className={`w-8 h-8 ${action.bgColor} rounded-lg flex items-center justify-center`}>
                  <Icon className={`h-5 w-5 ${action.color}`} />
                </div>
                <span className="text-sm font-medium">{action.title}</span>
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
