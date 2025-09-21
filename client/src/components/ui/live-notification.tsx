import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface NotificationData {
  id: string;
  type: 'case_created' | 'contractor_assigned' | 'case_updated' | 'emergency_alert';
  subject: string;
  message: string;
  caseId?: string;
  caseNumber?: string;
  urgencyLevel?: string;
  timestamp: Date;
  metadata?: any;
}

interface LiveNotificationProps {
  userRole: 'admin' | 'contractor' | 'student';
  userId: string;
}

export function LiveNotification({ userRole, userId }: LiveNotificationProps) {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const { toast } = useToast();

  // WebSocket connection for real-time notifications
  useEffect(() => {
    // Only connect if user is available
    if (!userId) return;
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    try {
      const websocket = new WebSocket(wsUrl);
      
      websocket.onopen = () => {
        console.log('🔗 WebSocket connected for live notifications');
        
        // No need to send auth - server now validates session automatically
        setWs(websocket);
      };
      
      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'notification') {
            const notification: NotificationData = {
              ...data.data,
              id: Date.now().toString(),
              timestamp: new Date()
            };
            
            setNotifications(prev => [notification, ...prev.slice(0, 9)]); // Keep latest 10
            
            // Show toast notification
            toast({
              title: notification.subject,
              description: notification.message.substring(0, 100) + '...',
              duration: 5000
            });
          }
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
        }
      };
      
      websocket.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
      };
      
      websocket.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        setWs(null);
      };
      
      return () => {
        websocket.close();
      };
    } catch (error) {
      console.error('❌ Failed to connect WebSocket:', error);
    }
  }, [userId, userRole, toast]);

  // Handle contractor actions (accept/decline)
  const handleContractorAction = async (notificationId: string, action: 'accept' | 'decline', caseId?: string) => {
    if (!caseId) return;
    
    try {
      const response = await fetch(`/api/cases/${caseId}/contractor-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, contractorId: userId })
      });
      
      if (response.ok) {
        // Remove notification after action
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
        
        toast({
          title: action === 'accept' ? 'Case Accepted' : 'Case Declined',
          description: `You have ${action}ed the maintenance case.`,
          duration: 3000
        });
      }
    } catch (error) {
      console.error('❌ Error responding to case:', error);
      toast({
        title: 'Error',
        description: 'Failed to respond to case. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const getNotificationIcon = (type: string, urgencyLevel?: string) => {
    if (urgencyLevel === 'emergency') return <AlertTriangle className="h-5 w-5 text-red-500" />;
    if (type === 'case_created') return <Bell className="h-5 w-5 text-blue-500" />;
    if (type === 'contractor_assigned') return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    return <Clock className="h-5 w-5 text-orange-500" />;
  };

  const getUrgencyColor = (urgencyLevel?: string) => {
    switch (urgencyLevel?.toLowerCase()) {
      case 'emergency': return 'destructive';
      case 'urgent': return 'destructive';
      case 'medium': return 'default';
      default: return 'secondary';
    }
  };

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      <AnimatePresence>
        {notifications.map((notification) => (
          <motion.div
            key={notification.id}
            initial={{ opacity: 0, x: 300, scale: 0.3 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 300, scale: 0.5 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="w-full shadow-lg border-l-4 border-l-blue-500 dark:bg-gray-800">
              <CardHeader className="pb-2" data-testid={`notification-header-${notification.id}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {getNotificationIcon(notification.type, notification.urgencyLevel)}
                    <CardTitle className="text-sm font-medium">
                      {notification.subject}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    {notification.urgencyLevel && (
                      <Badge variant={getUrgencyColor(notification.urgencyLevel)} className="text-xs">
                        {notification.urgencyLevel}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => dismissNotification(notification.id)}
                      className="h-6 w-6 p-0"
                      data-testid={`button-dismiss-${notification.id}`}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                  {notification.message.length > 150 
                    ? notification.message.substring(0, 150) + '...'
                    : notification.message}
                </p>
                
                {notification.caseNumber && (
                  <Badge variant="outline" className="mb-3 text-xs" data-testid={`text-case-number-${notification.caseNumber}`}>
                    Case: {notification.caseNumber}
                  </Badge>
                )}
                
                {/* Contractor Action Buttons */}
                {userRole === 'contractor' && notification.type === 'contractor_assigned' && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleContractorAction(notification.id, 'accept', notification.caseId)}
                      className="bg-green-600 hover:bg-green-700 text-white"
                      data-testid={`button-accept-${notification.id}`}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleContractorAction(notification.id, 'decline', notification.caseId)}
                      data-testid={`button-decline-${notification.id}`}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Decline
                    </Button>
                  </div>
                )}
                
                {/* Admin Action Buttons */}
                {userRole === 'admin' && notification.type === 'case_created' && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      asChild
                      data-testid={`button-view-case-${notification.id}`}
                    >
                      <a href={`/admin-dashboard?caseId=${notification.caseId}`}>
                        View Case
                      </a>
                    </Button>
                  </div>
                )}
                
                <div className="text-xs text-gray-400 mt-2">
                  {notification.timestamp.toLocaleTimeString()}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>
      
      {/* Connection Status */}
      <div className="text-xs text-center text-gray-500">
        {ws ? (
          <span className="text-green-500">🔗 Live notifications active</span>
        ) : (
          <span className="text-red-500">🔌 Connecting...</span>
        )}
      </div>
    </div>
  );
}