import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { Property } from "@shared/schema";

interface MortgageAdjustmentFormProps {
  properties: Property[];
  onClose: () => void;
}

const mortgageAdjustmentSchema = z.object({
  propertyId: z.string().min(1, "Please select a property"),
  year: z.number().min(2020, "Year must be at least 2020").max(new Date().getFullYear(), "Year cannot be in the future"),
  actualInterestPaid: z.number().min(0, "Interest amount must be positive"),
});

type MortgageAdjustmentData = z.infer<typeof mortgageAdjustmentSchema>;

export default function MortgageAdjustmentForm({ properties, onClose }: MortgageAdjustmentFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedProperty, setSelectedProperty] = useState<string>("");

  const form = useForm<MortgageAdjustmentData>({
    resolver: zodResolver(mortgageAdjustmentSchema),
    defaultValues: {
      propertyId: "",
      year: new Date().getFullYear(),
      actualInterestPaid: 0,
    },
  });

  // Filter properties to only show those with mortgage info
  const propertiesWithMortgage = properties.filter(p => p.monthlyMortgage && Number(p.monthlyMortgage) > 0);

  const adjustMortgageMutation = useMutation({
    mutationFn: async (data: MortgageAdjustmentData) => {
      const response = await apiRequest("POST", "/api/expenses/mortgage-adjustment", data);
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({
        title: "Mortgage Adjustment Complete",
        description: `Successfully split ${result.adjustedCount} mortgage payments into interest and principal components.`,
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process mortgage adjustment",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: MortgageAdjustmentData) => {
    adjustMortgageMutation.mutate(data);
  };

  const selectedPropertyData = propertiesWithMortgage.find(p => p.id === selectedProperty);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      {propertiesWithMortgage.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No properties with mortgage information found.</p>
          <p className="text-sm text-muted-foreground mt-2">Add mortgage details to your properties first.</p>
        </div>
      ) : (
        <>
          <div>
            <Label htmlFor="property">Property</Label>
            <Select 
              value={form.watch("propertyId")} 
              onValueChange={(value) => {
                form.setValue("propertyId", value);
                setSelectedProperty(value);
              }}
            >
              <SelectTrigger data-testid="select-mortgage-property">
                <SelectValue placeholder="Select property with mortgage" />
              </SelectTrigger>
              <SelectContent>
                {propertiesWithMortgage.map((property) => (
                  <SelectItem key={property.id} value={property.id}>
                    {property.name || `${property.street}, ${property.city}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.propertyId && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.propertyId.message}</p>
            )}
          </div>

          {selectedPropertyData && (
            <div className="bg-muted p-4 rounded-lg text-sm space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="font-medium text-foreground">Primary Mortgage</p>
                  <p><strong>Monthly Payment:</strong> ${Number(selectedPropertyData.monthlyMortgage).toLocaleString()}</p>
                  {selectedPropertyData.interestRate && (
                    <p><strong>Interest Rate:</strong> {selectedPropertyData.interestRate}%</p>
                  )}
                </div>
                {selectedPropertyData.monthlyMortgage2 && Number(selectedPropertyData.monthlyMortgage2) > 0 && (
                  <div>
                    <p className="font-medium text-foreground">Secondary Mortgage</p>
                    <p><strong>Monthly Payment:</strong> ${Number(selectedPropertyData.monthlyMortgage2).toLocaleString()}</p>
                    {selectedPropertyData.interestRate2 && (
                      <p><strong>Interest Rate:</strong> {selectedPropertyData.interestRate2}%</p>
                    )}
                  </div>
                )}
              </div>
              
              {selectedPropertyData.acquisitionDate && (
                <p><strong>Acquired:</strong> {new Date(selectedPropertyData.acquisitionDate).toLocaleDateString()}</p>
              )}
              
              <div className="border-t pt-3 mt-3">
                <p className="font-medium text-foreground mb-2">Annual Mortgage Totals for {form.watch("year") || new Date().getFullYear()}:</p>
                {(() => {
                  const year = form.watch("year") || new Date().getFullYear();
                  
                  // Calculate active months based on mortgage start date
                  const calculateActiveMonths = (mortgageStartDate: string | Date | undefined) => {
                    if (!mortgageStartDate) return 12;
                    
                    const startDate = new Date(mortgageStartDate);
                    const yearStart = new Date(year, 0, 1);
                    const yearEnd = new Date(year, 11, 31);
                    
                    const activeStart = startDate > yearStart ? startDate : yearStart;
                    const activeEnd = yearEnd;
                    
                    if (activeStart > yearEnd) return 0;
                    
                    const startMonth = activeStart.getMonth();
                    const startYear = activeStart.getFullYear();
                    const endMonth = activeEnd.getMonth();
                    const endYear = activeEnd.getFullYear();
                    
                    return (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
                  };
                  
                  const primaryMonths = calculateActiveMonths(selectedPropertyData.mortgageStartDate);
                  const secondaryMonths = calculateActiveMonths(selectedPropertyData.mortgageStartDate2);
                  
                  const primaryTotal = Number(selectedPropertyData.monthlyMortgage) * primaryMonths;
                  const secondaryTotal = selectedPropertyData.monthlyMortgage2 ? Number(selectedPropertyData.monthlyMortgage2) * secondaryMonths : 0;
                  
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-primary font-semibold">
                            Primary: ${primaryTotal.toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            ${Number(selectedPropertyData.monthlyMortgage).toLocaleString()} × {primaryMonths} months
                          </p>
                        </div>
                        {selectedPropertyData.monthlyMortgage2 && Number(selectedPropertyData.monthlyMortgage2) > 0 && (
                          <div>
                            <p className="text-primary font-semibold">
                              Secondary: ${secondaryTotal.toLocaleString()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              ${Number(selectedPropertyData.monthlyMortgage2).toLocaleString()} × {secondaryMonths} months
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="mt-2 pt-2 border-t">
                        <p className="text-lg font-bold text-primary">
                          Total Annual: ${(primaryTotal + secondaryTotal).toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          This is the total you should allocate between interest and principal
                        </p>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="year">Tax Year</Label>
            <Input
              id="year"
              type="number"
              min="2020"
              max={new Date().getFullYear()}
              placeholder="2024"
              {...form.register("year", { valueAsNumber: true })}
              data-testid="input-tax-year"
            />
            {form.formState.errors.year && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.year.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="actualInterestPaid">Actual Interest Paid</Label>
            <Input
              id="actualInterestPaid"
              type="number"
              step="0.01"
              min="0"
              placeholder="12000.00"
              {...form.register("actualInterestPaid", { valueAsNumber: true })}
              data-testid="input-interest-paid"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Enter the total interest amount from your mortgage company's year-end statement (Form 1098)
            </p>
            {form.formState.errors.actualInterestPaid && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.actualInterestPaid.message}</p>
            )}
          </div>

          <Separator />

          <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">How this works:</p>
            <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
              <li>• Find all "Mortgage" category expenses for the selected year</li>
              <li>• Split them into deductible "Interest" and non-deductible "Principal"</li>
              <li>• Creates accurate records for tax reporting</li>
              <li>• Based on days owned if partial year</li>
            </ul>
          </div>
        </>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        {propertiesWithMortgage.length > 0 && (
          <Button 
            type="submit" 
            disabled={adjustMortgageMutation.isPending}
            data-testid="button-process-adjustment"
          >
            {adjustMortgageMutation.isPending ? "Processing..." : "Process Adjustment"}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}