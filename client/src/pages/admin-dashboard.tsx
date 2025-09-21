import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Users, Wrench, DollarSign, AlertTriangle, CheckCircle, Clock, MapPin } from "lucide-react";
import { LiveNotification } from "@/components/ui/live-notification";

interface SmartCase {
  id: string;
  caseNumber: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  category: string;
  buildingName?: string;
  roomNumber?: string;
  createdAt: string;
  updatedAt: string;
  contractorId?: string;
  reportedBy: string;
}

const PRIORITY_COLORS = {
  Low: "text-green-700 border-green-300 bg-green-50",
  Medium: "text-amber-700 border-amber-300 bg-amber-50", 
  High: "text-orange-600 border-orange-300 bg-orange-50",
  Urgent: "text-red-700 border-red-300 bg-red-50"
};

const STATUS_COLORS = {
  New: "text-blue-700 border-blue-300 bg-blue-50",
  "In Review": "text-amber-700 border-amber-300 bg-amber-50",
  Scheduled: "text-purple-700 border-purple-300 bg-purple-50",
  "In Progress": "text-orange-600 border-orange-300 bg-orange-50",
  "On Hold": "text-gray-700 border-gray-300 bg-gray-50",
  Resolved: "text-green-700 border-green-300 bg-green-50",
  Closed: "text-gray-600 border-gray-300 bg-gray-50"
};

export default function AdminDashboard() {
  const [selectedTab, setSelectedTab] = useState("cases");

  // Get current user for live notifications
  const { data: user } = useQuery({
    queryKey: ['/api/auth/user'],
    enabled: true
  });

  // Get all cases for admin overview
  const { data: allCases = [], isLoading: casesLoading } = useQuery<SmartCase[]>({
    queryKey: ['/api/cases'],
    enabled: true
  });

  // Get dashboard stats
  const { data: stats } = useQuery({
    queryKey: ['/api/dashboard/stats'],
    enabled: true
  });

  const unassignedCases = allCases.filter(c => !c.contractorId);
  const urgentCases = allCases.filter(c => ['High', 'Urgent'].includes(c.priority));
  const newCases = allCases.filter(c => c.status === 'New');

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground" data-testid="text-admin-dashboard-title">
              Admin Dashboard
            </h1>
            <p className="text-muted-foreground mt-2">
              Monitor and manage maintenance cases, contractors, and system performance
            </p>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cases</CardTitle>
              <Wrench className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-cases">
                {allCases.length}
              </div>
              <p className="text-xs text-muted-foreground">
                Active maintenance cases
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unassigned</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600" data-testid="text-unassigned-cases">
                {unassignedCases.length}
              </div>
              <p className="text-xs text-muted-foreground">
                Need contractor assignment
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Urgent Cases</CardTitle>
              <Clock className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600" data-testid="text-urgent-cases">
                {urgentCases.length}
              </div>
              <p className="text-xs text-muted-foreground">
                High priority attention needed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">New Cases</CardTitle>
              <CheckCircle className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600" data-testid="text-new-cases">
                {newCases.length}
              </div>
              <p className="text-xs text-muted-foreground">
                Awaiting review
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="cases" data-testid="tab-cases">All Cases</TabsTrigger>
            <TabsTrigger value="unassigned" data-testid="tab-unassigned">Unassigned ({unassignedCases.length})</TabsTrigger>
            <TabsTrigger value="urgent" data-testid="tab-urgent">Urgent ({urgentCases.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="cases" className="mt-6">
            <div className="grid gap-4">
              <h2 className="text-xl font-semibold mb-4">All Maintenance Cases</h2>
              {casesLoading ? (
                <div className="text-center py-8">Loading cases...</div>
              ) : allCases.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No cases found. Cases will appear here when students report issues through Mailla AI.
                </div>
              ) : (
                allCases.map((case_) => (
                  <Card key={case_.id} className="w-full" data-testid={`card-case-${case_.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CardTitle className="text-lg" data-testid={`text-case-title-${case_.id}`}>
                            {case_.title}
                          </CardTitle>
                          <Badge variant="outline" className="text-xs font-mono" data-testid={`text-case-number-${case_.caseNumber}`}>
                            {case_.caseNumber}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant="outline" 
                            className={`${PRIORITY_COLORS[case_.priority as keyof typeof PRIORITY_COLORS]} border`}
                            data-testid={`badge-priority-${case_.id}`}
                          >
                            {case_.priority}
                          </Badge>
                          <Badge 
                            variant="outline" 
                            className={`${STATUS_COLORS[case_.status as keyof typeof STATUS_COLORS]} border`}
                            data-testid={`badge-status-${case_.id}`}
                          >
                            {case_.status}
                          </Badge>
                        </div>
                      </div>
                      <CardDescription className="text-sm text-muted-foreground">
                        {case_.category} • Created {new Date(case_.createdAt).toLocaleDateString()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm mb-3" data-testid={`text-case-description-${case_.id}`}>
                        {case_.description}
                      </p>
                      
                      {(case_.buildingName || case_.roomNumber) && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                          <MapPin className="h-4 w-4" />
                          <span data-testid={`text-case-location-${case_.id}`}>
                            {case_.buildingName} {case_.roomNumber && `Room ${case_.roomNumber}`}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                          Status: {case_.contractorId ? 'Assigned to contractor' : 'Unassigned'}
                        </div>
                        <div className="flex gap-2">
                          {!case_.contractorId && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              data-testid={`button-assign-contractor-${case_.id}`}
                            >
                              Assign Contractor
                            </Button>
                          )}
                          <Button 
                            size="sm"
                            data-testid={`button-view-case-${case_.id}`}
                          >
                            View Details
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="unassigned" className="mt-6">
            <div className="grid gap-4">
              <h2 className="text-xl font-semibold mb-4">Unassigned Cases ({unassignedCases.length})</h2>
              {unassignedCases.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  🎉 All cases have been assigned to contractors!
                </div>
              ) : (
                unassignedCases.map((case_) => (
                  <Card key={case_.id} className="w-full border-l-4 border-l-orange-400">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{case_.title}</CardTitle>
                        <Badge variant="outline" className="text-xs font-mono">
                          {case_.caseNumber}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm mb-3">{case_.description}</p>
                      <div className="flex items-center justify-between">
                        <Badge className={`${PRIORITY_COLORS[case_.priority as keyof typeof PRIORITY_COLORS]} border`}>
                          {case_.priority} Priority
                        </Badge>
                        <Button size="sm">
                          Assign Contractor
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="urgent" className="mt-6">
            <div className="grid gap-4">
              <h2 className="text-xl font-semibold mb-4">Urgent Cases ({urgentCases.length})</h2>
              {urgentCases.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  ✅ No urgent cases at the moment.
                </div>
              ) : (
                urgentCases.map((case_) => (
                  <Card key={case_.id} className="w-full border-l-4 border-l-red-400">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{case_.title}</CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs font-mono">
                            {case_.caseNumber}
                          </Badge>
                          <Badge className="bg-red-100 text-red-800 border-red-300">
                            {case_.priority}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm mb-3">{case_.description}</p>
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                          Created: {new Date(case_.createdAt).toLocaleDateString()}
                        </div>
                        <Button size="sm" className="bg-red-600 hover:bg-red-700">
                          Priority Action Required
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Live Notifications */}
      {user?.id && (
        <LiveNotification 
          userRole="admin" 
          userId={user.id} 
        />
      )}
    </div>
  );
}