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
import type { Property } from "@shared/schema";

const expenseSchema = z.object({
  description: z.string().min(1, "Description is required"),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  category: z.string().min(1, "Category is required"),
  date: z.date(),
  propertyId: z.string().optional(),
  vendorId: z.string().optional(),
  receiptUrl: z.string().optional(),
  notes: z.string().optional(),
  isRecurring: z.boolean().default(false),
  recurringFrequency: z.enum(["monthly", "quarterly", "biannually", "annually"]).optional(),
  recurringEndDate: z.date().optional(),
  taxDeductible: z.boolean().default(true),
}).refine((data) => {
  if (data.isRecurring && !data.recurringFrequency) {
    return false;
  }
  return true;
}, {
  message: "Recurring frequency is required for recurring expenses",
  path: ["recurringFrequency"],
});

interface ExpenseFormProps {
  properties: Property[];
  onSubmit: (data: z.infer<typeof expenseSchema>) => void;
  isLoading: boolean;
}

export default function ExpenseForm({ properties, onSubmit, isLoading }: ExpenseFormProps) {
  const form = useForm<z.infer<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      description: "",
      amount: 0,
      category: "",
      date: new Date(),
      isRecurring: false,
      taxDeductible: true,
    },
  });

  const expenseCategories = [
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Date</FormLabel>
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
                    <SelectItem value="">No specific property</SelectItem>
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
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="recurringFrequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequency</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-recurring-frequency">
                          <SelectValue placeholder="How often?" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly (Every 3 months)</SelectItem>
                        <SelectItem value="biannually">Bi-annually (Every 6 months)</SelectItem>
                        <SelectItem value="annually">Annually (Every year)</SelectItem>
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
          )}
        </div>

        <FormField
          control={form.control}
          name="receiptUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Receipt URL (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="https://example.com/receipt.pdf" {...field} data-testid="input-expense-receipt" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
  );
}
