import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, CheckCircle, ArrowLeft, Camera, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ObjectUploader } from "@/components/ObjectUploader";

const MAINTENANCE_CATEGORIES = [
  "HVAC / Heating & Cooling",
  "Plumbing (Water, Drains, Sewer)",
  "Electrical & Lighting", 
  "Appliances (Kitchen, Laundry, etc.)",
  "Safety & Security (locks, alarms, smoke detectors, windows/doors)",
  "General Interior (walls, ceilings, flooring, paint, cabinets)",
  "Network/Internet Connectivity",
  "Common Areas (lounges, study rooms, bathrooms)",
  "Other / Miscellaneous"
];

const PRIORITY_LEVELS = [
  { value: "Low", label: "Not urgent", description: "Can wait a few days", color: "bg-green-50 border-green-200", indicator: "bg-green-500" },
  { value: "Medium", label: "Needs attention", description: "Should be fixed soon", color: "bg-yellow-50 border-yellow-200", indicator: "bg-yellow-500" },
  { value: "High", label: "Important", description: "Affecting daily life", color: "bg-orange-50 border-orange-200", indicator: "bg-orange-500" },
  { value: "Critical", label: "Emergency", description: "Safety concern/urgent", color: "bg-red-50 border-red-200", indicator: "bg-red-500" }
];

const studentRequestSchema = z.object({
  title: z.string().min(5, "Please describe the issue briefly"),
  description: z.string().min(10, "Please provide more details about the problem"),
  category: z.string().min(1, "Please select a category"),
  priority: z.string().min(1, "Please select urgency level"),
  building: z.string().min(1, "Please select your building"),
  room: z.string().min(1, "Please enter your room number"),
  studentEmail: z.string().email("Please enter a valid email address"),
  studentPhone: z.string().optional(),
  studentName: z.string().min(2, "Please enter your name"),
  photos: z.array(z.string()).max(5, "Maximum 5 photos allowed").optional().default([])
});

type StudentRequestForm = z.infer<typeof studentRequestSchema>;

export default function StudentRequest() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [requestId, setRequestId] = useState<string>("");
  const [selectedPriority, setSelectedPriority] = useState<string>("");
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [showTrackingDialog, setShowTrackingDialog] = useState(false);
  const { toast } = useToast();
  
  const form = useForm<StudentRequestForm>({
    resolver: zodResolver(studentRequestSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "",
      priority: "",
      building: "",
      room: "",
      studentEmail: "",
      studentPhone: "",
      studentName: "",
      photos: []
    }
  });

  const onSubmit = async (data: StudentRequestForm) => {
    setIsSubmitting(true);
    try {
      const submissionData = {
        ...data,
        photos: uploadedPhotos
      };
      
      const response = await fetch("/api/cases/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submissionData)
      });

      if (!response.ok) {
        throw new Error("Failed to submit request");
      }

      const result = await response.json();
      setRequestId(result.id || "MIT-" + Date.now());
      setIsSubmitted(true);
      toast({
        title: "Request Submitted Successfully!",
        description: "You'll receive email updates on your maintenance request."
      });
    } catch (error) {
      toast({
        title: "Submission Failed",
        description: "Please try again or contact housing administration directly.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Photo upload handlers
  const getUploadParameters = async () => {
    try {
      const response = await fetch("/api/upload/presigned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileType: "image" })
      });
      const data = await response.json();
      return { method: "PUT" as const, url: data.uploadUrl };
    } catch (error) {
      console.error("Failed to get upload parameters:", error);
      throw error;
    }
  };

  const handlePhotoUploadComplete = (result: any) => {
    if (result.successful && result.successful.length > 0) {
      const uploadedUrl = result.successful[0].uploadURL;
      const photoUrl = uploadedUrl.split('?')[0]; // Remove query parameters
      setUploadedPhotos(prev => [...prev, photoUrl]);
      toast({
        title: "Photo Uploaded",
        description: "Your photo has been attached to the request."
      });
    }
  };

  const removePhoto = (photoUrl: string) => {
    setUploadedPhotos(prev => prev.filter(url => url !== photoUrl));
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-4">Request Submitted Successfully!</h1>
            <p className="text-lg text-muted-foreground mb-4">
              Your maintenance request has been received and assigned ID: <strong>{requestId}</strong>
            </p>
            <p className="text-muted-foreground mb-6">
              You'll receive email updates as your request is processed. Our AI system will automatically 
              assess the urgency and route it to the appropriate maintenance team.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                onClick={() => {
                  setIsSubmitted(false);
                  form.reset();
                  setSelectedPriority("");
                }}
                variant="outline"
                data-testid="button-submit-another"
              >
                Submit Another Request
              </Button>
              <Button asChild data-testid="button-back-home">
                <a href="/">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Home
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b border-border bg-background">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">MIT Housing Maintenance</span>
          </div>
          <Button variant="outline" asChild data-testid="button-back-to-home">
            <a href="/">Back to Home</a>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-6 max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Submit a Maintenance Request</h1>
          <p className="text-lg text-muted-foreground">
            Having trouble with something in your room or building? Let us know and we'll take care of it!
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>New Maintenance Request</CardTitle>
            <CardDescription>
              Please provide as much detail as possible to help us resolve your issue quickly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Contact Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="studentName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your full name" {...field} data-testid="input-student-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="studentEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="your.email@mit.edu" {...field} data-testid="input-student-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="studentPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number (Optional)</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="(617) 555-0123" {...field} data-testid="input-student-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Location Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="building"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Building</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger data-testid="select-student-building">
                              <SelectValue placeholder="Select your building..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Next House">Next House</SelectItem>
                            <SelectItem value="Simmons Hall">Simmons Hall</SelectItem>
                            <SelectItem value="MacGregor House">MacGregor House</SelectItem>
                            <SelectItem value="Burton Conner">Burton Conner</SelectItem>
                            <SelectItem value="New House">New House</SelectItem>
                            <SelectItem value="Baker House">Baker House</SelectItem>
                            <SelectItem value="McCormick Hall">McCormick Hall</SelectItem>
                            <SelectItem value="Random Hall">Random Hall</SelectItem>
                            <SelectItem value="Senior House">Senior House</SelectItem>
                            <SelectItem value="Tang Hall">Tang Hall</SelectItem>
                            <SelectItem value="Westgate">Westgate</SelectItem>
                            <SelectItem value="Ashdown House">Ashdown House</SelectItem>
                            <SelectItem value="Sidney-Pacific">Sidney-Pacific</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="room"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Room Number</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 204A, or 'Common Area'" {...field} data-testid="input-student-room" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Issue Information */}
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>What type of problem is this?</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger data-testid="select-student-category">
                            <SelectValue placeholder="Choose an issue type..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {MAINTENANCE_CATEGORIES.map((category) => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brief Description</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., 'Heater not working in room'" 
                          {...field} 
                          data-testid="input-student-title" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Detailed Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Please describe what's wrong and any details that might help us fix it..."
                          className="min-h-[100px]"
                          {...field} 
                          data-testid="textarea-student-description" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Photo Upload Section */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Camera className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-medium">Add Photos (Optional)</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Photos help us understand the issue better and can speed up the repair process.
                  </p>
                  
                  <div className="flex flex-wrap gap-4">
                    <ObjectUploader
                      maxNumberOfFiles={5}
                      maxFileSize={10485760} // 10MB
                      onGetUploadParameters={getUploadParameters}
                      onComplete={handlePhotoUploadComplete}
                      buttonClassName="flex-shrink-0"
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Add Photos
                    </ObjectUploader>
                    
                    {uploadedPhotos.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {uploadedPhotos.map((photoUrl, index) => (
                          <div key={index} className="relative group">
                            <div 
                              className="w-20 h-20 bg-muted border border-border rounded-lg flex items-center justify-center cursor-pointer hover:bg-muted/80"
                              onClick={() => window.open(photoUrl, '_blank')}
                              data-testid={`photo-preview-${index}`}
                            >
                              <Eye className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="absolute -top-2 -right-2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => removePhoto(photoUrl)}
                              data-testid={`remove-photo-${index}`}
                            >
                              ×
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {uploadedPhotos.length > 0 && (
                    <Badge variant="secondary" className="w-fit">
                      {uploadedPhotos.length} photo{uploadedPhotos.length !== 1 ? 's' : ''} attached
                    </Badge>
                  )}
                </div>

                {/* Priority Selection */}
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>How urgent is this?</FormLabel>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {PRIORITY_LEVELS.map((priority) => (
                          <div
                            key={priority.value}
                            className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                              selectedPriority === priority.value 
                                ? `${priority.color} border-2` 
                                : 'border-border hover:bg-muted/50'
                            }`}
                            onClick={() => {
                              setSelectedPriority(priority.value);
                              field.onChange(priority.value);
                            }}
                            data-testid={`priority-${priority.value.toLowerCase()}`}
                          >
                            <div className="flex items-center space-x-3">
                              <div className={`w-3 h-3 ${priority.indicator} rounded-full`}></div>
                              <div>
                                <div className="font-medium">{priority.label}</div>
                                <div className="text-sm text-muted-foreground">{priority.description}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Submit Button */}
                <div className="text-center pt-4">
                  <Button 
                    type="submit" 
                    size="lg" 
                    disabled={isSubmitting}
                    className="px-8"
                    data-testid="button-submit-request"
                  >
                    {isSubmitting ? "Submitting..." : "Submit Maintenance Request"}
                  </Button>
                  <p className="text-sm text-muted-foreground mt-3">
                    You'll receive an email confirmation and updates on your request
                  </p>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}