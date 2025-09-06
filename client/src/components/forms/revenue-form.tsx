import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, HelpCircle, Repeat } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import type { Property, Unit } from "@shared/schema";
import { formatNumberWithCommas, removeCommas } from "@/lib/formatters";

const revenueSchema = z.object({
  description: z.string().optional(),
  amount: z.number({ required_error: "Amount is required" }).min(0.01, "Amount must be greater than 0"),
  category: z.string().optional(),
  customCategory: z.string().optional(),
  date: z.date(),
  isDateRange: z.boolean().default(false),
  endDate: z.date().optional(),
  propertyId: z.string().optional(),
  unitId: z.string().optional(),
  notes: z.string().optional(),
  isRecurring: z.boolean().default(false),
  recurringFrequency: z.enum(["days", "weeks", "months", "years", "monthly", "quarterly", "biannually", "annually"]).optional(),
  recurringInterval: z.number().min(1).default(1),
  recurringEndDate: z.date().optional(),
  taxDeductible: z.boolean().default(true),
  scope: z.enum(["property", "operational"]).default("property"),
  entityId: z.string().optional(),
}).refine((data) => {
  if (data.isRecurring && !data.recurringFrequency) {
    return false;
  }
  return true;
}, {
  message: "Recurring frequency is required for recurring revenue",
  path: ["recurringFrequency"],
}).refine((data) => {
  if (data.isDateRange && !data.endDate) {
    return false;
  }
  return true;
}, {
  message: "End date is required when using date range",
  path: ["endDate"],
}).refine((data) => {
  if (data.isDateRange && data.endDate && data.endDate <= data.date) {
    return false;
  }
  return true;
}, {
  message: "End date must be after start date",
  path: ["endDate"],
}).refine((data) => {
  if (data.category === "custom" && (!data.customCategory || data.customCategory.trim() === "")) {
    return false;
  }
  return true;
}, {
  message: "Custom category name is required",
  path: ["customCategory"],
});

interface RevenueFormProps {
  properties: Property[];
  units: Unit[];
  entities: Array<{ id: string; name: string; }>;
  revenue?: any | null;
  onSubmit: (data: z.infer<typeof revenueSchema>) => void;
  onClose?: () => void;
  isLoading: boolean;
}

export default function RevenueForm({ properties, units, entities, revenue, onSubmit, onClose, isLoading }: RevenueFormProps) {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  
  const selectedProperty = properties.find(p => p.id === selectedPropertyId);
  const selectedPropertyUnits = units.filter(unit => unit.propertyId === selectedPropertyId);
  const isBuilding = selectedProperty?.type === "Commercial Building" || selectedProperty?.type === "Residential Building";
  
  // Update selectedPropertyId when editing revenue
  useEffect(() => {
    if (revenue?.propertyId) {
      setSelectedPropertyId(revenue.propertyId);
    } else {
      setSelectedPropertyId("");
    }
  }, [revenue]);

  const form = useForm<z.infer<typeof revenueSchema>>({
    resolver: zodResolver(revenueSchema),
    defaultValues: revenue ? {
      description: revenue.description || "",
      amount: parseFloat(revenue.amount),
      category: revenue.category || "",
      date: new Date(revenue.date),
      isDateRange: revenue.isDateRange || false,
      endDate: revenue.endDate ? new Date(revenue.endDate) : undefined,
      propertyId: revenue.propertyId || undefined,
      notes: revenue.notes || "",
      isRecurring: revenue.isRecurring || false,
      recurringFrequency: revenue.recurringFrequency,
      recurringInterval: revenue.recurringInterval || 1,
      recurringEndDate: revenue.recurringEndDate ? new Date(revenue.recurringEndDate) : undefined,
      taxDeductible: revenue.taxDeductible !== undefined ? revenue.taxDeductible : true,
      scope: revenue.scope || "property",
      entityId: revenue.entityId || undefined,
    } : {
      description: "",
      amount: undefined,
      category: "",
      date: new Date(),
      isDateRange: false,
      isRecurring: false,
      recurringInterval: 1,
      taxDeductible: true,
      scope: "property" as const,
    },
  });

  const revenueCategories = [
    {
      value: "Rental Income",
      label: "Rental Income",
      description: "Monthly rent received from tenants",
      taxDeductible: true
    },
    {
      value: "Advance Rent",
      label: "Advance Rent", 
      description: "Rent received in advance (e.g., first/last month upfront)",
      taxDeductible: true
    },
    {
      value: "Security Deposits Kept",
      label: "Security Deposits Kept",
      description: "Security deposits retained for damages or unpaid rent",
      taxDeductible: true
    },
    {
      value: "Parking Fees",
      label: "Parking Fees",
      description: "Monthly or annual parking fees from tenants",
      taxDeductible: true
    },
    {
      value: "Laundry Income",
      label: "Laundry/Vending Income",
      description: "Income from laundry machines, vending machines, or similar amenities",
      taxDeductible: true
    },
    {
      value: "Pet Rent",
      label: "Pet Rent",
      description: "Monthly pet fees or pet deposits",
      taxDeductible: true
    },
    {
      value: "Storage Fees",
      label: "Storage Fees",
      description: "Fees for storage units or storage areas",
      taxDeductible: true
    },
    {
      value: "Lease Cancellation Fees",
      label: "Lease Cancellation Fees",
      description: "Fees charged for early lease termination",
      taxDeductible: true
    },
    {
      value: "Other Income",
      label: "Other Income",
      description: "Any other legitimate rental income (application fees, late fees, etc.)",
      taxDeductible: true
    },
    {
      value: "Non-Taxable Income",
      label: "Non-Taxable Income",
      description: "Income that is not subject to taxation (security deposits received, etc.)",
      taxDeductible: false
    },
    {
      value: "custom",
      label: "Custom Category",
      description: "Enter your own category name",
      taxDeductible: false
    }
  ];

  const selectedCategory = revenueCategories.find(cat => cat.value === form.watch("category"));
  const isRecurring = form.watch("isRecurring");
  const isDateRange = form.watch("isDateRange");
  const watchedCategory = form.watch("category");
  const showCustomCategoryInput = watchedCategory === "custom";

  return (
    <div className="max-h-[80vh] overflow-y-auto">
      <Form {...form}>
        <form onSubmit={(e) => {
          form.handleSubmit(
            (data) => {
              onSubmit(data);
            }
          )(e);
        }} className="space-y-3">
          
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="e.g., Monthly rent - Unit 2A, Parking fee - September" 
                    value={field.value || ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    data-testid="input-revenue-description" 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input 
                      type="text" 
                      placeholder="0.00" 
                      inputMode="decimal"
                      value={field.value ? formatNumberWithCommas(field.value) : ""}
                      onChange={(e) => {
                        const rawValue = removeCommas(e.target.value);
                        field.onChange(rawValue === "" ? undefined : parseFloat(rawValue) || undefined);
                      }}
                      onBlur={field.onBlur}
                      name={field.name}
                      data-testid="input-revenue-amount"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center space-x-2">
                    <FormLabel>Category</FormLabel>
                    {selectedCategory && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="max-w-xs">
                            <p className="font-medium">{selectedCategory.label}</p>
                            <p className="text-sm text-muted-foreground">{selectedCategory.description}</p>
                            <p className="text-xs mt-1">
                              <span className={selectedCategory.taxDeductible ? "text-green-600" : "text-orange-600"}>
                                {selectedCategory.taxDeductible ? "✓ Taxable Income" : "⚠ Non-Taxable"}
                              </span>
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <Select onValueChange={(value) => {
                    field.onChange(value);
                    const cat = revenueCategories.find(c => c.value === value);
                    form.setValue("taxDeductible", cat?.taxDeductible ?? true);
                  }} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-revenue-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {revenueCategories.map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          <div className="flex items-center justify-between w-full">
                            <span>{category.label}</span>
                            <span className="text-xs ml-2">
                              {category.taxDeductible ? "✓" : "⚠"}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Custom Category Input */}
          {showCustomCategoryInput && (
            <FormField
              control={form.control}
              name="customCategory"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Custom Category Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Enter your custom category name" 
                      value={field.value || ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      data-testid="input-custom-category"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Date Selection */}
          <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
            <FormField
              control={form.control}
              name="isDateRange"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="flex items-center space-x-2">
                      <CalendarIcon className="h-4 w-4" />
                      <span>Date Range (Bulk Entry)</span>
                    </FormLabel>
                    <div className="text-sm text-muted-foreground">
                      Enter revenue for a date range instead of a single date
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-date-range"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>{isDateRange ? "Start Date" : "Date"}</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "justify-start text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="button-revenue-date"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date > new Date() || date < new Date("1900-01-01")
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isDateRange ? (
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>End Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "justify-start text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              data-testid="button-revenue-end-date"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick end date</span>
                              )}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date > new Date() || date < new Date("1900-01-01") || (form.getValues("date") && date <= form.getValues("date"))
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="propertyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Property (Optional)</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          field.onChange(value);
                          setSelectedPropertyId(value);
                          // Clear unit selection when property changes
                          form.setValue("unitId", "");
                        }} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-revenue-property">
                            <SelectValue placeholder="Select property" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No specific property</SelectItem>
                          {properties.map((property) => (
                            <SelectItem key={property.id} value={property.id}>
                              {property.name || `${property.street}, ${property.city}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Unit Selection - only show if property is selected, is a building type, and has units */}
            {selectedPropertyId && selectedPropertyId !== "none" && isBuilding && selectedPropertyUnits.length > 0 && !isDateRange && (
              <FormField
                control={form.control}
                name="unitId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit (Optional)</FormLabel>
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground mb-2">
                        Choose a specific unit or leave blank for common area revenue
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {/* Common Area Option */}
                        <div className="flex flex-col space-y-2 p-3 border rounded-md bg-muted/30">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              value=""
                              checked={!field.value}
                              onChange={() => field.onChange("")}
                              className="rounded border-gray-300"
                              data-testid="radio-unit-range-common"
                            />
                            <span className="text-sm font-medium">Common Area</span>
                          </label>
                          <span className="text-xs text-muted-foreground">
                            Revenue not tied to specific unit
                          </span>
                        </div>
                        
                        {/* Individual Units */}
                        {selectedPropertyUnits.map((unit) => (
                          <div key={unit.id} className="flex flex-col space-y-2 p-3 border rounded-md bg-muted/30">
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="radio"
                                value={unit.id}
                                checked={field.value === unit.id}
                                onChange={() => field.onChange(unit.id)}
                                className="rounded border-gray-300"
                                data-testid={`radio-unit-range-${unit.id}`}
                              />
                              <span className="text-sm font-medium">{unit.label}</span>
                            </label>
                            <span className="text-xs text-muted-foreground">
                              Revenue for this unit
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>

          {/* Recurring Revenue */}
          <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
            <FormField
              control={form.control}
              name="isRecurring"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="flex items-center space-x-2">
                      <Repeat className="h-4 w-4" />
                      <span>Recurring Revenue</span>
                    </FormLabel>
                    <div className="text-sm text-muted-foreground">
                      Set up automatic recurring revenue (e.g., monthly rent)
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-recurring"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {isRecurring && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="recurringInterval"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Every</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min="1"
                            placeholder="1" 
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                            data-testid="input-recurring-interval"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="recurringFrequency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Period</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-recurring-frequency">
                              <SelectValue placeholder="Period" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="quarterly">Quarterly</SelectItem>
                            <SelectItem value="biannually">Bi-annually</SelectItem>
                            <SelectItem value="annually">Annually</SelectItem>
                            <SelectItem value="weeks">Weeks</SelectItem>
                            <SelectItem value="days">Days</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="recurringEndDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>End Date (Optional)</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "justify-start text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-recurring-end-date"
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>No end date</span>
                                )}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) =>
                                date < new Date()
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes (Optional)</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="Additional details about this revenue..."
                    value={field.value || ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    data-testid="textarea-revenue-notes"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2">
            {onClose && (
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose}
                data-testid="button-cancel-revenue"
              >
                Cancel
              </Button>
            )}
            <Button 
              type="submit" 
              disabled={isLoading}
              data-testid="button-submit-revenue"
            >
              {isLoading ? "Saving..." : revenue ? "Update Revenue" : "Log Revenue"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}