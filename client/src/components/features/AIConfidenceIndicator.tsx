import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Brain, CheckCircle, AlertTriangle, XCircle, Edit, Eye, Lightbulb } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";

interface AITriageData {
  category: string;
  subcategory: string;
  urgency: "Low" | "Medium" | "High" | "Critical";
  estimatedComplexity: "Simple" | "Moderate" | "Complex";
  requiredExpertise: string[];
  estimatedDuration: string;
  preliminaryDiagnosis: string;
  troubleshootingSteps: string[];
  contractorType: string;
  specialEquipment: string[];
  safetyRisk: "None" | "Low" | "Medium" | "High";
  reasoning: string;
  analysisCompletedAt: string;
  version: string;
}

interface DuplicateAnalysisData {
  isUnique: boolean;
  duplicateOfId?: string;
  similarCases: Array<{
    caseId: string;
    title: string;
    similarityScore: number;
    matchReason: string;
    isDuplicate: boolean;
  }>;
  analysisReason: string;
  confidenceScore: number;
  analysisCompletedAt: string;
}

interface SmartCaseAIData {
  aiAnalysis: AITriageData;
  duplicateAnalysis: DuplicateAnalysisData;
  routing: {
    assignedContractor: string | null;
    routingNotes: string;
    escalationFlag: boolean;
    autoRouted: boolean;
    routingCompletedAt: string;
  };
}

interface AIConfidenceIndicatorProps {
  caseId: string;
  aiData: SmartCaseAIData;
  onOverride?: (caseId: string, overrideData: any) => void;
  showOverrideButton?: boolean;
}

const overrideSchema = z.object({
  category: z.string().min(1, "Category is required"),
  priority: z.enum(["Low", "Medium", "High", "Critical"]),
  contractorType: z.string().min(1, "Contractor type is required"),
  reasoning: z.string().min(10, "Please provide detailed reasoning for the override")
});

type OverrideFormData = z.infer<typeof overrideSchema>;

export function AIConfidenceIndicator({
  caseId,
  aiData,
  onOverride,
  showOverrideButton = true
}: AIConfidenceIndicatorProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<OverrideFormData>({
    resolver: zodResolver(overrideSchema),
    defaultValues: {
      category: aiData.aiAnalysis.category,
      priority: aiData.aiAnalysis.urgency as "Low" | "Medium" | "High" | "Critical",
      contractorType: aiData.aiAnalysis.contractorType,
      reasoning: ""
    }
  });

  const overrideMutation = useMutation({
    mutationFn: async (data: OverrideFormData) => {
      return apiRequest(`/api/cases/${caseId}/ai-override`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      toast({
        title: "AI Override Applied",
        description: "The AI triage decision has been successfully overridden."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/cases'] });
      setShowOverrideDialog(false);
      form.reset();
      onOverride?.(caseId, form.getValues());
    },
    onError: (error: any) => {
      toast({
        title: "Override Failed",
        description: error.message || "Failed to apply AI override. Please try again.",
        variant: "destructive"
      });
    }
  });

  const getConfidenceColor = (score: number) => {
    if (score >= 0.9) return "text-green-600 dark:text-green-400";
    if (score >= 0.7) return "text-yellow-600 dark:text-yellow-400";
    return "text-orange-600 dark:text-orange-400";
  };

  const getConfidenceIcon = (score: number) => {
    if (score >= 0.9) return CheckCircle;
    if (score >= 0.7) return AlertTriangle;
    return XCircle;
  };

  const triageConfidence = calculateTriageConfidence(aiData.aiAnalysis);
  const duplicateConfidence = aiData.duplicateAnalysis.confidenceScore;
  const overallConfidence = (triageConfidence + duplicateConfidence) / 2;

  const ConfidenceIcon = getConfidenceIcon(overallConfidence);

  return (
    <TooltipProvider>
      <Card className="border-l-4 border-l-blue-500 dark:border-l-blue-400">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-blue-600 dark:text-blue-400" data-testid="icon-ai-brain" />
              <CardTitle className="text-sm font-medium">AI Analysis</CardTitle>
              <div className="flex items-center gap-1">
                <ConfidenceIcon className={`h-4 w-4 ${getConfidenceColor(overallConfidence)}`} data-testid="icon-confidence" />
                <span className={`text-sm font-medium ${getConfidenceColor(overallConfidence)}`} data-testid="text-confidence-score">
                  {(overallConfidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDetails(!showDetails)}
                    data-testid="button-show-details"
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{showDetails ? "Hide" : "Show"} AI Analysis Details</p>
                </TooltipContent>
              </Tooltip>
              {showOverrideButton && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowOverrideDialog(true)}
                      data-testid="button-override-ai"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Override AI Decision</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
          <CardDescription>
            <div className="flex items-center gap-4 text-xs">
              <span data-testid="text-category">Category: <strong>{aiData.aiAnalysis.category}</strong></span>
              <span data-testid="text-urgency">Urgency: <Badge variant={getUrgencyVariant(aiData.aiAnalysis.urgency)}>{aiData.aiAnalysis.urgency}</Badge></span>
              {!aiData.duplicateAnalysis.isUnique && (
                <Badge variant="destructive" data-testid="badge-duplicate">Duplicate Detected</Badge>
              )}
            </div>
          </CardDescription>
        </CardHeader>

        {showDetails && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {/* Triage Analysis */}
              <div className="space-y-2">
                <h4 className="font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <Brain className="h-3 w-3" />
                  Triage Analysis
                </h4>
                <div className="space-y-1 text-xs">
                  <p><strong>Diagnosis:</strong> <span data-testid="text-diagnosis">{aiData.aiAnalysis.preliminaryDiagnosis}</span></p>
                  <p><strong>Complexity:</strong> <span data-testid="text-complexity">{aiData.aiAnalysis.estimatedComplexity}</span></p>
                  <p><strong>Duration:</strong> <span data-testid="text-duration">{aiData.aiAnalysis.estimatedDuration}</span></p>
                  <p><strong>Safety Risk:</strong> <span data-testid="text-safety-risk">{aiData.aiAnalysis.safetyRisk}</span></p>
                  <p><strong>Contractor:</strong> <span data-testid="text-contractor">{aiData.aiAnalysis.contractorType}</span></p>
                </div>
                
                {aiData.aiAnalysis.troubleshootingSteps.length > 0 && (
                  <div>
                    <p className="font-medium flex items-center gap-1">
                      <Lightbulb className="h-3 w-3" />
                      Troubleshooting Steps:
                    </p>
                    <ul className="list-disc list-inside text-xs space-y-1 ml-4" data-testid="list-troubleshooting">
                      {aiData.aiAnalysis.troubleshootingSteps.map((step, index) => (
                        <li key={index}>{step}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Duplicate Detection */}
              <div className="space-y-2">
                <h4 className="font-medium text-purple-600 dark:text-purple-400 flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  Duplicate Analysis
                </h4>
                <div className="space-y-1 text-xs">
                  <p><strong>Status:</strong> <span data-testid="text-duplicate-status">{aiData.duplicateAnalysis.isUnique ? "Unique" : "Duplicate"}</span></p>
                  <p><strong>Confidence:</strong> <span data-testid="text-duplicate-confidence">{(aiData.duplicateAnalysis.confidenceScore * 100).toFixed(1)}%</span></p>
                  <p><strong>Reason:</strong> <span data-testid="text-duplicate-reason">{aiData.duplicateAnalysis.analysisReason}</span></p>
                  
                  {aiData.duplicateAnalysis.similarCases.length > 0 && (
                    <div>
                      <p className="font-medium">Similar Cases:</p>
                      <div className="space-y-1" data-testid="list-similar-cases">
                        {aiData.duplicateAnalysis.similarCases.slice(0, 3).map((similarCase, index) => (
                          <div key={index} className="bg-gray-50 dark:bg-gray-800 p-2 rounded text-xs">
                            <p><strong>{similarCase.title}</strong></p>
                            <p>Similarity: {(similarCase.similarityScore * 100).toFixed(1)}%</p>
                            <p>{similarCase.matchReason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* AI Reasoning */}
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
              <p className="text-xs"><strong>AI Reasoning:</strong></p>
              <p className="text-xs mt-1" data-testid="text-ai-reasoning">{aiData.aiAnalysis.reasoning}</p>
            </div>
          </CardContent>
        )}

        {/* Override Dialog */}
        <Dialog open={showOverrideDialog} onOpenChange={setShowOverrideDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Override AI Decision</DialogTitle>
              <DialogDescription>
                Manually adjust the AI's triage decision. This will be logged for audit purposes.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => overrideMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} defaultValue={field.value} data-testid="select-category">
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Plumbing">Plumbing</SelectItem>
                            <SelectItem value="Electrical">Electrical</SelectItem>
                            <SelectItem value="HVAC">HVAC</SelectItem>
                            <SelectItem value="Appliances">Appliances</SelectItem>
                            <SelectItem value="Structural">Structural</SelectItem>
                            <SelectItem value="General Maintenance">General Maintenance</SelectItem>
                            <SelectItem value="Security">Security</SelectItem>
                            <SelectItem value="Technology">Technology</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} defaultValue={field.value} data-testid="select-priority">
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Low">Low</SelectItem>
                            <SelectItem value="Medium">Medium</SelectItem>
                            <SelectItem value="High">High</SelectItem>
                            <SelectItem value="Critical">Critical</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contractorType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contractor Type</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} defaultValue={field.value} data-testid="select-contractor">
                          <SelectTrigger>
                            <SelectValue placeholder="Select contractor type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Plumber">Plumber</SelectItem>
                            <SelectItem value="Electrician">Electrician</SelectItem>
                            <SelectItem value="HVAC Technician">HVAC Technician</SelectItem>
                            <SelectItem value="General Maintenance">General Maintenance</SelectItem>
                            <SelectItem value="Appliance Repair">Appliance Repair</SelectItem>
                            <SelectItem value="Structural Engineer">Structural Engineer</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reasoning"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Override Reasoning</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Explain why you're overriding the AI decision..."
                          {...field}
                          data-testid="textarea-reasoning"
                        />
                      </FormControl>
                      <FormDescription>
                        This will be recorded for audit and AI improvement purposes.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowOverrideDialog(false)}
                    data-testid="button-cancel-override"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={overrideMutation.isPending}
                    data-testid="button-apply-override"
                  >
                    {overrideMutation.isPending ? "Applying..." : "Apply Override"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </Card>
    </TooltipProvider>
  );
}

// Helper functions
function calculateTriageConfidence(aiAnalysis: AITriageData): number {
  // Simple confidence calculation based on completeness and reasoning quality
  let confidence = 0.5; // Base confidence

  // Add confidence for having detailed reasoning
  if (aiAnalysis.reasoning && aiAnalysis.reasoning.length > 50) confidence += 0.2;

  // Add confidence for having troubleshooting steps
  if (aiAnalysis.troubleshootingSteps.length > 0) confidence += 0.1;

  // Add confidence for specific diagnosis
  if (aiAnalysis.preliminaryDiagnosis && aiAnalysis.preliminaryDiagnosis.length > 20) confidence += 0.1;

  // Add confidence for safety assessment
  if (aiAnalysis.safetyRisk !== "None") confidence += 0.1;

  return Math.min(confidence, 1.0);
}

function getUrgencyVariant(urgency: string): "default" | "secondary" | "destructive" | "outline" {
  switch (urgency) {
    case "Critical":
    case "High":
      return "destructive";
    case "Medium":
      return "secondary";
    default:
      return "outline";
  }
}