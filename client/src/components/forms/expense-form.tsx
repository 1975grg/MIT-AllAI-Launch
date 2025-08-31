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
import { useState } from "react";
import type { Property } from "@shared/schema";

const lineItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  category: z.string().min(1, "Category is required"),
  taxDeductible: z.boolean().default(true),
});

const expenseSchema = z.object({
  description: z.string().min(1, "Description is required"),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  category: z.string().optional(),
  customCategory: z.string().optional(),
  date: z.date(),
  isDateRange: z.boolean().default(false),
  endDate: z.date().optional(),
  propertyId: z.string().optional(),
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
});

interface ExpenseFormProps {
  properties: Property[];
  onSubmit: (data: z.infer<typeof expenseSchema>) => void;
  isLoading: boolean;
}

export default function ExpenseForm({ properties, onSubmit, isLoading }: ExpenseFormProps) {
  const [uploadedReceiptUrl, setUploadedReceiptUrl] = useState<string | null>(null);
  const form = useForm<z.infer<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      description: "",
      amount: 0,
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
    },
  });

  const expenseCategories = [
    {
      value: "",
      label: "No Category",
      description: "Leave category blank (not tax deductible)",
      taxDeductible: false
    },
    {
      value: "custom",
      label: "Custom Category",
      description: "Enter your own category name (not tax deductible)",
      taxDeductible: false
    },
    {
      value: "Advertising",
      label: "Advertising",
      description: "Costs of marketing the property (online ads, signs, listings)",
      taxDeductible: true
    },
    {
      value: "Auto and Travel",
      label: "Auto and Travel",
      description: "Mileage, transportation, or travel directly related to managing or maintaining the rental",
      taxDeductible: true
    },
    {
      value: "Cleaning and Maintenance",
      label: "Cleaning and Maintenance",
      description: "Routine upkeep, landscaping, pest control, and minor repairs",
      taxDeductible: true
    },
    {
      value: "Commissions",
      label: "Commissions",
      description: "Leasing or property management commissions",
      taxDeductible: true
    },
    {
      value: "Insurance",
      label: "Insurance",
      description: "Property insurance, liability insurance, flood insurance, etc.",
      taxDeductible: true
    },
    {
      value: "Legal and Other Professional Fees",
      label: "Legal and Other Professional Fees",
      description: "Attorney fees, accounting, property management, and consulting",
      taxDeductible: true
    },
    {
      value: "Management Fees",
      label: "Management Fees",
      description: "Paid to property management companies",
      taxDeductible: true
    },
    {
      value: "Mortgage Interest Paid to Banks",
      label: "Mortgage Interest Paid to Banks",
      description: "Interest portion of mortgage payments (not principal)",
      taxDeductible: true
    },
    {
      value: "Other Interest",
      label: "Other Interest",
      description: "Interest on loans used for the rental business besides the mortgage",
      taxDeductible: true
    },
    {
      value: "Repairs",
      label: "Repairs",
      description: "Costs to fix something broken or keep property in working order (not improvements)",
      taxDeductible: true
    },
    {
      value: "Supplies",
      label: "Supplies",
      description: "Items used for rental operations (light bulbs, locks, cleaning supplies)",
      taxDeductible: true
    },
    {
      value: "Taxes",
      label: "Taxes",
      description: "Property taxes, state/local taxes directly tied to the rental",
      taxDeductible: true
    },
    {
      value: "Utilities",
      label: "Utilities",
      description: "Water, electricity, gas, trash collection, etc., if paid by the landlord",
      taxDeductible: true
    },
    {
      value: "Depreciation Expense",
      label: "Depreciation Expense",
      description: "Deduction for wear-and-tear of the building and certain improvements",
      taxDeductible: true
    },
    {
      value: "Other",
      label: "Other",
      description: "Any legitimate rental expense not fitting in the above (e.g., HOA fees, bank fees, safety inspections, software subscriptions)",
      taxDeductible: true
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
    }
  ];

  const selectedCategory = expenseCategories.find(cat => cat.value === form.watch("category"));
  const isRecurring = form.watch("isRecurring");
  const isSplitExpense = form.watch("isSplitExpense");
  const isDateRange = form.watch("isDateRange");
  const currentLineItems = form.watch("lineItems") || [];
  const watchedCategory = form.watch("category");
  const showCustomCategoryInput = watchedCategory === "custom";

  return (
    <div className="max-h-[80vh] overflow-y-auto">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Plumbing repair, Property insurance" {...field} data-testid="input-expense-description" />
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
                    type="number" 
                    step="0.01"
                    placeholder="0.00" 
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
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
                      {...field} 
                      data-testid="input-custom-category"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
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
              <FormField
                control={form.control}
                name="propertyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Property (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-expense-property">
                          <SelectValue placeholder="Select property" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No specific property</SelectItem>
                        {properties.map((property) => (
                          <SelectItem key={property.id} value={property.id}>
                            {property.name}
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
        </div>

        {/* Property Selection (when in date range mode) */}
        {isDateRange && (
          <FormField
            control={form.control}
            name="propertyId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Property (Optional)</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-expense-property">
                      <SelectValue placeholder="Select property" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">No specific property</SelectItem>
                    {properties.map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

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
                            <Input placeholder="Description" {...field} data-testid={`input-line-item-description-${index}`} />
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
                              type="number" 
                              step="0.01"
                              placeholder="0.00" 
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
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
                <Textarea placeholder="Additional notes about this expense..." {...field} data-testid="textarea-expense-notes" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" data-testid="button-cancel-expense">
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading} data-testid="button-submit-expense">
            {isLoading ? "Logging..." : "Log Expense"}
          </Button>
        </div>
        </form>
      </Form>
    </div>
  );
}
