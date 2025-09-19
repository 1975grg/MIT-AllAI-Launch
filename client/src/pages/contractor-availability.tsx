import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Calendar, AlertTriangle, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface ContractorProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  category?: string;
  availabilityPattern: string;
  availableStartTime: string;
  availableEndTime: string;
  availableDays: string[];
  responseTimeHours: number;
  priorityScheduling: string;
  emergencyAvailable: boolean;
  emergencyPhone?: string;
  maxJobsPerDay: number;
  isActiveContractor: boolean;
  specializations?: string[];
  estimatedHourlyRate?: number;
}

const DAYS_OF_WEEK = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' }
];

export default function ContractorAvailability() {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);

  // Get contractor profile/availability
  const { data: contractorProfile, isLoading } = useQuery<ContractorProfile>({
    queryKey: ['/api/contractor/profile'],
    enabled: true
  });

  // Update availability mutation
  const updateAvailability = useMutation({
    mutationFn: async (data: Partial<ContractorProfile>) => {
      return await apiRequest("PUT", "/api/contractor/availability", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contractor/profile'] });
      setIsEditing(false);
      toast({
        title: "Availability Updated",
        description: "Your availability settings have been updated successfully."
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update availability. Please try again.",
        variant: "destructive"
      });
    }
  });

  const [formData, setFormData] = useState<Partial<ContractorProfile>>({});

  const handleEdit = () => {
    if (contractorProfile) {
      setFormData(contractorProfile);
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    updateAvailability.mutate(formData);
  };

  const handleCancel = () => {
    setFormData({});
    setIsEditing(false);
  };

  const toggleDay = (day: string) => {
    const currentDays = formData.availableDays || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day];
    
    setFormData({ ...formData, availableDays: newDays });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading availability settings...</p>
        </div>
      </div>
    );
  }

  if (!contractorProfile) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="text-center py-8">
            <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Contractor Profile</h3>
            <p className="text-muted-foreground">You don't have a contractor profile set up.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b border-border bg-background">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Clock className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Availability Settings</h1>
                <p className="text-sm text-muted-foreground">Manage your working hours and availability</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant={contractorProfile.isActiveContractor ? "default" : "secondary"}>
                {contractorProfile.isActiveContractor ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-6 max-w-4xl">
        {/* Profile Overview */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Contractor Profile
            </CardTitle>
            <CardDescription>
              Your basic contractor information and contact details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Name</Label>
                <p className="text-sm text-muted-foreground mt-1">{contractorProfile.name}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Email</Label>
                <p className="text-sm text-muted-foreground mt-1">{contractorProfile.email}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Category</Label>
                <p className="text-sm text-muted-foreground mt-1">{contractorProfile.category || 'General'}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Phone</Label>
                <p className="text-sm text-muted-foreground mt-1">{contractorProfile.phone || 'Not provided'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Availability Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Availability Schedule
                </CardTitle>
                <CardDescription>
                  Set your working hours and availability preferences
                </CardDescription>
              </div>
              {!isEditing && (
                <Button onClick={handleEdit} data-testid="button-edit-availability">
                  Edit Availability
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!isEditing ? (
              // View Mode
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label className="text-sm font-medium">Working Hours</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {contractorProfile.availableStartTime} - {contractorProfile.availableEndTime}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Response Time</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {contractorProfile.responseTimeHours} hours
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Max Jobs Per Day</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {contractorProfile.maxJobsPerDay} jobs
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Priority Scheduling</Label>
                    <Badge variant="outline" className="ml-2 capitalize">
                      {contractorProfile.priorityScheduling}
                    </Badge>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">Available Days</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {contractorProfile.availableDays?.map((day) => (
                      <Badge key={day} variant="secondary" className="capitalize">
                        {day}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Label className="text-sm font-medium">Emergency Available:</Label>
                    <Badge variant={contractorProfile.emergencyAvailable ? "default" : "secondary"}>
                      {contractorProfile.emergencyAvailable ? "Yes" : "No"}
                    </Badge>
                  </div>
                  {contractorProfile.emergencyAvailable && contractorProfile.emergencyPhone && (
                    <div className="flex items-center space-x-2">
                      <Label className="text-sm font-medium">Emergency Phone:</Label>
                      <span className="text-sm text-muted-foreground">{contractorProfile.emergencyPhone}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // Edit Mode
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startTime">Start Time</Label>
                    <Input
                      id="startTime"
                      type="time"
                      value={formData.availableStartTime || "09:00"}
                      onChange={(e) => setFormData({ ...formData, availableStartTime: e.target.value })}
                      data-testid="input-start-time"
                    />
                  </div>
                  <div>
                    <Label htmlFor="endTime">End Time</Label>
                    <Input
                      id="endTime"
                      type="time"
                      value={formData.availableEndTime || "17:00"}
                      onChange={(e) => setFormData({ ...formData, availableEndTime: e.target.value })}
                      data-testid="input-end-time"
                    />
                  </div>
                  <div>
                    <Label htmlFor="responseTime">Response Time (hours)</Label>
                    <Input
                      id="responseTime"
                      type="number"
                      min="1"
                      max="72"
                      value={formData.responseTimeHours || 24}
                      onChange={(e) => setFormData({ ...formData, responseTimeHours: parseInt(e.target.value) })}
                      data-testid="input-response-time"
                    />
                  </div>
                  <div>
                    <Label htmlFor="maxJobs">Max Jobs Per Day</Label>
                    <Input
                      id="maxJobs"
                      type="number"
                      min="1"
                      max="20"
                      value={formData.maxJobsPerDay || 3}
                      onChange={(e) => setFormData({ ...formData, maxJobsPerDay: parseInt(e.target.value) })}
                      data-testid="input-max-jobs"
                    />
                  </div>
                </div>

                <div>
                  <Label>Available Days</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                    {DAYS_OF_WEEK.map((day) => (
                      <div
                        key={day.value}
                        className={`flex items-center space-x-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                          formData.availableDays?.includes(day.value)
                            ? 'bg-primary/10 border-primary'
                            : 'border-border hover:bg-muted/50'
                        }`}
                        onClick={() => toggleDay(day.value)}
                        data-testid={`day-${day.value}`}
                      >
                        <div className={`w-3 h-3 rounded-full ${
                          formData.availableDays?.includes(day.value) ? 'bg-primary' : 'bg-muted'
                        }`}></div>
                        <span className="text-sm">{day.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="priorityScheduling">Priority Scheduling</Label>
                  <Select
                    value={formData.priorityScheduling || "standard"}
                    onValueChange={(value) => setFormData({ ...formData, priorityScheduling: value })}
                  >
                    <SelectTrigger data-testid="select-priority-scheduling">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="priority">Priority</SelectItem>
                      <SelectItem value="emergency">Emergency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="emergencyAvailable">Emergency Available</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Available for emergency calls outside normal hours
                      </p>
                    </div>
                    <Switch
                      id="emergencyAvailable"
                      checked={formData.emergencyAvailable || false}
                      onCheckedChange={(checked) => setFormData({ ...formData, emergencyAvailable: checked })}
                      data-testid="switch-emergency-available"
                    />
                  </div>

                  {formData.emergencyAvailable && (
                    <div>
                      <Label htmlFor="emergencyPhone">Emergency Phone</Label>
                      <Input
                        id="emergencyPhone"
                        type="tel"
                        placeholder="Emergency contact number"
                        value={formData.emergencyPhone || ""}
                        onChange={(e) => setFormData({ ...formData, emergencyPhone: e.target.value })}
                        data-testid="input-emergency-phone"
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-end space-x-3">
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    disabled={updateAvailability.isPending}
                    data-testid="button-cancel-availability"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={updateAvailability.isPending}
                    data-testid="button-save-availability"
                  >
                    {updateAvailability.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}