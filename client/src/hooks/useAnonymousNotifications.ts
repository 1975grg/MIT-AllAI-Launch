import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

interface NotificationData {
  id: string;
  type: string;
  title: string;
  message: string;
  timestamp: string;
  metadata?: any;
}

interface UseAnonymousNotificationsProps {
  studentEmail?: string;
  orgId?: string;
}

export function useAnonymousNotifications({ studentEmail, orgId }: UseAnonymousNotificationsProps) {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Only connect if we have student email (after form submission)
    if (!studentEmail || !orgId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    try {
      const websocket = new WebSocket(wsUrl);
      
      websocket.onopen = () => {
        console.log('🔗 Anonymous student WebSocket connected');
        setIsConnected(true);
      };
      
      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'notification' && data.data) {
            const notification: NotificationData = {
              id: data.data.id || Date.now().toString(),
              type: data.data.type,
              title: data.data.title || data.data.subject,
              message: data.data.message,
              timestamp: data.data.timestamp,
              metadata: data.data.metadata
            };
            
            setNotifications(prev => [notification, ...prev.slice(0, 4)]); // Keep latest 5
            
            // Show toast notification
            toast({
              title: notification.title,
              description: notification.message.substring(0, 100) + (notification.message.length > 100 ? '...' : ''),
              duration: 8000 // Longer duration for important updates
            });
            
            console.log('📱 Anonymous student notification received:', notification);
          }
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
        }
      };
      
      websocket.onerror = (error) => {
        console.error('❌ Anonymous WebSocket error:', error);
        setIsConnected(false);
      };
      
      websocket.onclose = () => {
        console.log('🔌 Anonymous WebSocket disconnected');
        setIsConnected(false);
      };
      
      return () => {
        websocket.close();
      };
    } catch (error) {
      console.error('❌ Failed to connect anonymous WebSocket:', error);
      setIsConnected(false);
    }
  }, [studentEmail, orgId, toast]);

  return {
    notifications,
    isConnected
  };
}