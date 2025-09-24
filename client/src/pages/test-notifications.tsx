import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Mail, MessageSquare, AlertCircle, CheckCircle, Clock, Wifi, WifiOff } from "lucide-react";

interface TestResult {
  timestamp: string;
  testType: string;
  user: string;
  email?: {
    success: boolean;
    recipient: string;
  };
  sms?: {
    success: boolean;
    recipient?: string;
    error?: string;
  };
  websocket?: {
    success: boolean;
    connected: boolean;
    error?: string;
  };
}

export default function TestNotifications() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("This is a test notification to verify the system is working correctly.");
  const [isLoading, setIsLoading] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const { toast } = useToast();

  // WebSocket connection for testing real-time notifications
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    try {
      const websocket = new WebSocket(wsUrl);
      
      websocket.onopen = () => {
        console.log('🔗 Test WebSocket connected');
        setWsConnected(true);
        setWs(websocket);
      };
      
      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📱 WebSocket message received:', data);
          
          if (data.type === 'notification') {
            toast({
              title: "🚀 Real-time notification received!",
              description: data.data?.message || "WebSocket notification test successful",
              duration: 5000
            });
          }
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
        }
      };
      
      websocket.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setWsConnected(false);
      };
      
      websocket.onclose = () => {
        console.log('🔌 Test WebSocket disconnected');
        setWsConnected(false);
        setWs(null);
      };
      
      return () => {
        websocket.close();
      };
    } catch (error) {
      console.error('❌ Failed to connect test WebSocket:', error);
      setWsConnected(false);
    }
  }, [toast]);

  const sendWebSocketTest = async () => {
    try {
      setIsLoading(true);
      
      const testResult: TestResult = {
        timestamp: new Date().toISOString(),
        testType: 'websocket',
        user: 'anonymous-tester',
        websocket: {
          success: wsConnected,
          connected: wsConnected,
          error: wsConnected ? undefined : 'WebSocket not connected'
        }
      };
      
      if (wsConnected && ws) {
        // Send a test message through WebSocket
        const testMessage = {
          type: 'test',
          message: 'WebSocket real-time notification test'
        };
        ws.send(JSON.stringify(testMessage));
        
        toast({
          title: "WebSocket test sent!",
          description: "Test message sent through WebSocket connection",
          variant: "default"
        });
      } else {
        toast({
          title: "WebSocket not connected",
          description: "Cannot test WebSocket - connection not established",
          variant: "destructive"
        });
      }
      
      setTestResults(prev => [testResult, ...prev]);
      
    } catch (error) {
      console.error('WebSocket test failed:', error);
      toast({
        title: "WebSocket test failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sendTestNotification = async (testType: 'email' | 'sms' | 'both') => {
    try {
      setIsLoading(true);
      
      const response = await apiRequest('POST', '/api/test/notifications', {
        email: email || undefined,
        phone: phone || undefined,
        message,
        testType
      });

      const data = await response.json();

      if (data.success) {
        setTestResults(prev => [data.results, ...prev]);
        toast({
          title: "Test notification sent!",
          description: `${testType} notification test completed`,
          variant: "default"
        });
      } else {
        throw new Error(data.error || 'Test failed');
      }
    } catch (error) {
      console.error('Test notification failed:', error);
      toast({
        title: "Test failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">🧪 Notification System Test</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Test email, SMS, and WebSocket notifications to verify all notification systems are working properly.
        </p>
        
        {/* WebSocket Connection Status */}
        <div className="flex items-center gap-2 mt-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
          {wsConnected ? (
            <>
              <Wifi className="h-5 w-5 text-green-500" />
              <span className="text-green-600 dark:text-green-400 font-medium">Real-time notifications active</span>
            </>
          ) : (
            <>
              <WifiOff className="h-5 w-5 text-red-500" />
              <span className="text-red-600 dark:text-red-400 font-medium">Connecting to real-time notifications...</span>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6">
        {/* Test Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Test Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Email Address (optional - defaults to your account email)
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="test@example.com"
                data-testid="input-test-email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Phone Number (required for SMS test)
              </label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1234567890"
                data-testid="input-test-phone"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Test Message
              </label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Enter a custom test message..."
                data-testid="input-test-message"
              />
            </div>

            <div className="flex gap-3 pt-4 flex-wrap">
              <Button
                onClick={() => sendTestNotification('email')}
                disabled={isLoading}
                className="flex items-center gap-2"
                data-testid="button-test-email"
              >
                <Mail className="h-4 w-4" />
                {isLoading ? 'Testing...' : 'Test Email'}
              </Button>

              <Button
                onClick={() => sendTestNotification('sms')}
                disabled={isLoading || !phone}
                variant="outline"
                className="flex items-center gap-2"
                data-testid="button-test-sms"
              >
                <MessageSquare className="h-4 w-4" />
                {isLoading ? 'Testing...' : 'Test SMS'}
              </Button>

              <Button
                onClick={() => sendTestNotification('both')}
                disabled={isLoading || !phone}
                variant="secondary"
                className="flex items-center gap-2"
                data-testid="button-test-both"
              >
                <Clock className="h-4 w-4" />
                {isLoading ? 'Testing...' : 'Test Both'}
              </Button>

              <Button
                onClick={sendWebSocketTest}
                disabled={isLoading}
                variant={wsConnected ? "default" : "destructive"}
                className="flex items-center gap-2"
                data-testid="button-test-websocket"
              >
                {wsConnected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                {isLoading ? 'Testing...' : 'Test WebSocket'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Test Results */}
        {testResults.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Test Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {testResults.map((result, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                    data-testid={`test-result-${index}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="outline" className="capitalize">
                        {result.testType} Test
                      </Badge>
                      <span className="text-sm text-gray-500">
                        {new Date(result.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {result.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          <span className="text-sm">Email to {result.email.recipient}:</span>
                          {result.email.success ? (
                            <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              ✅ Sent
                            </Badge>
                          ) : (
                            <Badge variant="destructive">❌ Failed</Badge>
                          )}
                        </div>
                      )}

                      {result.sms && (
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" />
                          <span className="text-sm">
                            SMS {result.sms.recipient ? `to ${result.sms.recipient}` : ''}:
                          </span>
                          {result.sms.success ? (
                            <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              ✅ Sent
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              ❌ Failed: {result.sms.error || 'Unknown error'}
                            </Badge>
                          )}
                        </div>
                      )}

                      {result.websocket && (
                        <div className="flex items-center gap-2">
                          {result.websocket.connected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                          <span className="text-sm">WebSocket real-time:</span>
                          {result.websocket.success ? (
                            <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              ✅ Connected & Tested
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              ❌ {result.websocket.error || 'Connection failed'}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Debug Information */}
        <Card>
          <CardHeader>
            <CardTitle>🔧 Debug Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm space-y-2">
              <p><strong>Purpose:</strong> This page tests the notification system independently from the maintenance triage flow.</p>
              <p><strong>Integration Issue:</strong> If these tests work but maintenance notifications don't arrive, the issue is in the case completion flow.</p>
              <p><strong>Brevo API:</strong> Uses the same Brevo API configuration as the main application.</p>
              <p><strong>Expected:</strong> Email should arrive within 1-2 minutes, SMS within seconds.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}