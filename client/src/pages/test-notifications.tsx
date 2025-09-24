import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Mail, MessageSquare, AlertCircle, CheckCircle, Clock } from "lucide-react";

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
}

export default function TestNotifications() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("This is a test notification to verify the system is working correctly.");
  const [isLoading, setIsLoading] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const { toast } = useToast();

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
          Test email and SMS notifications to verify the Brevo integration is working properly.
        </p>
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

            <div className="flex gap-3 pt-4">
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