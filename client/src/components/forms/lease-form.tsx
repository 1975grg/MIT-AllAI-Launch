import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CalendarIcon, DollarSign, Home, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TenantGroup, Unit, Property, Lease } from "@shared/schema";
import { formatNumberWithCommas, removeCommas } from "@/lib/formatters";

// Lease form schema - will be dynamically created based on property type
const createLeaseFormSchema = (isBuilding: boolean) => z.object({
  unitId: isBuilding ? z.string().min(1, "Unit is required") : z.string().optional(),
  startDate: z.date({ required_error: "Start date is required" }),
  endDate: z.date({ required_error: "End date is required" }),
  rent: z.string().min(1, "Rent amount is required"),
  deposit: z.string().optional(),
  dueDay: z.number().min(1).max(31).default(1),
  lateFeeRuleJson: z.any().optional(),
  status: z.enum(["Active", "Pending", "Expired", "Terminated"]).default("Active"),
  // Renewal and reminder options
  autoRenewEnabled: z.boolean().default(false),
  expirationReminderMonths: z.number().min(1).max(12).default(3),
  renewalReminderEnabled: z.boolean().default(false),
}).refine((data) => {
  return data.endDate > data.startDate;
}, {
  message: "End date must be after start date",
  path: ["endDate"],
});

// Static schema for TypeScript inference
const leaseFormSchema = createLeaseFormSchema(true);

type LeaseFormData = z.infer<typeof leaseFormSchema>;

interface LeaseFormProps {
  tenantGroup: TenantGroup;
  units?: Unit[];
  properties?: Property[];
  existingLease?: Lease;
  isRenewal?: boolean;
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function LeaseForm({
  tenantGroup,
  units = [],
  properties = [],
  existingLease,
  isRenewal = false,
  onSubmit,
  onCancel,
  isLoading = false
}: LeaseFormProps) {
  const [selectedUnit, setSelectedUnit] = useState<Unit | undefined>(
    existingLease ? units.find(u => u.id === existingLease.unitId) : undefined
  );

  // Determine if tenant group's property is a building
  const tenantProperty = properties.find(p => p.id === tenantGroup.propertyId);
  const isPropertyBuilding = tenantProperty && 
    (tenantProperty.type === "Residential Building" || tenantProperty.type === "Commercial Building");

  // Use conditional schema based on property type
  const dynamicSchema = createLeaseFormSchema(isPropertyBuilding || false);

  const form = useForm<LeaseFormData>({
    resolver: zodResolver(dynamicSchema),
    defaultValues: {
      unitId: existingLease?.unitId || "",
      startDate: existingLease?.startDate ? new Date(existingLease.startDate) : new Date(),
      endDate: existingLease?.endDate ? new Date(existingLease.endDate) : new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
      rent: existingLease?.rent || "",
      deposit: existingLease?.deposit || "",
      dueDay: existingLease?.dueDay || 1,
      status: existingLease?.status || "Active",
      // New renewal and reminder options
      autoRenewEnabled: existingLease?.autoRenewEnabled || false,
      expirationReminderMonths: existingLease?.expirationReminderMonths || 3,
      renewalReminderEnabled: existingLease?.renewalReminderEnabled || false,
    },
  });

  const watchedUnitId = form.watch("unitId");

  useEffect(() => {
    if (watchedUnitId) {
      const unit = units.find(u => u.id === watchedUnitId);
      setSelectedUnit(unit);
    }
  }, [watchedUnitId, units]);

  // Update form values when existingLease data loads
  useEffect(() => {
    console.log("🔍 LeaseForm useEffect triggered:", { existingLease, hasUnits: units.length > 0 });
    if (existingLease) {
      console.log("📝 Resetting form with lease data:", {
        rent: existingLease.rent,
        deposit: existingLease.deposit,
        startDate: existingLease.startDate,
        endDate: existingLease.endDate
      });
      form.reset({
        unitId: existingLease.unitId || "",
        startDate: existingLease.startDate ? new Date(existingLease.startDate) : new Date(),
        endDate: existingLease.endDate ? new Date(existingLease.endDate) : new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
        rent: existingLease.rent ? String(existingLease.rent) : "",
        deposit: existingLease.deposit ? String(existingLease.deposit) : "",
        dueDay: existingLease.dueDay || 1,
        status: existingLease.status || "Active",
        autoRenewEnabled: existingLease.autoRenewEnabled || false,
        expirationReminderMonths: existingLease.expirationReminderMonths || 3,
        renewalReminderEnabled: existingLease.renewalReminderEnabled || false,
      });
      
      // Also update the selected unit
      const unit = units.find(u => u.id === existingLease.unitId);
      console.log("🏠 Setting selected unit:", unit?.label);
      setSelectedUnit(unit);
    } else {
      console.log("❌ No existingLease data provided");
    }
  }, [existingLease, units, form]);

  const handleSubmit = (data: LeaseFormData) => {
    // For non-building properties, automatically use the property's default unit
    let unitId = data.unitId;
    if (!unitId && !isPropertyBuilding && availableUnits.length > 0) {
      // For single-family properties, use the first (and only) available unit
      unitId = availableUnits[0].id;
      console.log("🏠 Auto-selecting unit for single-family property:", unitId);
    }

    const submitData = {
      ...data,
      unitId, // Use the resolved unitId
      tenantGroupId: tenantGroup.id,
      rent: parseFloat(data.rent).toFixed(2),
      deposit: data.deposit ? parseFloat(data.deposit).toFixed(2) : undefined,
      // Convert dates to ISO strings for API submission
      startDate: data.startDate.toISOString(),
      endDate: data.endDate.toISOString(),
    };
    onSubmit(submitData);
  };

  const getUnitProperty = (unit: Unit) => {
    return properties.find(p => p.id === unit.propertyId);
  };

  // Filter units to show only those from the same property as tenant group if linked
  const availableUnits = tenantGroup.propertyId 
    ? units.filter(u => u.propertyId === tenantGroup.propertyId)
    : units;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold" data-testid="text-lease-form-title">
            {isRenewal ? "Renew" : existingLease ? "Edit" : "Create"} Lease Agreement
          </h3>
          <p className="text-sm text-muted-foreground">
            {isRenewal ? "Create a renewal" : existingLease ? "Update the" : "Set up a new"} lease for {tenantGroup.name}
          </p>
        </div>

        <Separator />

        {/* Property & Unit Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Home className="h-5 w-5" />
              <span>Property & Unit</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Show property info */}
            {tenantProperty && (
              <div className="mb-4 p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium" data-testid="text-lease-property">
                  Property: {tenantProperty.name || `${tenantProperty.street}, ${tenantProperty.city}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tenantProperty.type} {!isPropertyBuilding && "(Single unit property)"}
                </p>
              </div>
            )}

            {/* Unit selection - only for buildings */}
            {isPropertyBuilding ? (
              <FormField
                control={form.control}
                name="unitId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Unit</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-lease-unit">
                          <SelectValue placeholder="Choose a unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableUnits.map((unit) => {
                          const property = getUnitProperty(unit);
                          return (
                            <SelectItem key={unit.id} value={unit.id}>
                              {property?.street}, {property?.city} {unit.label ? `- ${unit.label}` : ''}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className="text-sm text-muted-foreground">
                No unit selection needed for single-unit properties.
              </div>
            )}
            
            {selectedUnit && (
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium" data-testid="text-selected-unit">
                  Selected: {(() => {
                    const property = getUnitProperty(selectedUnit);
                    return `${property?.street || 'Unknown'}, ${property?.city || 'Unknown'} ${selectedUnit.label ? `- ${selectedUnit.label}` : ''}`;
                  })()}
                </p>
                {selectedUnit.bedrooms && (
                  <p className="text-sm text-muted-foreground">
                    {selectedUnit.bedrooms} bed, {selectedUnit.bathrooms} bath
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lease Terms */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5" />
              <span>Lease Terms</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Start Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`}
                            data-testid="button-lease-start-date"
                          >
                            {field.value ? format(field.value, "PPP") : "Pick a date"}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date("1900-01-01")}
                          initialFocus
                          captionLayout="dropdown-buttons"
                          fromYear={new Date().getFullYear() - 10}
                          toYear={new Date().getFullYear() + 10}
                          classNames={{
                            caption_label: "hidden", // Hide redundant month/year display
                            nav: "hidden" // Hide redundant navigation arrows since we have dropdowns
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                            className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`}
                            data-testid="button-lease-end-date"
                          >
                            {field.value ? format(field.value, "PPP") : "Pick a date"}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date("1900-01-01")}
                          initialFocus
                          captionLayout="dropdown-buttons"
                          fromYear={new Date().getFullYear() - 10}
                          toYear={new Date().getFullYear() + 10}
                          classNames={{
                            caption_label: "hidden", // Hide redundant month/year display
                            nav: "hidden" // Hide redundant navigation arrows since we have dropdowns
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="rent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monthly Rent</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={field.value ? formatNumberWithCommas(field.value) : ""}
                        onChange={(e) => {
                          const rawValue = removeCommas(e.target.value);
                          field.onChange(rawValue || "");
                        }}
                        onBlur={field.onBlur}
                        name={field.name}
                        data-testid="input-lease-rent"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="deposit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Security Deposit</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={field.value ? formatNumberWithCommas(field.value) : ""}
                        onChange={(e) => {
                          const rawValue = removeCommas(e.target.value);
                          field.onChange(rawValue || "");
                        }}
                        onBlur={field.onBlur}
                        name={field.name}
                        data-testid="input-lease-deposit"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dueDay"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rent Due Day</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min="1"
                        max="31"
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        value={field.value || 1}
                        data-testid="input-lease-due-day"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lease Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-lease-status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Expired">Expired</SelectItem>
                      <SelectItem value="Terminated">Terminated</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Renewal & Reminder Options */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <RefreshCw className="h-5 w-5" />
              <span>Renewal & Reminder Options</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Configure automatic renewal settings and lease expiration reminders.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Auto-Renewal Option */}
            <FormField
              control={form.control}
              name="autoRenewEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-auto-renew"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      Enable automatic lease renewals (Optional)
                    </FormLabel>
                    <p className="text-sm text-muted-foreground">
                      When enabled, system will automatically create renewal leases when current lease expires. 
                      Useful for month-to-month or automatic renewals with rent increases.
                    </p>
                  </div>
                </FormItem>
              )}
            />

            {/* Lease Expiration Reminder */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Lease Expiration Reminder</span>
              </div>
              <FormField
                control={form.control}
                name="expirationReminderMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Remind me this many months before lease expires</FormLabel>
                    <FormControl>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))} 
                        value={field.value?.toString()}
                      >
                        <SelectTrigger data-testid="select-expiration-reminder">
                          <SelectValue placeholder="Select reminder timing" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 month before</SelectItem>
                          <SelectItem value="2">2 months before</SelectItem>
                          <SelectItem value="3">3 months before</SelectItem>
                          <SelectItem value="4">4 months before</SelectItem>
                          <SelectItem value="6">6 months before</SelectItem>
                          <SelectItem value="12">12 months before</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                    <p className="text-sm text-muted-foreground">
                      You'll get a reminder notification when the lease is approaching expiration.
                    </p>
                  </FormItem>
                )}
              />
            </div>

            {/* Renewal Reminder */}
            <FormField
              control={form.control}
              name="renewalReminderEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-renewal-reminder"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      Send renewal notification to tenant
                    </FormLabel>
                    <p className="text-sm text-muted-foreground">
                      When lease renewal terms change (like rent increases), notify the tenant 1 month before.
                      Helps ensure transparent communication about lease changes.
                    </p>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex justify-end space-x-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
            data-testid="button-cancel-lease"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isLoading}
            data-testid="button-save-lease"
          >
            {isLoading ? "Saving..." : isRenewal ? "Create Renewal" : existingLease ? "Update Lease" : "Create Lease"}
          </Button>
        </div>
      </form>
    </Form>
  );
}