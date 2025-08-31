import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus, Building2, Home } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { OwnershipEntity } from "@shared/schema";

const ownershipSchema = z.object({
  entityId: z.string().min(1, "Entity is required"),
  percent: z.number().min(0.01).max(100),
});

const applianceSchema = z.object({
  name: z.string().optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  year: z.number().min(1900).max(new Date().getFullYear() + 1).optional(),
  expectedLifetime: z.number().min(1).max(50).optional(), // years
  alertBeforeExpiry: z.number().min(1).max(60).optional(), // months
  notes: z.string().optional(),
});

const unitSchema = z.object({
  label: z.string().optional(), // Make label optional for equipment-only updates
  bedrooms: z.preprocess((val) => val === null || val === undefined || val === "" ? undefined : Number(val), z.number().optional()),
  bathrooms: z.preprocess((val) => val === null || val === undefined || val === "" ? undefined : Number(val), z.number().optional()),
  sqft: z.preprocess((val) => val === null || val === undefined || val === "" ? undefined : Number(val), z.number().optional()),
  rentAmount: z.preprocess((val) => val === null || val === undefined ? undefined : String(val), z.string().optional()),
  deposit: z.preprocess((val) => val === null || val === undefined ? undefined : String(val), z.string().optional()),
  notes: z.string().optional(),
  // Equipment tracking (all optional)
  hvacBrand: z.string().optional(),
  hvacModel: z.string().optional(),
  hvacYear: z.preprocess((val) => val === null || val === undefined || val === "" ? undefined : Number(val), z.number().min(1900).max(new Date().getFullYear() + 1).optional()),
  hvacLifetime: z.preprocess((val) => val === null || val === undefined || val === "" ? undefined : Number(val), z.number().min(1).max(50).optional()),
  hvacReminder: z.boolean().optional(),
  waterHeaterBrand: z.string().optional(),
  waterHeaterModel: z.string().optional(),
  waterHeaterYear: z.preprocess((val) => val === null || val === undefined || val === "" ? undefined : Number(val), z.number().min(1900).max(new Date().getFullYear() + 1).optional()),
  waterHeaterLifetime: z.preprocess((val) => val === null || val === undefined || val === "" ? undefined : Number(val), z.number().min(1).max(50).optional()),
  waterHeaterReminder: z.boolean().optional(),
  applianceNotes: z.string().optional(),
  // Custom appliances
  appliances: z.array(applianceSchema).optional().default([]),
});

const propertySchema = z.object({
  name: z.string().min(1, "Property name is required"),
  type: z.enum(["Single Family", "Condo", "Townhome", "Residential Building", "Commercial Unit", "Commercial Building"]),
  street: z.string().min(1, "Street address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(2, "State is required"),
  zipCode: z.string().min(5, "ZIP code is required"),
  yearBuilt: z.number().optional(),
  sqft: z.number().optional(),
  hoaName: z.string().optional(),
  hoaContact: z.string().optional(),
  notes: z.string().optional(),
  createDefaultUnit: z.boolean().default(true),
  hasMultipleUnits: z.boolean().default(false),
  numberOfUnits: z.number().min(1).max(50).default(1),
  defaultUnit: unitSchema.optional(),
  units: z.array(unitSchema).optional(),
  ownerships: z.array(ownershipSchema).min(1, "At least one owner is required").refine(
    (ownerships) => {
      const total = ownerships.reduce((sum, o) => sum + o.percent, 0);
      return Math.abs(total - 100) < 0.01; // Allow for small floating point differences
    },
    "Ownership percentages must add up to 100%"
  ),
});

interface PropertyFormProps {
  entities: OwnershipEntity[];
  onSubmit: (data: z.infer<typeof propertySchema>) => void;
  onCancel?: () => void;
  isLoading: boolean;
  initialData?: Partial<z.infer<typeof propertySchema>>;
}

export default function PropertyForm({ entities, onSubmit, onCancel, isLoading, initialData }: PropertyFormProps) {
  const [showCreateEntity, setShowCreateEntity] = useState(false);
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityType, setNewEntityType] = useState<"Individual" | "LLC" | "Partnership" | "Corporation">("Individual");

  const form = useForm<z.infer<typeof propertySchema>>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      name: "",
      street: "",
      city: "",
      state: "",
      zipCode: "",
      createDefaultUnit: false,
      hasMultipleUnits: false,
      numberOfUnits: 1,
      defaultUnit: {
        label: "Main Unit",
        bedrooms: undefined,
        bathrooms: undefined,
        sqft: undefined,
        rentAmount: "",
        deposit: "",
        notes: "",
        hvacBrand: "",
        hvacModel: "",
        hvacYear: undefined,
        hvacLifetime: undefined,
        hvacReminder: false,
        waterHeaterBrand: "",
        waterHeaterModel: "",
        waterHeaterYear: undefined,
        waterHeaterLifetime: undefined,
        waterHeaterReminder: false,
        applianceNotes: "",
        appliances: [],
      },
      units: [],
      ownerships: [{ entityId: "", percent: 100 }],
      ...initialData,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "ownerships",
  });

  const { fields: unitFields, append: appendUnit, remove: removeUnit } = useFieldArray({
    control: form.control,
    name: "units",
  });

  const { fields: applianceFields, append: appendAppliance, remove: removeAppliance } = useFieldArray({
    control: form.control,
    name: "defaultUnit.appliances",
  });

  const calculateTotalPercent = () => {
    const ownerships = form.getValues("ownerships");
    return ownerships.reduce((sum, ownership) => sum + (ownership.percent || 0), 0);
  };

  const generateUnits = (numberOfUnits: number) => {
    const currentUnits = form.getValues("units") || [];
    const newUnits = [];
    
    for (let i = 0; i < numberOfUnits; i++) {
      if (i < currentUnits.length) {
        // Keep existing unit data
        newUnits.push(currentUnits[i]);
      } else {
        // Create new unit with default values
        newUnits.push({
          label: `Unit ${i + 1}`,
          bedrooms: undefined,
          bathrooms: undefined,
          sqft: undefined,
          rentAmount: "",
          deposit: "",
          notes: "",
          hvacBrand: "",
          hvacModel: "",
          hvacYear: undefined,
          hvacLifetime: undefined,
          hvacReminder: false,
          waterHeaterBrand: "",
          waterHeaterModel: "",
          waterHeaterYear: undefined,
          waterHeaterLifetime: undefined,
          waterHeaterReminder: false,
          applianceNotes: "",
          appliances: [],
        });
      }
    }
    
    // Update the form with new units  
    form.setValue("units", newUnits);
  };

  const handleSubmit = (data: any) => {
    console.log("🎯 Form submission data:", {
      type: data.type,
      hasUnits: !!data.units,
      unitsLength: data.units?.length,
      hasDefaultUnit: !!data.defaultUnit,
      createDefaultUnit: data.createDefaultUnit,
      hasMultipleUnits: data.hasMultipleUnits,
      numberOfUnits: data.numberOfUnits
    });
    onSubmit(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Property Name</FormLabel>
              <FormControl>
                <Input 
                  placeholder="e.g., Sunset Apartments" 
                  value={field.value || ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  data-testid="input-property-name" 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Property Type</FormLabel>
              <Select onValueChange={(value) => {
                field.onChange(value);
                // Automatically enable multiple units for building types
                if (value === "Residential Building" || value === "Commercial Building") {
                  form.setValue("createDefaultUnit", true); // Buildings always have units
                  form.setValue("hasMultipleUnits", true);
                  // Initialize with 2 units by default
                  const currentCount = form.getValues("numberOfUnits") || 2;
                  form.setValue("numberOfUnits", Math.max(currentCount, 2));
                  generateUnits(Math.max(currentCount, 2));
                } else {
                  // For single-unit properties, reset to default state
                  form.setValue("createDefaultUnit", false);
                  form.setValue("hasMultipleUnits", false);
                  form.setValue("numberOfUnits", 1);
                  form.setValue("units", []);
                }
              }} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-property-type">
                    <SelectValue placeholder="Select property type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Single Family">Single Family</SelectItem>
                  <SelectItem value="Condo">Condo</SelectItem>
                  <SelectItem value="Townhome">Townhome</SelectItem>
                  <SelectItem value="Residential Building">Residential Building (multiple units)</SelectItem>
                  <SelectItem value="Commercial Unit">Commercial Unit</SelectItem>
                  <SelectItem value="Commercial Building">Commercial Building (multiple units)</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="street"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Street Address</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="123 Main Street" 
                    value={field.value || ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    data-testid="input-property-street" 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="city"
            render={({ field }) => (
              <FormItem>
                <FormLabel>City</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="City" 
                    value={field.value || ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    data-testid="input-property-city" 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="state"
            render={({ field }) => (
              <FormItem>
                <FormLabel>State</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="CA" 
                    value={field.value || ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    data-testid="input-property-state" 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="zipCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>ZIP Code</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="12345" 
                    value={field.value || ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    data-testid="input-property-zip" 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="yearBuilt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Year Built</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    placeholder="2020" 
                    {...field}
                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                    data-testid="input-property-year"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="sqft"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Square Feet</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    placeholder="1200" 
                    {...field}
                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                    data-testid="input-property-sqft"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="hoaName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>HOA Name (Optional)</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Sunset HOA" 
                    value={field.value || ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    data-testid="input-property-hoa-name" 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="hoaContact"
            render={({ field }) => (
              <FormItem>
                <FormLabel>HOA Contact (Optional)</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="(555) 123-4567" 
                    value={field.value || ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    data-testid="input-property-hoa-contact" 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Additional notes about this property..." 
                  value={field.value || ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  data-testid="textarea-property-notes" 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Unit Setup Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Home className="h-5 w-5" />
              <span>Unit Setup</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Units help you manage tenants, rent collection, and maintenance more effectively.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Only show checkbox for single-unit properties */}
            {form.watch("type") !== "Residential Building" && form.watch("type") !== "Commercial Building" && (
              <FormField
                control={form.control}
                name="createDefaultUnit"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-create-default-unit"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Create a default unit for this property
                      </FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Recommended - helps track tenant details, rent amounts, and equipment maintenance
                      </p>
                    </div>
                  </FormItem>
                )}
              />
            )}

            {/* For buildings, show direct unit setup message */}
            {(form.watch("type") === "Residential Building" || form.watch("type") === "Commercial Building") && (
              <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <h4 className="font-medium text-green-900 dark:text-green-100">
                    Building Units Required
                  </h4>
                </div>
                <p className="text-sm text-green-800 dark:text-green-200 mt-1">
                  This building will have multiple units. Configure each unit below with its own details, rent amounts, and equipment.
                </p>
              </div>
            )}
            
            {/* Recommendation when units not set up - only for single-unit properties */}
            {!form.watch("createDefaultUnit") && form.watch("type") !== "Residential Building" && form.watch("type") !== "Commercial Building" && (
              <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <Home className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-blue-900 dark:text-blue-100">
                      Consider Setting Up Units Later
                    </h4>
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      Units help track tenants, rent, equipment maintenance.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {/* Number of Units Selection - Show directly for buildings */}
            {(form.watch("type") === "Residential Building" || form.watch("type") === "Commercial Building") && (
              <FormField
                control={form.control}
                name="numberOfUnits"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of Units in Building</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="2"
                        max="50"
                        placeholder="2"
                        {...field}
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value) : 2;
                          field.onChange(value);
                          if (value >= 2 && value <= 50) {
                            generateUnits(value);
                          }
                        }}
                        data-testid="input-number-of-units"
                      />
                    </FormControl>
                    <p className="text-sm text-muted-foreground">
                      Enter the total number of units in this building (2-50)
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            {/* Single Unit Setup - Show for single-unit properties when createDefaultUnit is checked */}
            {form.watch("createDefaultUnit") && form.watch("type") !== "Residential Building" && form.watch("type") !== "Commercial Building" && (
              <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="defaultUnit.label"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit Label</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Main Unit" 
                            {...field}
                            data-testid="input-unit-label" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="defaultUnit.bedrooms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bedrooms</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min="0"
                            placeholder="3" 
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            data-testid="input-unit-bedrooms"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="defaultUnit.bathrooms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bathrooms</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min="0"
                            step="0.5"
                            placeholder="2" 
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                            data-testid="input-unit-bathrooms"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="defaultUnit.sqft"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Square Feet</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min="0"
                            placeholder="1200" 
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            data-testid="input-unit-sqft"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="defaultUnit.rentAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected Rent (Optional)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min="0"
                            step="0.01"
                            placeholder="2500" 
                            {...field}
                            data-testid="input-unit-rent"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="defaultUnit.deposit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected Deposit (Optional)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min="0"
                            step="0.01"
                            placeholder="2500" 
                            {...field}
                            data-testid="input-unit-deposit"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Equipment Tracking Section */}
                <div className="mt-6">
                  <h4 className="font-medium text-sm mb-3 flex items-center space-x-2">
                    <span>Equipment Tracking (Optional)</span>
                  </h4>
                  <p className="text-xs text-muted-foreground mb-4">
                    Track appliances and systems for maintenance reminders and warranty management.
                  </p>
                  
                  {/* HVAC - Compact Layout */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-medium text-muted-foreground">HVAC System</h5>
                      {(form.watch("defaultUnit.hvacBrand") || form.watch("defaultUnit.hvacModel") || form.watch("defaultUnit.hvacYear")) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            form.setValue("defaultUnit.hvacBrand", "");
                            form.setValue("defaultUnit.hvacModel", "");
                            form.setValue("defaultUnit.hvacYear", undefined);
                            form.setValue("defaultUnit.hvacLifetime", undefined);
                            form.setValue("defaultUnit.hvacReminder", false);
                          }}
                          data-testid="button-clear-hvac"
                        >
                          Clear HVAC
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-3">
                        <FormField
                          control={form.control}
                          name="defaultUnit.hvacBrand"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Brand</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Carrier" 
                                  {...field}
                                  data-testid="input-unit-hvac-brand"
                                  className="h-8 text-sm"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="col-span-3">
                        <FormField
                          control={form.control}
                          name="defaultUnit.hvacModel"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Model</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="25HPA436A003" 
                                  {...field}
                                  data-testid="input-unit-hvac-model"
                                  className="h-8 text-sm"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="col-span-2">
                        <FormField
                          control={form.control}
                          name="defaultUnit.hvacYear"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Year</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number"
                                  min="1900"
                                  max={new Date().getFullYear() + 1}
                                  placeholder="2020" 
                                  {...field}
                                  onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                  data-testid="input-unit-hvac-year"
                                  className="h-8 text-sm"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="col-span-2">
                        <FormField
                          control={form.control}
                          name="defaultUnit.hvacLifetime"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Life (Yrs)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number"
                                  min="5"
                                  max="30"
                                  placeholder="15" 
                                  {...field}
                                  onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                  data-testid="input-unit-hvac-lifetime"
                                  className="h-8 text-sm"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="col-span-2 flex items-center">
                        {form.watch('defaultUnit.hvacYear') && form.watch('defaultUnit.hvacLifetime') && (
                          <FormField
                            control={form.control}
                            name="defaultUnit.hvacReminder"
                            render={({ field }) => (
                              <FormItem className="flex items-center space-x-2">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value === true}
                                    onCheckedChange={field.onChange}
                                    data-testid="checkbox-hvac-reminder"
                                  />
                                </FormControl>
                                <FormLabel className="text-xs font-normal cursor-pointer">
                                  📅 1yr reminder
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Water Heater - Compact Layout */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-medium text-muted-foreground">Water Heater</h5>
                      {(form.watch("defaultUnit.waterHeaterBrand") || form.watch("defaultUnit.waterHeaterModel") || form.watch("defaultUnit.waterHeaterYear")) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            form.setValue("defaultUnit.waterHeaterBrand", "");
                            form.setValue("defaultUnit.waterHeaterModel", "");
                            form.setValue("defaultUnit.waterHeaterYear", undefined);
                            form.setValue("defaultUnit.waterHeaterLifetime", undefined);
                            form.setValue("defaultUnit.waterHeaterReminder", false);
                          }}
                          data-testid="button-clear-water-heater"
                        >
                          Clear Water Heater
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-3">
                        <FormField
                          control={form.control}
                          name="defaultUnit.waterHeaterBrand"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Brand</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Rheem" 
                                  {...field}
                                  data-testid="input-unit-water-heater-brand"
                                  className="h-8 text-sm"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="col-span-3">
                        <FormField
                          control={form.control}
                          name="defaultUnit.waterHeaterModel"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Model</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="XE50M06ST45U1" 
                                  {...field}
                                  data-testid="input-unit-water-heater-model"
                                  className="h-8 text-sm"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="col-span-2">
                        <FormField
                          control={form.control}
                          name="defaultUnit.waterHeaterYear"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Year</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number"
                                  min="1900"
                                  max={new Date().getFullYear() + 1}
                                  placeholder="2018" 
                                  {...field}
                                  onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                  data-testid="input-unit-water-heater-year"
                                  className="h-8 text-sm"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="col-span-2">
                        <FormField
                          control={form.control}
                          name="defaultUnit.waterHeaterLifetime"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Life (Yrs)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number"
                                  min="5"
                                  max="25"
                                  placeholder="12" 
                                  {...field}
                                  onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                  data-testid="input-unit-water-heater-lifetime"
                                  className="h-8 text-sm"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="col-span-2 flex items-center">
                        {form.watch('defaultUnit.waterHeaterYear') && form.watch('defaultUnit.waterHeaterLifetime') && (
                          <FormField
                            control={form.control}
                            name="defaultUnit.waterHeaterReminder"
                            render={({ field }) => (
                              <FormItem className="flex items-center space-x-2">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value === true}
                                    onCheckedChange={field.onChange}
                                    data-testid="checkbox-water-heater-reminder"
                                  />
                                </FormControl>
                                <FormLabel className="text-xs font-normal cursor-pointer">
                                  📅 1yr reminder
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="defaultUnit.applianceNotes"
                    render={({ field }) => (
                      <FormItem className="mt-4">
                        <FormLabel>Equipment Notes</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Additional equipment details, roof info, appliances, etc." 
                            {...field}
                            data-testid="textarea-unit-appliance-notes"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  {/* Custom Appliances Section */}
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-sm">Custom Appliances (Optional)</h4>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => appendAppliance({ 
                          name: "", 
                          manufacturer: "", 
                          model: "", 
                          year: undefined,
                          expectedLifetime: undefined,
                          alertBeforeExpiry: undefined,
                          notes: ""
                        })}
                        data-testid="button-add-appliance"
                      >
                        + Add Appliance
                      </Button>
                    </div>
                    
                    {applianceFields.map((appliance, index) => (
                      <div key={appliance.id} className="p-4 border rounded-lg bg-muted/10 space-y-4">
                        <div className="flex items-center justify-between">
                          <h5 className="font-medium text-sm">Appliance {index + 1}</h5>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeAppliance(index)}
                            data-testid={`button-remove-appliance-${index}`}
                          >
                            Remove
                          </Button>
                        </div>
                        
                        {/* Single line layout for appliance details */}
                        <div className="grid grid-cols-12 gap-2 items-end">
                          <div className="col-span-3">
                            <FormField
                              control={form.control}
                              name={`defaultUnit.appliances.${index}.name`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Name</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="Refrigerator" 
                                      {...field}
                                      data-testid={`input-appliance-name-${index}`}
                                      className="h-8 text-sm"
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
                              name={`defaultUnit.appliances.${index}.manufacturer`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Brand</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="GE" 
                                      {...field}
                                      data-testid={`input-appliance-manufacturer-${index}`}
                                      className="h-8 text-sm"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                          
                          <div className="col-span-2">
                            <FormField
                              control={form.control}
                              name={`defaultUnit.appliances.${index}.model`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Model</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="ABC123" 
                                      {...field}
                                      data-testid={`input-appliance-model-${index}`}
                                      className="h-8 text-sm"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                          
                          <div className="col-span-2">
                            <FormField
                              control={form.control}
                              name={`defaultUnit.appliances.${index}.year`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Year</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number"
                                      min="1900"
                                      max={new Date().getFullYear() + 1}
                                      placeholder="2020" 
                                      {...field}
                                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                      data-testid={`input-appliance-year-${index}`}
                                      className="h-8 text-sm"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                          
                          <div className="col-span-2">
                            <FormField
                              control={form.control}
                              name={`defaultUnit.appliances.${index}.expectedLifetime`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Life (Yrs)</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number"
                                      min="1"
                                      max="50"
                                      placeholder="15" 
                                      {...field}
                                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                      data-testid={`input-appliance-lifetime-${index}`}
                                      className="h-8 text-sm"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                          
                          <div className="col-span-1 flex items-center">
                            {form.watch(`defaultUnit.appliances.${index}.year`) && 
                             form.watch(`defaultUnit.appliances.${index}.expectedLifetime`) && (
                              <FormField
                                control={form.control}
                                name={`defaultUnit.appliances.${index}.alertBeforeExpiry`}
                                render={({ field }) => (
                                  <FormItem className="flex items-center space-x-2">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value === 12}
                                        onCheckedChange={(checked) => {
                                          field.onChange(checked ? 12 : undefined);
                                        }}
                                        data-testid={`checkbox-appliance-reminder-${index}`}
                                      />
                                    </FormControl>
                                    <FormLabel className="text-xs font-normal cursor-pointer">
                                      📅 1yr reminder
                                    </FormLabel>
                                  </FormItem>
                                )}
                              />
                            )}
                          </div>
                        </div>
                        
                        <FormField
                          control={form.control}
                          name={`defaultUnit.appliances.${index}.notes`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Notes</FormLabel>
                              <FormControl>
                                <Textarea 
                                  placeholder="Additional notes about this appliance..." 
                                  {...field}
                                  data-testid={`textarea-appliance-notes-${index}`}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    ))}
                    
                    {applianceFields.length === 0 && (
                      <p className="text-sm text-muted-foreground italic">
                        No custom appliances added yet. Click "Add Appliance" to track specific equipment.
                      </p>
                    )}
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="defaultUnit.notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Notes about this unit..." 
                          {...field}
                          data-testid="textarea-unit-notes" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
            
            {/* Multiple Units Setup - Show for buildings */}
            {(form.watch("type") === "Residential Building" || form.watch("type") === "Commercial Building") && form.watch("numberOfUnits") >= 2 && (
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Configure Units</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Set up each unit individually. You can customize details for each one.
                </p>
                
                {unitFields.map((unit, index) => (
                  <div key={unit.id} className="p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-center justify-between mb-4">
                      <h5 className="font-medium text-sm">Unit {index + 1}</h5>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`units.${index}.label`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Unit Label</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder={`Unit ${index + 1}`} 
                                {...field}
                                data-testid={`input-unit-label-${index}`}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name={`units.${index}.bedrooms`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Bedrooms</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                min="0"
                                placeholder="3" 
                                {...field}
                                onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                data-testid={`input-unit-bedrooms-${index}`}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name={`units.${index}.bathrooms`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Bathrooms</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                min="0"
                                step="0.5"
                                placeholder="2" 
                                {...field}
                                onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                                data-testid={`input-unit-bathrooms-${index}`}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name={`units.${index}.sqft`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Square Feet</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                min="0"
                                placeholder="1200" 
                                {...field}
                                onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                data-testid={`input-unit-sqft-${index}`}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name={`units.${index}.rentAmount`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Expected Rent</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                min="0"
                                step="0.01"
                                placeholder="2500" 
                                {...field}
                                data-testid={`input-unit-rent-${index}`}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name={`units.${index}.deposit`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Expected Deposit</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                min="0"
                                step="0.01"
                                placeholder="2500" 
                                {...field}
                                data-testid={`input-unit-deposit-${index}`}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="mt-4">
                      <FormField
                        control={form.control}
                        name={`units.${index}.notes`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Unit Notes (Optional)</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Notes about this unit..." 
                                {...field}
                                data-testid={`textarea-unit-notes-${index}`}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ownership Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Building2 className="h-5 w-5" />
              <span>Property Ownership</span>
              <Badge variant="outline">
                Total: {calculateTotalPercent().toFixed(1)}%
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-end space-x-2 p-3 border rounded-lg">
                <FormField
                  control={form.control}
                  name={`ownerships.${index}.entityId`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Owner {index + 1}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid={`select-owner-${index}`}>
                            <SelectValue placeholder="Select ownership entity" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {entities.map((entity) => (
                            <SelectItem key={entity.id} value={entity.id}>
                              <div className="flex items-center space-x-2">
                                <span>{entity.name}</span>
                                <Badge variant="outline" className="text-xs">
                                  {entity.type}
                                </Badge>
                              </div>
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
                  name={`ownerships.${index}.percent`}
                  render={({ field }) => (
                    <FormItem className="w-24">
                      <FormLabel>%</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0.01"
                          max="100"
                          step="0.01"
                          placeholder="50"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : 0)}
                          data-testid={`input-ownership-percent-${index}`}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => remove(index)}
                    className="h-10"
                    data-testid={`button-remove-owner-${index}`}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            
            <Button
              type="button"
              variant="outline"
              onClick={() => append({ entityId: "", percent: 0 })}
              className="w-full"
              data-testid="button-add-owner"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Co-Owner
            </Button>
            
            {calculateTotalPercent() !== 100 && (
              <p className="text-sm text-destructive">
                Ownership percentages must add up to 100%
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end space-x-2">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel}
            data-testid="button-cancel-property"
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={isLoading} 
            data-testid="button-submit-property"
          >
            {isLoading ? (initialData ? "Updating..." : "Creating...") : (initialData ? "Update Property" : "Create Property")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
