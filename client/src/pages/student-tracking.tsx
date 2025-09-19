import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Search, Clock, CheckCircle, AlertTriangle, Wrench, Calendar, User, MapPin, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StudentCase {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: "Low" | "Medium" | "High" | "Critical";
  status: string;
  building: string;
  room: string;
  studentName: string;
  studentEmail: string;
  studentPhone?: string;
  createdAt: string;
  updatedAt: string;
  contractorId?: string;
  contractorName?: string;
  estimatedCompletionDate?: string;
  photos?: string[];
}

const trackingSchema = z.object({
  requestId: z.string().min(1, "Please enter a request ID"),
  email: z.string().email("Please enter a valid email address")
});

type TrackingForm = z.infer<typeof trackingSchema>;

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'new':
    case 'pending':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'in review':
    case 'triaged':
      return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    case 'scheduled':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'in progress':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'on hold':
      return 'bg-gray-50 text-gray-700 border-gray-200';
    case 'completed':
    case 'resolved':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'closed':
      return 'bg-gray-100 text-gray-600 border-gray-300';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority.toLowerCase()) {
    case 'low':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'medium':
      return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    case 'high':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'critical':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
};

export default function StudentTracking() {
  const [searchParams, setSearchParams] = useState<{requestId: string; email: string} | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const { toast } = useToast();

  const form = useForm<TrackingForm>({
    resolver: zodResolver(trackingSchema),
    defaultValues: {
      requestId: "",
      email: ""
    }
  });

  // Search for student cases
  const { data: cases, isLoading, error } = useQuery<StudentCase[]>({
    queryKey: ['/api/student/cases', searchParams?.requestId, searchParams?.email],
    enabled: !!searchParams, // Auto-trigger when searchParams are set
    queryFn: async () => {
      if (!searchParams) throw new Error("Search parameters are required");
      
      const queryString = new URLSearchParams({
        requestId: searchParams.requestId,
        email: searchParams.email
      });
      
      const response = await fetch(`/api/student/cases?${queryString}`);
      if (!response.ok) {
        throw new Error("Failed to search requests");
      }
      
      return response.json();
    }
  });

  const onSubmit = async (data: TrackingForm) => {
    setSearchParams({ requestId: data.requestId, email: data.email });
    setHasSearched(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b border-border bg-background">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <Search className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Track Your Request</h1>
                <p className="text-sm text-muted-foreground">Check the status of your maintenance requests</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-6 max-w-4xl">
        {/* Search Form */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Search Your Requests</CardTitle>
            <CardDescription>
              Enter both your request ID and the email address you used when submitting the request
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="requestId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Request ID</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Enter request ID (e.g., MIT-1234567890)"
                            {...field}
                            data-testid="input-request-id"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input 
                            type="email"
                            placeholder="Enter your email address"
                            {...field}
                            data-testid="input-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <Button type="submit" disabled={isLoading} data-testid="button-search-requests" className="w-full">
                  {isLoading ? "Searching..." : "Search"}
                  <Search className="h-4 w-4 ml-2" />
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Search Results */}
        {hasSearched && (
          <>
            {isLoading && (
              <Card>
                <CardContent className="py-8">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <span className="ml-3 text-muted-foreground">Searching for your requests...</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {error && (
              <Card>
                <CardContent className="py-8 text-center">
                  <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Requests Found</h3>
                  <p className="text-muted-foreground">
                    We couldn't find any maintenance requests matching your request ID and email. 
                    Please check both values and try again.
                  </p>
                </CardContent>
              </Card>
            )}

            {cases && cases.length === 0 && !isLoading && !error && (
              <Card>
                <CardContent className="py-8 text-center">
                  <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Requests Found</h3>
                  <p className="text-muted-foreground">
                    We couldn't find any maintenance requests for "{searchTerm}".
                  </p>
                </CardContent>
              </Card>
            )}

            {cases && cases.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">
                    Found {cases.length} request{cases.length !== 1 ? 's' : ''}
                  </h2>
                </div>

                {cases.map((case_) => (
                  <Card key={case_.id} data-testid={`case-card-${case_.id}`}>
                    <CardContent className="p-6">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold">{case_.title}</h3>
                            <Badge className={`px-2 py-1 text-xs ${getPriorityColor(case_.priority)}`}>
                              {case_.priority}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">Request ID: {case_.id}</p>
                        </div>
                        <Badge className={`px-3 py-1 ${getStatusColor(case_.status)}`}>
                          {case_.status}
                        </Badge>
                      </div>

                      {/* Details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                        <div className="space-y-3">
                          <div className="flex items-center space-x-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              <strong>Location:</strong> {case_.building}, Room {case_.room}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Wrench className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              <strong>Category:</strong> {case_.category}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              <strong>Submitted:</strong> {formatDate(case_.createdAt)}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center space-x-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              <strong>Student:</strong> {case_.studentName}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              <strong>Contact:</strong> {case_.studentEmail}
                              {case_.studentPhone && `, ${case_.studentPhone}`}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              <strong>Last Updated:</strong> {formatDate(case_.updatedAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      <Separator className="my-4" />
                      <div className="mb-4">
                        <h4 className="text-sm font-medium mb-2">Description</h4>
                        <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                          {case_.description}
                        </p>
                      </div>

                      {/* Contractor Assignment */}
                      {case_.contractorName && (
                        <div className="mb-4">
                          <div className="flex items-center space-x-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="text-sm">
                              <strong>Assigned to:</strong> {case_.contractorName}
                            </span>
                          </div>
                          {case_.estimatedCompletionDate && (
                            <div className="flex items-center space-x-2 mt-1">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">
                                <strong>Estimated Completion:</strong> {formatDate(case_.estimatedCompletionDate)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Photos */}
                      {case_.photos && case_.photos.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Attached Photos</h4>
                          <div className="flex gap-2">
                            {case_.photos.map((photo, index) => (
                              <div 
                                key={index}
                                className="w-16 h-16 bg-muted border border-border rounded-lg cursor-pointer hover:bg-muted/80 flex items-center justify-center"
                                onClick={() => window.open(photo, '_blank')}
                                data-testid={`case-photo-${index}`}
                              >
                                <span className="text-xs text-muted-foreground">Photo {index + 1}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* Help Section */}
        {!hasSearched && (
          <Card>
            <CardContent className="py-8 text-center">
              <Search className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Track Your Maintenance Requests</h3>
              <p className="text-muted-foreground mb-4">
                Enter your request ID or email address above to see the current status of your maintenance requests.
              </p>
              <div className="text-left max-w-md mx-auto">
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>How to find your request ID:</strong>
                </p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Check the confirmation email sent after submitting your request</li>
                  <li>• Look for the ID on the success page after submission</li>
                  <li>• Request IDs start with "MIT-" followed by numbers</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}