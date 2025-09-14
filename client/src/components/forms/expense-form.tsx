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
import { CalendarIcon, HelpCircle, Repeat, Plus, Trash2, Receipt, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useState, useEffect } from "react";
import type { Property, Unit } from "@shared/schema";
import { formatNumberWithCommas, removeCommas } from "@/lib/formatters";

const lineItemSchema = z.object({
  description: z.string().optional(),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  category: z.string().min(1, "Category is required"),
  taxDeductible: z.boolean().default(true),
});

const expenseSchema = z.object({
  description: z.string().optional(),
  amount: z.number({ required_error: "Amount is required" }).min(0.01, "Amount must be greater than 0"),
  category: z.string().optional(),
  customCategory: z.string().optional(),
  date: z.date(),
  isDateRange: z.boolean().default(false),
  endDate: z.date().optional(),
  propertyId: z.string().optional(),
  unitId: z.string().optional(),
  vendorId: z.string().optional(),
  receiptUrl: z.string().optional(),
  notes: z.string().optional(),
  isRecurring: z.boolean().default(false),
  recurringFrequency: z.enum(["days", "weeks", "months", "years", "monthly", "quarterly", "biannually", "annually"]).optional(),
  recurringInterval: z.number().min(1).default(1),
  recurringEndDate: z.date().optional(),
  taxDeductible: z.boolean().default(true),
  isSplitExpense: z.boolean().default(false),
  lineItems: z.array(lineItemSchema).optional(),
  scope: z.enum(["property", "operational"]).default("property"),
  entityId: z.string().optional(),
  isBulkEntry: z.boolean().default(false),
  // Multi-year amortization fields
  isAmortized: z.boolean().default(false),
  amortizationYears: z.number().min(2).max(40).optional(),
  amortizationStartDate: z.date().optional(),
  amortizationMethod: z.enum(["straight_line"]).default("straight_line"),
  // Tax categorization field
  scheduleECategory: z.enum([
    "advertising", "auto_travel", "cleaning_maintenance", "commissions", 
    "insurance", "legal_professional", "management_fees", "mortgage_interest", 
    "other_interest", "repairs", "supplies", "taxes", "utilities", "depreciation", 
    "other_expenses", "capital_improvements"
  ]).optional(),
}).refine((data) => {
  if (data.isRecurring && !data.recurringFrequency) {
    return false;
  }
  return true;
}, {
  message: "Recurring frequency is required for recurring expenses",
  path: ["recurringFrequency"],
}).refine((data) => {
  if (data.isSplitExpense && (!data.lineItems || data.lineItems.length === 0)) {
    return false;
  }
  return true;
}, {
  message: "Line items are required for split expenses",
  path: ["lineItems"],
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
}).refine((data) => {
  if (data.scope === "operational" && !data.entityId) {
    return false;
  }
  return true;
}, {
  message: "Entity selection is required for operational expenses",
  path: ["entityId"],
}).refine((data) => {
  // Amortization validation: only allow for tax deductible expenses
  if (data.isAmortized && !data.taxDeductible) {
    return false;
  }
  return true;
}, {
  message: "Amortization is only available for tax deductible expenses",
  path: ["isAmortized"],
}).refine((data) => {
  // Amortization validation: require years when amortized
  if (data.isAmortized && !data.amortizationYears) {
    return false;
  }
  return true;
}, {
  message: "Number of years is required for amortized expenses",
  path: ["amortizationYears"],
});

interface ExpenseFormProps {
  properties: Property[];
  units: Unit[];
  entities: Array<{ id: string; name: string; }>;
  expense?: any | null;
  onSubmit: (data: z.infer<typeof expenseSchema>) => void;
  onClose?: () => void;
  isLoading: boolean;
  onTriggerMortgageAdjustment?: () => void;
}

export default function ExpenseForm({ properties, units, entities, expense, onSubmit, onClose, isLoading, onTriggerMortgageAdjustment }: ExpenseFormProps) {
  const [uploadedReceiptUrl, setUploadedReceiptUrl] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  
  const selectedProperty = properties.find(p => p.id === selectedPropertyId);
  const selectedPropertyUnits = units.filter(unit => unit.propertyId === selectedPropertyId);
  const isBuilding = selectedProperty?.type === "Commercial Building" || selectedProperty?.type === "Residential Building";
  const isMultiUnit = selectedPropertyUnits.length > 1;
  
  // Update selectedPropertyId when editing an expense
  useEffect(() => {
    if (expense?.propertyId) {
      setSelectedPropertyId(expense.propertyId);
    } else {
      setSelectedPropertyId("");
    }
  }, [expense]);

  const form = useForm<z.infer<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema),
    defaultValues: expense ? {
      description: expense.description || "",
      amount: parseFloat(expense.amount),
      category: expense.category || "",
      date: new Date(expense.date),
      isDateRange: expense.isDateRange || false,
      endDate: expense.endDate ? new Date(expense.endDate) : undefined,
      propertyId: expense.propertyId || undefined,
      unitId: expense.unitId || undefined,
      vendorId: expense.vendorId || undefined,
      receiptUrl: expense.receiptUrl || undefined,
      notes: expense.notes || "",
      isRecurring: expense.isRecurring || false,
      recurringFrequency: expense.recurringFrequency,
      recurringInterval: expense.recurringInterval || 1,
      recurringEndDate: expense.recurringEndDate ? new Date(expense.recurringEndDate) : undefined,
      taxDeductible: expense.taxDeductible !== undefined ? expense.taxDeductible : true,
      isSplitExpense: expense.isSplitExpense || false,
      lineItems: expense.lineItems || [],
      scope: expense.scope || "property",
      entityId: expense.entityId || undefined,
      isBulkEntry: expense.isBulkEntry || false,
      // Amortization fields
      isAmortized: expense.isAmortized || false,
      amortizationYears: expense.amortizationYears || undefined,
      amortizationStartDate: expense.amortizationStartDate ? new Date(expense.amortizationStartDate) : undefined,
      amortizationMethod: expense.amortizationMethod || "straight_line",
      // Tax categorization field
      scheduleECategory: expense.scheduleECategory || undefined,
    } : {
      description: "",
      amount: undefined,
      category: "",
      date: new Date(),
      isDateRange: false,
      isRecurring: false,
      recurringInterval: 1,
      taxDeductible: true,
      isSplitExpense: false,
      lineItems: [],
      scope: "property" as const,
      isBulkEntry: false,
      // Amortization fields
      isAmortized: false,
      amortizationYears: undefined,
      amortizationStartDate: undefined,
      amortizationMethod: "straight_line",
      // Tax categorization field  
      scheduleECategory: undefined,
    },
  });

  // Set unitId after property and units are loaded
  useEffect(() => {
    if (expense?.unitId && selectedPropertyId && selectedPropertyUnits.length > 0) {
      // Check if the expense unitId exists in the current property's units
      const unitExists = selectedPropertyUnits.find(unit => unit.id === expense.unitId);
      if (unitExists) {
        form.setValue("unitId", expense.unitId);
      } else if (expense.unitId === "common") {
        form.setValue("unitId", "common");
      }
    }
  }, [expense, selectedPropertyId, selectedPropertyUnits, form]);

  // Combined Schedule E categories - both for regular categorization AND tax reporting
  const expenseCategories = [
    // Tax-deductible Schedule E categories
    {
      value: "Advertising",
      label: "Advertising",
      description: "Costs of marketing the property (online ads, signs, listings)",
      taxDeductible: true,
      scheduleEKey: "advertising"
    },
    {
      value: "Auto and Travel",
      label: "Auto and Travel",
      description: "Mileage, transportation, or travel directly related to managing or maintaining the rental",
      taxDeductible: true,
      scheduleEKey: "auto_travel"
    },
    {
      value: "Cleaning and Maintenance",
      label: "Cleaning and Maintenance",
      description: "Routine upkeep, landscaping, pest control, and minor repairs",
      taxDeductible: true,
      scheduleEKey: "cleaning_maintenance"
    },
    {
      value: "Commissions",
      label: "Commissions",
      description: "Leasing or property management commissions",
      taxDeductible: true,
      scheduleEKey: "commissions"
    },
    {
      value: "Depreciation Expense",
      label: "Depreciation Expense",
      description: "Deduction for wear-and-tear of the building and certain improvements",
      taxDeductible: true,
      scheduleEKey: "depreciation"
    },
    {
      value: "Insurance",
      label: "Insurance",
      description: "Property insurance, liability insurance, flood insurance, etc.",
      taxDeductible: true,
      scheduleEKey: "insurance"
    },
    {
      value: "Legal and Other Professional Fees",
      label: "Legal and Other Professional Fees",
      description: "Attorney fees, accounting, property management, and consulting",
      taxDeductible: true,
      scheduleEKey: "legal_professional"
    },
    {
      value: "Management Fees",
      label: "Management Fees",
      description: "Paid to property management companies",
      taxDeductible: true,
      scheduleEKey: "management_fees"
    },
    {
      value: "Mortgage Interest",
      label: "Mortgage Interest", 
      description: "Interest portion of mortgage payments (tax-deductible)",
      taxDeductible: true,
      scheduleEKey: "mortgage_interest"
    },
    {
      value: "Other Interest",
      label: "Other Interest",
      description: "Interest on loans used for the rental business besides the mortgage",
      taxDeductible: true,
      scheduleEKey: "other_interest"
    },
    {
      value: "Other",
      label: "Other",
      description: "Any legitimate rental expense not fitting in the above (e.g., HOA fees, bank fees, safety inspections, software subscriptions)",
      taxDeductible: true,
      scheduleEKey: "other_expenses"
    },
    {
      value: "Repairs",
      label: "Repairs",
      description: "Costs to fix something broken or keep property in working order (not improvements)",
      taxDeductible: true,
      scheduleEKey: "repairs"
    },
    {
      value: "Supplies",
      label: "Supplies",
      description: "Items used for rental operations (light bulbs, locks, cleaning supplies)",
      taxDeductible: true,
      scheduleEKey: "supplies"
    },
    {
      value: "Taxes",
      label: "Taxes",
      description: "Property taxes, state/local taxes directly tied to the rental",
      taxDeductible: true,
      scheduleEKey: "taxes"
    },
    {
      value: "Utilities",
      label: "Utilities",
      description: "Water, electricity, gas, trash collection, etc., if paid by the landlord",
      taxDeductible: true,
      scheduleEKey: "utilities"
    },
    // Non-tax deductible categories at bottom
    {
      value: "Mortgage",
      label: "Mortgage",
      description: "Auto-generated mortgage payments from property setup, or manual extra mortgage payments",
      taxDeductible: false
    },
    {
      value: "Capital Contribution",
      label: "Capital Contribution",
      description: "Money invested into the property or business (not tax deductible)",
      taxDeductible: false
    },
    {
      value: "Capital Distribution",
      label: "Capital Distribution",
      description: "Money withdrawn from the property or business (not tax deductible)",
      taxDeductible: false
    },
    {
      value: "none",
      label: "No Category",
      description: "Leave category blank (not tax deductible)",
      taxDeductible: false
    },
    {
      value: "custom",
      label: "Custom Category",
      description: "Enter your own category name (not tax deductible)",
      taxDeductible: false
    }
  ];

  const selectedCategory = expenseCategories.find(cat => cat.value === form.watch("category"));
  const isRecurring = form.watch("isRecurring");
  const isSplitExpense = form.watch("isSplitExpense");
  const isDateRange = form.watch("isDateRange");
  const currentLineItems = form.watch("lineItems") || [];
  const watchedCategory = form.watch("category");
  const showCustomCategoryInput = watchedCategory === "custom";
  
  // Auto-reset amortization fields when expense becomes non-deductible
  const watchedTaxDeductible = form.watch("taxDeductible");
  useEffect(() => {
    if (!watchedTaxDeductible) {
      form.setValue("isAmortized", false);
      form.setValue("amortizationYears", undefined);
      form.setValue("amortizationStartDate", undefined);
    }
  }, [watchedTaxDeductible, form]);

  return (
    <div className="max-h-[80vh] overflow-y-auto">
      {/* Debug info */}
      <div className="text-xs text-gray-500 mb-2">
        Debug: Form valid: {form.formState.isValid ? 'Yes' : 'No'}, 
        Errors: {Object.keys(form.formState.errors).join(', ') || 'None'}
      </div>
      <Form {...form}>
        <form onSubmit={(e) => {
          console.log("Form onSubmit triggered!");
          form.handleSubmit(
            (data) => {
              console.log("Form validation passed, submitting:", data);
              const submissionData = {
                ...data,
                receiptUrl: uploadedReceiptUrl || undefined,
              };
              onSubmit(submissionData);
            },
            (errors) => {
              console.log("Form validation failed with errors:", errors);
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
                  placeholder="e.g., Plumbing repair, Property insurance" 
                  value={field.value || ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  data-testid="input-expense-description" 
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
                    inputMode="decimal"
                    placeholder="0.00" 
                    value={field.value ? formatNumberWithCommas(field.value) : ""}
                    onChange={(e) => {
                      const rawValue = removeCommas(e.target.value);
                      field.onChange(rawValue === "" ? undefined : parseFloat(rawValue) || undefined);
                    }}
                    onBlur={field.onBlur}
                    name={field.name}
                    data-testid="input-expense-amount"
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
                              {selectedCategory.taxDeductible ? "✓ Tax Deductible" : "⚠ Not Tax Deductible"}
                            </span>
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <Select onValueChange={(value) => {
                  field.onChange(value);
                  const cat = expenseCategories.find(c => c.value === value);
                  form.setValue("taxDeductible", cat?.taxDeductible ?? true);
                  // Auto-map to Schedule E category with default for tax-deductible expenses
                  if (cat?.taxDeductible) {
                    form.setValue("scheduleECategory", cat?.scheduleEKey || "other_expenses");
                  } else {
                    form.setValue("scheduleECategory", undefined);
                  }
                  
                  // Trigger mortgage adjustment dialog when "Mortgage Interest" is selected
                  if (value === "Mortgage Interest" && onTriggerMortgageAdjustment) {
                    onTriggerMortgageAdjustment();
                  }
                }} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-expense-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {expenseCategories.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        <div className="flex items-center justify-between w-full">
                          <span>{category.label}</span>
                          <div className="ml-2">
                            {category.taxDeductible ? (
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 border border-green-300 rounded-full text-xs font-medium">
                                ✓ Tax Deductible
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 border border-orange-300 rounded-full text-xs font-medium">
                                ⚠ Not Deductible
                              </div>
                            )}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

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
        </div>

        {/* Tax & Deduction Settings */}
        <div className="space-y-3 p-4 border rounded-lg bg-muted/20">
          <div className="flex items-center space-x-2">
            <Receipt className="h-4 w-4" />
            <h4 className="text-sm font-medium">Tax & Deduction Settings</h4>
          </div>
          
          {/* Deduction Method - Only show for tax deductible expenses */}
          {form.watch("taxDeductible") && (
            <FormField
            control={form.control}
            name="isAmortized"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel>Deduction Method</FormLabel>
                <FormControl>
                  <Select
                    value={field.value ? "amortized" : "full"}
                    onValueChange={(value) => {
                      const isAmortized = value === "amortized";
                      field.onChange(isAmortized);
                      
                      // Reset amortization fields when switching to full deduction
                      if (!isAmortized) {
                        form.setValue("amortizationYears", undefined);
                        form.setValue("amortizationStartDate", undefined);
                      } else {
                        // Set default start date and auto-select 5 years when enabling amortization
                        form.setValue("amortizationStartDate", form.getValues("date"));
                        form.setValue("amortizationYears", 5); // Auto-select 5 years as default
                      }
                    }}
                  >
                    <SelectTrigger data-testid="select-deduction-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Fully this year</SelectItem>
                      <SelectItem 
                        value="amortized" 
                        disabled={!form.watch("taxDeductible")}
                      >
                        <div className="flex flex-col">
                          <span>Deduct over time</span>
                          {!form.watch("taxDeductible") && (
                            <span className="text-xs text-muted-foreground">Requires tax deductible expense</span>
                          )}
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            )}
          />
          )}

          {/* Years Dropdown - Only show when "Deduct over time" is selected */}
          {form.watch("isAmortized") && (
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amortizationYears"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Years</FormLabel>
                    <Select
                      value={field.value?.toString()}
                      onValueChange={(value) => field.onChange(parseInt(value))}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-amortization-years">
                          <SelectValue placeholder="Select years" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="2">2 years</SelectItem>
                        <SelectItem value="3">3 years</SelectItem>
                        <SelectItem value="5">5 years</SelectItem>
                        <SelectItem value="7">7 years</SelectItem>
                        <SelectItem value="10">10 years</SelectItem>
                        <SelectItem value="15">15 years</SelectItem>
                        <SelectItem value="20">20 years</SelectItem>
                        <SelectItem value="25">25 years</SelectItem>
                        <SelectItem value="30">30 years</SelectItem>
                        <SelectItem value="35">35 years</SelectItem>
                        <SelectItem value="39">39 years</SelectItem>
                        <SelectItem value="40">40 years</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amortizationStartDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Start Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "justify-start text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="button-amortization-start-date"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick date</span>
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
            </div>
          )}

          {/* Auto Tax Category Display */}
          {form.watch("taxDeductible") && (
            <div className="text-sm text-muted-foreground">
              Tax category: <strong>{selectedCategory?.scheduleEKey || 'Other expenses'}</strong> (auto-assigned)
            </div>
          )}

          {/* Override Toggle - Small and at Bottom */}
          <FormField
            control={form.control}
            name="taxDeductible"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between pt-2 border-t border-muted">
                <div className="space-y-0">
                  <FormLabel className="text-xs text-muted-foreground">
                    Override automatic tax deductible status
                  </FormLabel>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value !== (selectedCategory?.taxDeductible ?? true)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        // User wants to override - toggle the automatic value
                        const newTaxDeductible = !(selectedCategory?.taxDeductible ?? true);
                        field.onChange(newTaxDeductible);
                        // Sync scheduleECategory with override
                        if (newTaxDeductible) {
                          form.setValue("scheduleECategory", selectedCategory?.scheduleEKey || "other_expenses");
                        } else {
                          form.setValue("scheduleECategory", undefined);
                        }
                      } else {
                        // User wants to use automatic - set to category default
                        const categoryDefault = selectedCategory?.taxDeductible ?? true;
                        field.onChange(categoryDefault);
                        // Restore automatic Schedule E mapping
                        if (categoryDefault) {
                          form.setValue("scheduleECategory", selectedCategory?.scheduleEKey || "other_expenses");
                        } else {
                          form.setValue("scheduleECategory", undefined);
                        }
                      }
                    }}
                    data-testid="switch-tax-deductible-override"
                    className="scale-75"
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

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
                    Enter expenses for a date range instead of a single date
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
                          data-testid="button-expense-date"
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
                            data-testid="button-expense-end-date"
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
              <div className="space-y-4">
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
                          <SelectTrigger data-testid="select-expense-property">
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
                
                {/* Unit Selection - only show if property is selected, is a building type, and has units */}
                {selectedPropertyId && selectedPropertyId !== "none" && isBuilding && selectedPropertyUnits.length > 0 && (
                  <FormField
                    control={form.control}
                    name="unitId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Area/Unit</FormLabel>
                        <div className="flex flex-col space-y-2 p-3 border rounded-md bg-muted/30">
                          <span className="text-sm text-muted-foreground">Select where this expense applies</span>
                          <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="radio"
                                name="expense-unit"
                                checked={field.value === "common"}
                                onChange={() => field.onChange("common")}
                                className="rounded border-gray-300"
                                data-testid="radio-common-area"
                              />
                              <span className="text-sm">Common Area</span>
                            </label>
                            {selectedPropertyUnits.map((unit) => (
                              <label key={unit.id} className="flex items-center space-x-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name="expense-unit"
                                  checked={field.value === unit.id}
                                  onChange={() => field.onChange(unit.id)}
                                  className="rounded border-gray-300"
                                  data-testid={`radio-unit-${unit.id}`}
                                />
                                <span className="text-sm">{unit.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Property Selection (when in date range mode) */}
        {isDateRange && (
          <div className="space-y-4">
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
                      form.setValue("unitId", "");
                    }} 
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-expense-property">
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
            
            {/* Unit Selection for date range mode */}
            {selectedPropertyId && selectedPropertyId !== "none" && isBuilding && selectedPropertyUnits.length > 0 && (
              <FormField
                control={form.control}
                name="unitId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Area/Unit</FormLabel>
                    <div className="flex flex-col space-y-2 p-3 border rounded-md bg-muted/30">
                      <span className="text-sm text-muted-foreground">Select where this expense applies</span>
                      <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            name="expense-unit-range"
                            checked={field.value === "common"}
                            onChange={() => field.onChange("common")}
                            className="rounded border-gray-300"
                            data-testid="radio-common-area-range"
                          />
                          <span className="text-sm">Common Area</span>
                        </label>
                        {selectedPropertyUnits.map((unit) => (
                          <label key={unit.id} className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              name="expense-unit-range"
                              checked={field.value === unit.id}
                              onChange={() => field.onChange(unit.id)}
                              className="rounded border-gray-300"
                              data-testid={`radio-unit-range-${unit.id}`}
                            />
                            <span className="text-sm">{unit.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        )}

        {/* Expense Scope Selection */}
        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
          <FormField
            control={form.control}
            name="scope"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expense Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-expense-scope">
                      <SelectValue placeholder="Select expense type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="property">Property Expense</SelectItem>
                    <SelectItem value="operational">Operational/Entity Expense</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          
          {form.watch("scope") === "operational" && (
            <FormField
              control={form.control}
              name="entityId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Entity</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-expense-entity">
                        <SelectValue placeholder="Select entity" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {entities.map((entity) => (
                        <SelectItem key={entity.id} value={entity.id}>
                          {entity.name}
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

        {/* Split Expense Options */}
        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
          <FormField
            control={form.control}
            name="isSplitExpense"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel className="flex items-center space-x-2">
                    <Plus className="h-4 w-4" />
                    <span>Split Expense</span>
                  </FormLabel>
                  <div className="text-sm text-muted-foreground">
                    Break down this expense into multiple categories (e.g., split utility bill between repairs and utilities)
                  </div>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      field.onChange(checked);
                      if (checked && currentLineItems.length === 0) {
                        // Add first line item when enabling split
                        form.setValue("lineItems", [{
                          description: "",
                          amount: 0,
                          category: "",
                          taxDeductible: true
                        }]);
                      }
                    }}
                    data-testid="switch-split-expense"
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {isSplitExpense && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Line Items</h4>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const items = [...currentLineItems, {
                      description: "",
                      amount: 0,
                      category: "",
                      taxDeductible: true
                    }];
                    form.setValue("lineItems", items);
                  }}
                  data-testid="button-add-line-item"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Line Item
                </Button>
              </div>
              
              {currentLineItems.map((_, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 p-3 border rounded-lg bg-background">
                  <div className="col-span-4">
                    <FormField
                      control={form.control}
                      name={`lineItems.${index}.description`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input 
                              placeholder="Description" 
                              value={field.value || ""}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              name={field.name}
                              data-testid={`input-line-item-description-${index}`} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <FormField
                      control={form.control}
                      name={`lineItems.${index}.amount`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input 
                              type="text" 
                              inputMode="decimal"
                              placeholder="0.00" 
                              value={field.value ? formatNumberWithCommas(field.value) : ""}
                              onChange={(e) => {
                                const rawValue = removeCommas(e.target.value);
                                field.onChange(rawValue === "" ? 0 : parseFloat(rawValue) || 0);
                              }}
                              onBlur={field.onBlur}
                              name={field.name}
                              data-testid={`input-line-item-amount-${index}`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="col-span-4">
                    <FormField
                      control={form.control}
                      name={`lineItems.${index}.category`}
                      render={({ field }) => (
                        <FormItem>
                          <Select onValueChange={(value) => {
                            field.onChange(value);
                            const cat = expenseCategories.find(c => c.value === value);
                            form.setValue(`lineItems.${index}.taxDeductible`, cat?.taxDeductible ?? true);
                          }} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid={`select-line-item-category-${index}`}>
                                <SelectValue placeholder="Category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {expenseCategories.map((category) => (
                                <SelectItem key={category.value} value={category.value}>
                                  <div className="flex items-center justify-between w-full">
                                    <span>{category.label}</span>
                                    <div className="ml-2">
                                      {category.taxDeductible ? (
                                        <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 border border-green-300 rounded-full text-xs font-medium">
                                          ✓ Tax Deductible
                                        </div>
                                      ) : (
                                        <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 border border-orange-300 rounded-full text-xs font-medium">
                                          ⚠ Not Deductible
                                        </div>
                                      )}
                                    </div>
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
                  
                  <div className="col-span-2 flex items-center justify-end">
                    {currentLineItems.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const items = currentLineItems.filter((_, i) => i !== index);
                          form.setValue("lineItems", items);
                        }}
                        data-testid={`button-remove-line-item-${index}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              
              {currentLineItems.length > 0 && (
                <div className="text-sm text-muted-foreground p-2 bg-muted rounded">
                  Total: ${currentLineItems.reduce((sum, item) => sum + (item.amount || 0), 0).toFixed(2)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recurring Expense Options */}
        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
          <FormField
            control={form.control}
            name="isRecurring"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel className="flex items-center space-x-2">
                    <Repeat className="h-4 w-4" />
                    <span>Recurring Expense</span>
                  </FormLabel>
                  <div className="text-sm text-muted-foreground">
                    Set up automatic recurring expenses (e.g., monthly insurance, quarterly taxes)
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
                          <SelectItem value="days">Days</SelectItem>
                          <SelectItem value="weeks">Weeks</SelectItem>
                          <SelectItem value="months">Months</SelectItem>
                          <SelectItem value="years">Years</SelectItem>
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

        {/* Receipt Upload */}
        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
          <div className="flex items-center space-x-2">
            <Receipt className="h-4 w-4" />
            <h4 className="text-sm font-medium">Receipt (Optional)</h4>
          </div>
          
          <div className="space-y-3">
            <FormField
              control={form.control}
              name="receiptUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Receipt URL</FormLabel>
                  <div className="flex space-x-2">
                    <FormControl>
                      <Input 
                        placeholder="https://example.com/receipt.pdf or upload a file below" 
                        {...field}
                        value={uploadedReceiptUrl || field.value || ""}
                        onChange={(e) => {
                          field.onChange(e.target.value);
                          if (e.target.value !== uploadedReceiptUrl) {
                            setUploadedReceiptUrl(null);
                          }
                        }}
                        data-testid="input-expense-receipt" 
                      />
                    </FormControl>
                    {(uploadedReceiptUrl || field.value) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          field.onChange("");
                          setUploadedReceiptUrl(null);
                        }}
                        data-testid="button-clear-receipt"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">or</span>
              <ObjectUploader
                maxNumberOfFiles={1}
                maxFileSize={10485760} // 10MB
                onGetUploadParameters={async () => {
                  const response = await fetch("/api/objects/upload", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                  });
                  if (!response.ok) throw new Error("Failed to get upload URL");
                  const { uploadURL } = await response.json();
                  return { method: "PUT" as const, url: uploadURL };
                }}
                onComplete={(result) => {
                  if (result.successful && result.successful.length > 0) {
                    const uploadedFile = result.successful[0];
                    const receiptUrl = uploadedFile.uploadURL || "";
                    setUploadedReceiptUrl(receiptUrl);
                    form.setValue("receiptUrl", receiptUrl);
                  }
                }}
                buttonClassName="variant-outline"
              >
                <Receipt className="h-4 w-4 mr-2" />
                Upload Receipt
              </ObjectUploader>
            </div>
            
            {uploadedReceiptUrl && (
              <div className="text-sm text-green-600 flex items-center space-x-1">
                <Receipt className="h-3 w-3" />
                <span>Receipt uploaded successfully</span>
              </div>
            )}
          </div>
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Additional notes about this expense..."
                  value={field.value || ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  data-testid="textarea-expense-notes" 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-expense">
            Cancel
          </Button>
          <Button 
            type="button" 
            disabled={isLoading} 
            onClick={() => {
              const formData = form.getValues();
              const submissionData = {
                ...formData,
                receiptUrl: uploadedReceiptUrl || undefined,
              };
              onSubmit(submissionData);
            }}
            data-testid="button-submit-expense"
          >
            {isLoading ? "Logging..." : (expense ? "Update Expense" : "Log Expense")}
          </Button>
        </div>
        </form>
      </Form>
    </div>
  );
}
