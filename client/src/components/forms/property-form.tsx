import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus, Building2, Home, Wrench, DollarSign, TrendingDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { OwnershipEntity } from "@shared/schema";
import { formatNumberWithCommas, removeCommas } from "@/lib/formatters";

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
  // Building equipment fields (optional)
  buildingHvacBrand: z.string().optional(),
  buildingHvacModel: z.string().optional(),
  buildingHvacYear: z.number().optional(),
  buildingHvacLifetime: z.number().optional(),
  buildingHvacReminder: z.boolean().optional(),
  buildingHvacLocation: z.string().optional(),
  buildingWaterBrand: z.string().optional(),
  buildingWaterModel: z.string().optional(),
  buildingWaterYear: z.number().optional(),
  buildingWaterLifetime: z.number().optional(),
  buildingWaterReminder: z.boolean().optional(),
  buildingWaterLocation: z.string().optional(),
  buildingWaterShutoff: z.string().optional(),
  buildingElectricalPanel: z.string().optional(),
  buildingEquipmentNotes: z.string().optional(),
  // Property value fields (optional)
  propertyValue: z.preprocess((val) => val === null || val === undefined || val === "" ? undefined : Number(val), z.number().min(0).optional()),
  autoAppreciation: z.boolean().default(false),
  appreciationRate: z.preprocess((val) => val === null || val === undefined || val === "" ? undefined : Number(val), z.number().min(0).max(50).optional()),
  // Primary mortgage tracking fields (optional)
  monthlyMortgage: z.preprocess((val) => val === null || val === undefined || val === "" ? undefined : Number(val), z.number().min(0).optional()),
  interestRate: z.preprocess((val) => val === null || val === undefined || val === "" ? undefined : Number(val), z.number().min(0).max(20).optional()),
  purchasePrice: z.preprocess((val) => val === null || val === undefined || val === "" ? undefined : Number(val), z.number().min(0).optional()),
  downPayment: z.preprocess((val) => val === null || val === undefined || val === "" ? undefined : Number(val), z.number().min(0).optional()),
  acquisitionDate: z.date().optional(),
  mortgageStartDate: z.date().optional(),
  // Secondary mortgage tracking fields (optional)
  monthlyMortgage2: z.preprocess((val) => val === null || val === undefined || val === "" ? undefined : Number(val), z.number().min(0).optional()),
  interestRate2: z.preprocess((val) => val === null || val === undefined || val === "" ? undefined : Number(val), z.number().min(0).max(20).optional()),
  mortgageStartDate2: z.date().optional(),
  // Property sale fields (optional)
  saleDate: z.date().optional(),
  salePrice: z.preprocess((val) => val === null || val === undefined || val === "" ? undefined : Number(val), z.number().min(0).optional()),
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
      // Basic defaults first
      name: "",
      street: "",
      city: "",
      state: "",
      zipCode: "",
      propertyValue: undefined,
      autoAppreciation: false,
      appreciationRate: undefined,
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
      // Then override with actual data
      ...initialData,
    },
  });

  // Effect to reset form when initialData changes (for editing)
  React.useEffect(() => {
    if (initialData) {  // Reset for any initialData (removed ID check)
      console.log("🏠 Property form initialData:", initialData);
      console.log("💰 purchasePrice in initialData:", initialData.purchasePrice);
      console.log("🏡 propertyValue in initialData:", initialData.propertyValue);
      console.log("🗓️ mortgageStartDate field:", initialData.mortgageStartDate);
      
      const resetData = {
        ...initialData,
        propertyValue: initialData.propertyValue ? Number(initialData.propertyValue) : undefined,
        monthlyMortgage: initialData.monthlyMortgage ? Number(initialData.monthlyMortgage) : undefined,
        interestRate: initialData.interestRate ? Number(initialData.interestRate) : undefined,
        purchasePrice: initialData.purchasePrice ? Number(initialData.purchasePrice) : undefined,
        downPayment: initialData.downPayment ? Number(initialData.downPayment) : undefined,
        salePrice: initialData.salePrice ? Number(initialData.salePrice) : undefined,
        acquisitionDate: initialData.acquisitionDate ? new Date(initialData.acquisitionDate) : undefined,
        saleDate: initialData.saleDate ? new Date(initialData.saleDate) : undefined,
        mortgageStartDate: initialData.mortgageStartDate ? new Date(initialData.mortgageStartDate) : undefined,
        mortgageStartDate2: initialData.mortgageStartDate2 ? new Date(initialData.mortgageStartDate2) : undefined,
      };
      
      form.reset(resetData);
      
      // Force set numeric values specifically
      if (initialData.propertyValue) {
        form.setValue('propertyValue', Number(initialData.propertyValue));
      }
      if (initialData.monthlyMortgage) {
        form.setValue('monthlyMortgage', Number(initialData.monthlyMortgage));
      }
      if (initialData.interestRate) {
        form.setValue('interestRate', Number(initialData.interestRate));
      }
      if (initialData.purchasePrice) {
        form.setValue('purchasePrice', Number(initialData.purchasePrice));
      }
      if (initialData.downPayment) {
        form.setValue('downPayment', Number(initialData.downPayment));
      }
      if (initialData.salePrice) {
        form.setValue('salePrice', Number(initialData.salePrice));
      }
      if (initialData.acquisitionDate) {
        form.setValue('acquisitionDate', new Date(initialData.acquisitionDate));
      }
      if (initialData.saleDate) {
        form.setValue('saleDate', new Date(initialData.saleDate));
      }
      if (initialData.mortgageStartDate) {
        form.setValue('mortgageStartDate', new Date(initialData.mortgageStartDate));
      }
      if (initialData.mortgageStartDate2) {
        form.setValue('mortgageStartDate2', new Date(initialData.mortgageStartDate2));
      }
    }
  }, [initialData, form]);

  // Auto-fill purchase price with property value when property value changes
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'propertyValue' && value.propertyValue && value.propertyValue !== 0) {
        // Auto-fill if purchase price is empty, zero, null, or not yet set
        const currentPurchasePrice = value.purchasePrice;
        if (!currentPurchasePrice || currentPurchasePrice === 0 || currentPurchasePrice === undefined || currentPurchasePrice === null || currentPurchasePrice === "") {
          console.log("🏠 Auto-filling purchase price from property value change:", value.propertyValue);
          form.setValue('purchasePrice', Number(value.propertyValue));
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // Auto-fill purchase price on initial load if editing existing property
  useEffect(() => {
    if (initialData && initialData.propertyValue) {
      const currentPurchasePrice = initialData.purchasePrice;
      console.log("🔍 Checking auto-fill conditions:");
      console.log("  - propertyValue:", initialData.propertyValue);
      console.log("  - currentPurchasePrice:", currentPurchasePrice);
      console.log("  - typeof currentPurchasePrice:", typeof currentPurchasePrice);
      console.log("  - form field value:", form.getValues('purchasePrice'));
      
      // Auto-fill if purchase price is missing, zero, empty string, null, or invalid
      if (!currentPurchasePrice || currentPurchasePrice === 0 || currentPurchasePrice === "" || currentPurchasePrice === null || currentPurchasePrice === 1) {
        console.log("🏠 Auto-filling purchase price from property value:", initialData.propertyValue);
        form.setValue('purchasePrice', Number(initialData.propertyValue));
      } else {
        console.log("⏹️ Not auto-filling because purchasePrice already has value:", currentPurchasePrice);
        // Force set the correct value if it exists but form field is wrong
        if (currentPurchasePrice && currentPurchasePrice !== 1) {
          form.setValue('purchasePrice', Number(currentPurchasePrice));
        }
      }
    }
  }, [initialData, form]);

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
    // Convert numeric values to strings for decimal database fields
    const processedData = {
      ...data,
      propertyValue: data.propertyValue !== undefined ? String(data.propertyValue) : undefined,
      appreciationRate: data.appreciationRate !== undefined ? String(data.appreciationRate) : undefined,
      monthlyMortgage: data.monthlyMortgage !== undefined ? String(data.monthlyMortgage) : undefined,
      interestRate: data.interestRate !== undefined ? String(data.interestRate) : undefined,
      purchasePrice: data.purchasePrice !== undefined ? String(data.purchasePrice) : undefined,
      downPayment: data.downPayment !== undefined ? String(data.downPayment) : undefined,
      salePrice: data.salePrice !== undefined ? String(data.salePrice) : undefined,
    };
    onSubmit(processedData);
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
                    placeholder="1,200" 
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

        {/* Building Equipment Section - Show only for buildings */}
        {(form.watch("type") === "Residential Building" || form.watch("type") === "Commercial Building") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Wrench className="h-5 w-5" />
                <span>Building Equipment (Optional)</span>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Track central building systems and equipment for maintenance and warranty management.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Central HVAC System */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="text-sm font-medium text-muted-foreground">Central HVAC/Air System</h5>
                  {(form.watch("buildingHvacBrand") || form.watch("buildingHvacModel") || form.watch("buildingHvacYear")) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => {
                        form.setValue("buildingHvacBrand", "");
                        form.setValue("buildingHvacModel", "");
                        form.setValue("buildingHvacYear", undefined);
                        form.setValue("buildingHvacLifetime", undefined);
                        form.setValue("buildingHvacReminder", false);
                        form.setValue("buildingHvacLocation", "");
                      }}
                      data-testid="button-clear-building-hvac"
                    >
                      Clear Central HVAC
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3">
                    <FormField
                      control={form.control}
                      name="buildingHvacBrand"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Brand</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Carrier" 
                              {...field}
                              data-testid="input-building-hvac-brand"
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
                      name="buildingHvacModel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Model</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="24ABC6" 
                              {...field}
                              data-testid="input-building-hvac-model"
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
                      name="buildingHvacYear"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Year</FormLabel>
                          <FormControl>
                            <Input 
                              type="number"
                              placeholder="2020" 
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                              data-testid="input-building-hvac-year"
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
                      name="buildingHvacLifetime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Lifetime (yrs)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number"
                              placeholder="15" 
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                              data-testid="input-building-hvac-lifetime"
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
                      name="buildingHvacLocation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Location</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Roof, basement, etc." 
                              {...field}
                              data-testid="input-building-hvac-location"
                              className="h-8 text-sm"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  {form.watch("buildingHvacLifetime") && (
                    <div className="col-span-12">
                      <FormField
                        control={form.control}
                        name="buildingHvacReminder"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="checkbox-building-hvac-reminder"
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-xs">
                                📅 1yr reminder
                              </FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Central Water System */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="text-sm font-medium text-muted-foreground">Central Water/Boiler System</h5>
                  {(form.watch("buildingWaterBrand") || form.watch("buildingWaterModel") || form.watch("buildingWaterYear")) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => {
                        form.setValue("buildingWaterBrand", "");
                        form.setValue("buildingWaterModel", "");
                        form.setValue("buildingWaterYear", undefined);
                        form.setValue("buildingWaterLifetime", undefined);
                        form.setValue("buildingWaterReminder", false);
                        form.setValue("buildingWaterLocation", "");
                      }}
                      data-testid="button-clear-building-water"
                    >
                      Clear Central Water
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3">
                    <FormField
                      control={form.control}
                      name="buildingWaterBrand"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Brand</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Rheem" 
                              {...field}
                              data-testid="input-building-water-brand"
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
                      name="buildingWaterModel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Model</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="G12-40" 
                              {...field}
                              data-testid="input-building-water-model"
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
                      name="buildingWaterYear"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Year</FormLabel>
                          <FormControl>
                            <Input 
                              type="number"
                              placeholder="2020" 
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                              data-testid="input-building-water-year"
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
                      name="buildingWaterLifetime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Lifetime (yrs)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number"
                              placeholder="12" 
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                              data-testid="input-building-water-lifetime"
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
                      name="buildingWaterLocation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Location</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Basement, utility room, etc." 
                              {...field}
                              data-testid="input-building-water-location"
                              className="h-8 text-sm"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  {form.watch("buildingWaterLifetime") && (
                    <div className="col-span-12">
                      <FormField
                        control={form.control}
                        name="buildingWaterReminder"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="checkbox-building-water-reminder"
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-xs">
                                📅 1yr reminder
                              </FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Other Building Systems */}
              <div className="space-y-3">
                <h5 className="text-sm font-medium text-muted-foreground">Other Building Systems</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="buildingWaterShutoff"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Water Shut-off Location</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Street side, basement, etc." 
                            {...field}
                            data-testid="input-building-water-shutoff"
                            className="h-8 text-sm"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="buildingElectricalPanel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Electrical Panel Location</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Basement, utility room, etc." 
                            {...field}
                            data-testid="input-building-electrical-panel"
                            className="h-8 text-sm"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Building Equipment Notes */}
              <FormField
                control={form.control}
                name="buildingEquipmentNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Building Equipment Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Additional building systems, elevator details, security systems, roof info, etc." 
                        {...field}
                        data-testid="textarea-building-equipment-notes"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        )}

        {/* Property Ownership Section */}
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
                                <Badge variant={entity.type === "LLC" ? "default" : "secondary"} className="text-xs">
                                  {entity.type}
                                </Badge>
                                <span>{entity.name}</span>
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
                    <FormItem className="w-32">
                      <FormLabel>%</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
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

        {/* Property Value Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5" />
              <span>Property Value (Optional)</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Set the total value for {form.watch("type")?.includes("Building") ? "the entire building" : "this property"}. This helps calculate portfolio value by ownership percentage.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="propertyValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {form.watch("type")?.includes("Building") ? "Total Building Value" : "Property Value"}
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        type="text"
                        placeholder="500,000"
                        className="pl-9"
                        key={`property-value-${(initialData as any)?.id || 'new'}`}
                        value={field.value ? Number(field.value).toLocaleString() : (initialData?.propertyValue ? Number(initialData.propertyValue).toLocaleString() : "")}
                        onChange={(e) => {
                          const rawValue = e.target.value.replace(/,/g, '');
                          const numericValue = rawValue === '' ? undefined : parseFloat(rawValue);
                          field.onChange(numericValue);
                        }}
                        onBlur={(e) => {
                          const rawValue = e.target.value.replace(/,/g, '');
                          const numericValue = rawValue === '' ? undefined : parseFloat(rawValue);
                          if (!isNaN(numericValue || 0)) {
                            field.onChange(numericValue);
                            if (numericValue) {
                              e.target.value = numericValue.toLocaleString();
                            }
                          }
                        }}
                        data-testid="input-property-value"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Auto Appreciation Section */}
            <FormField
              control={form.control}
              name="autoAppreciation"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="checkbox-auto-appreciation"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      Enable Automatic Yearly Appreciation
                    </FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Automatically increase property value by a set percentage each year starting one year from today.
                    </p>
                  </div>
                </FormItem>
              )}
            />

            {/* Appreciation Rate Input */}
            {form.watch("autoAppreciation") && (
              <FormField
                control={form.control}
                name="appreciationRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Annual Appreciation Rate</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="number"
                          min="0"
                          max="50"
                          step="0.5"
                          placeholder="3.5"
                          className="pr-8"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                          data-testid="input-appreciation-rate"
                        />
                        <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground text-sm">%</span>
                      </div>
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Property value will increase by this percentage annually. Enter in 0.5% increments (e.g., 3.5 for 3.5%).
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>

        {/* Mortgage & Financing Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Building2 className="h-5 w-5" />
              <span>Mortgage & Financing (Optional)</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Track mortgage details for cash-on-cash analysis and automatic recurring expenses. Interest allocation can be adjusted at year-end for tax reporting.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Monthly Mortgage */}
            <FormField
              control={form.control}
              name="monthlyMortgage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monthly Mortgage Payment</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="2,500"
                        className="pl-9"
                        key={`monthly-mortgage-${(initialData as any)?.id || 'new'}`}
                        value={field.value ? Number(field.value).toLocaleString() : ""}
                        onChange={(e) => {
                          const rawValue = e.target.value.replace(/,/g, '');
                          const numericValue = rawValue === '' ? undefined : parseFloat(rawValue);
                          field.onChange(numericValue);
                        }}
                        onBlur={(e) => {
                          const rawValue = e.target.value.replace(/,/g, '');
                          const numericValue = rawValue === '' ? undefined : parseFloat(rawValue);
                          if (!isNaN(numericValue || 0)) {
                            field.onChange(numericValue);
                            if (numericValue) {
                              e.target.value = numericValue.toLocaleString();
                            }
                          }
                        }}
                        data-testid="input-monthly-mortgage"
                      />
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Total monthly payment (principal + interest + PMI). Will auto-create recurring expense.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Interest Rate */}
            <FormField
              control={form.control}
              name="interestRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Interest Rate</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="5.25"
                        className="pr-8"
                        key={`interest-rate-${(initialData as any)?.id || 'new'}`}
                        value={field.value !== undefined ? String(field.value) : ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Allow empty, digits, and decimal point
                          if (value === '' || /^\d*\.?\d*$/.test(value)) {
                            // Just store the raw value to allow typing decimals
                            field.onChange(value === '' ? undefined : value);
                          }
                        }}
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (value && value !== '.') {
                            const numericValue = parseFloat(value);
                            if (!isNaN(numericValue)) {
                              field.onChange(numericValue);
                            }
                          } else {
                            field.onChange(undefined);
                          }
                        }}
                        data-testid="input-interest-rate"
                      />
                      <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground text-sm">%</span>
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Annual interest rate for calculations and year-end tax adjustments.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Mortgage Payment Start Date */}
            <FormField
              control={form.control}
              name="mortgageStartDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Payment Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={field.value ? 
                        (field.value instanceof Date ? 
                          field.value.toISOString().split('T')[0] : 
                          new Date(field.value).toISOString().split('T')[0]
                        ) : ''}
                      onChange={(e) => {
                        const newDate = e.target.value ? new Date(e.target.value + 'T00:00:00.000Z') : undefined;
                        console.log('🗓️ Mortgage start date changed:', { 
                          inputValue: e.target.value, 
                          newDate,
                          previousValue: field.value 
                        });
                        field.onChange(newDate);
                      }}
                      data-testid="input-mortgage-start-date"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    When should recurring mortgage expenses start being generated? Defaults to next month if left empty.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="my-6 border-t border-muted-foreground/20" />
            <div className="text-center">
              <p className="text-sm text-muted-foreground font-medium">Secondary Mortgage (Optional)</p>
              <p className="text-xs text-muted-foreground">Add a second mortgage if your property has multiple loans</p>
            </div>

            {/* Secondary Monthly Mortgage */}
            <FormField
              control={form.control}
              name="monthlyMortgage2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Secondary Monthly Payment</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="1,000"
                        className="pl-9"
                        key={`monthly-mortgage-2-${(initialData as any)?.id || 'new'}`}
                        value={field.value ? Number(field.value).toLocaleString() : ""}
                        onChange={(e) => {
                          const rawValue = e.target.value.replace(/,/g, '');
                          const numericValue = rawValue === '' ? undefined : parseFloat(rawValue);
                          field.onChange(numericValue);
                        }}
                        onBlur={(e) => {
                          const rawValue = e.target.value.replace(/,/g, '');
                          const numericValue = rawValue === '' ? undefined : parseFloat(rawValue);
                          if (!isNaN(numericValue || 0)) {
                            field.onChange(numericValue);
                            if (numericValue) {
                              e.target.value = numericValue.toLocaleString();
                            }
                          }
                        }}
                        data-testid="input-monthly-mortgage-2"
                      />
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Second mortgage monthly payment (HELOC, bridge loan, etc.). Will auto-create recurring expense.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Secondary Interest Rate */}
            <FormField
              control={form.control}
              name="interestRate2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Secondary Interest Rate</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="6.75"
                        className="pr-8"
                        key={`interest-rate-2-${(initialData as any)?.id || 'new'}`}
                        value={field.value !== undefined ? String(field.value) : ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Allow empty, digits, and decimal point
                          if (value === '' || /^\d*\.?\d*$/.test(value)) {
                            // Just store the raw value to allow typing decimals
                            field.onChange(value === '' ? undefined : value);
                          }
                        }}
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (value && value !== '.') {
                            const numericValue = parseFloat(value);
                            if (!isNaN(numericValue)) {
                              field.onChange(numericValue);
                            }
                          } else {
                            field.onChange(undefined);
                          }
                        }}
                        data-testid="input-interest-rate-2"
                      />
                      <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground text-sm">%</span>
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Annual interest rate for second mortgage calculations and tax adjustments.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Secondary Mortgage Start Date */}
            <FormField
              control={form.control}
              name="mortgageStartDate2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Secondary First Payment Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      value={field.value ? 
                        (field.value instanceof Date ? 
                          field.value.toISOString().split('T')[0] : 
                          new Date(field.value).toISOString().split('T')[0]
                        ) : ''}
                      onChange={(e) => {
                        const newDate = e.target.value ? new Date(e.target.value) : undefined;
                        console.log('🗓️ Secondary mortgage start date changed:', { 
                          inputValue: e.target.value, 
                          newDate,
                          previousValue: field.value 
                        });
                        field.onChange(newDate);
                      }}
                      data-testid="input-mortgage-start-date-2"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    When should secondary mortgage expenses start? Defaults to next month if left empty.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="my-6 border-t border-muted-foreground/20" />

            {/* Purchase Price */}
            <FormField
              control={form.control}
              name="purchasePrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Purchase Price</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="500,000"
                        className="pl-9"
                        key={`purchase-price-${(initialData as any)?.id || 'new'}`}
                        value={field.value && field.value !== 0 && !isNaN(Number(field.value)) ? Number(field.value).toLocaleString() : ""}
                        onChange={(e) => {
                          const rawValue = e.target.value.replace(/,/g, '');
                          const numericValue = rawValue === '' ? undefined : parseFloat(rawValue);
                          field.onChange(numericValue);
                        }}
                        onBlur={(e) => {
                          const rawValue = e.target.value.replace(/,/g, '');
                          const numericValue = rawValue === '' ? undefined : parseFloat(rawValue);
                          if (!isNaN(numericValue || 0)) {
                            field.onChange(numericValue);
                            if (numericValue) {
                              e.target.value = numericValue.toLocaleString();
                            }
                          }
                        }}
                        data-testid="input-purchase-price"
                      />
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Total property purchase price. Auto-fills with property value above. <strong>Edit this if you purchased at a different price than current value.</strong>
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Down Payment */}
            <FormField
              control={form.control}
              name="downPayment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Down Payment & Cash Invested</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="100,000"
                        className="pl-9"
                        key={`down-payment-${(initialData as any)?.id || 'new'}`}
                        value={field.value ? Number(field.value).toLocaleString() : ""}
                        onChange={(e) => {
                          const rawValue = e.target.value.replace(/,/g, '');
                          const numericValue = rawValue === '' ? undefined : parseFloat(rawValue);
                          field.onChange(numericValue);
                        }}
                        onBlur={(e) => {
                          const rawValue = e.target.value.replace(/,/g, '');
                          const numericValue = rawValue === '' ? undefined : parseFloat(rawValue);
                          if (!isNaN(numericValue || 0)) {
                            field.onChange(numericValue);
                            if (numericValue) {
                              e.target.value = numericValue.toLocaleString();
                            }
                          }
                        }}
                        data-testid="input-down-payment"
                      />
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Total cash invested (down payment + closing costs). Used for cash-on-cash return calculations.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Acquisition Date */}
            <FormField
              control={form.control}
              name="acquisitionDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Acquisition Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                      onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                      data-testid="input-acquisition-date"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Date property was acquired. Used for partial-year calculations and mortgage payment start.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Property Sale Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingDown className="h-5 w-5" />
              <span>Property Sale</span>
              <Badge variant="outline">Optional</Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Record property sale information to end mortgage calculations and track gains/losses
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Sale Date */}
            <FormField
              control={form.control}
              name="saleDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sale Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                      onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                      data-testid="input-sale-date"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Date property was sold. Mortgage calculations will end on this date.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Sale Price */}
            <FormField
              control={form.control}
              name="salePrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sale Price</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="750,000"
                        className="pl-9"
                        key={`sale-price-${(initialData as any)?.id || 'new'}`}
                        value={field.value ? Number(field.value).toLocaleString() : (initialData?.salePrice ? Number(initialData.salePrice).toLocaleString() : "")}
                        onChange={(e) => {
                          const rawValue = e.target.value.replace(/,/g, '');
                          const numericValue = rawValue === '' ? undefined : parseFloat(rawValue);
                          field.onChange(numericValue);
                        }}
                        onBlur={(e) => {
                          const rawValue = e.target.value.replace(/,/g, '');
                          const numericValue = rawValue === '' ? undefined : parseFloat(rawValue);
                          if (!isNaN(numericValue || 0)) {
                            field.onChange(numericValue);
                            if (numericValue) {
                              e.target.value = numericValue.toLocaleString();
                            }
                          }
                        }}
                        data-testid="input-sale-price"
                      />
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Gross sale price. Used for calculating capital gains/losses.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

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
            
            {/* Single Unit Setup - Show for single-unit properties when createDefaultUnit is checked OR when editing existing unit */}
            {(form.watch("createDefaultUnit") || (initialData as any)?.hasExistingUnit) && form.watch("type") !== "Residential Building" && form.watch("type") !== "Commercial Building" && (
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
                            placeholder="1,200" 
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
                            type="text" 
                            inputMode="decimal"
                            placeholder="2,500" 
                            value={field.value ? formatNumberWithCommas(field.value) : ""}
                            onChange={(e) => {
                              const rawValue = removeCommas(e.target.value);
                              field.onChange(rawValue || "");
                            }}
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
                            type="text" 
                            inputMode="decimal"
                            placeholder="2,500" 
                            value={field.value ? formatNumberWithCommas(field.value) : ""}
                            onChange={(e) => {
                              const rawValue = removeCommas(e.target.value);
                              field.onChange(rawValue || "");
                            }}
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
                                placeholder="1,200" 
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
                                type="text" 
                                inputMode="decimal"
                                placeholder="2,500" 
                                value={field.value ? formatNumberWithCommas(field.value) : ""}
                                onChange={(e) => {
                                  const rawValue = removeCommas(e.target.value);
                                  field.onChange(rawValue || "");
                                }}
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
                                type="text" 
                                inputMode="decimal"
                                placeholder="2,500" 
                                value={field.value ? formatNumberWithCommas(field.value) : ""}
                                onChange={(e) => {
                                  const rawValue = removeCommas(e.target.value);
                                  field.onChange(rawValue || "");
                                }}
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

                    {/* Equipment Tracking Section for this Unit */}
                    <div className="mt-6">
                      <h4 className="font-medium text-sm mb-3 flex items-center space-x-2">
                        <span>Unit Equipment Tracking (Optional)</span>
                      </h4>
                      <p className="text-xs text-muted-foreground mb-4">
                        Track this unit's appliances and systems for maintenance reminders.
                      </p>
                      
                      {/* HVAC - Compact Layout */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-medium text-muted-foreground">HVAC System</h5>
                          {(form.watch(`units.${index}.hvacBrand`) || form.watch(`units.${index}.hvacModel`) || form.watch(`units.${index}.hvacYear`)) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => {
                                form.setValue(`units.${index}.hvacBrand`, "");
                                form.setValue(`units.${index}.hvacModel`, "");
                                form.setValue(`units.${index}.hvacYear`, undefined);
                                form.setValue(`units.${index}.hvacLifetime`, undefined);
                                form.setValue(`units.${index}.hvacReminder`, false);
                              }}
                              data-testid={`button-clear-hvac-${index}`}
                            >
                              Clear HVAC
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-12 gap-2 items-end">
                          <div className="col-span-3">
                            <FormField
                              control={form.control}
                              name={`units.${index}.hvacBrand`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Brand</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="Carrier" 
                                      {...field}
                                      data-testid={`input-unit-hvac-brand-${index}`}
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
                              name={`units.${index}.hvacModel`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Model</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="24ABC6" 
                                      {...field}
                                      data-testid={`input-unit-hvac-model-${index}`}
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
                              name={`units.${index}.hvacYear`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Year</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number"
                                      placeholder="2020" 
                                      {...field}
                                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                      data-testid={`input-unit-hvac-year-${index}`}
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
                              name={`units.${index}.hvacLifetime`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Lifetime (yrs)</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number"
                                      placeholder="15" 
                                      {...field}
                                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                      data-testid={`input-unit-hvac-lifetime-${index}`}
                                      className="h-8 text-sm"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                          
                          {form.watch(`units.${index}.hvacLifetime`) && (
                            <div className="col-span-2">
                              <FormField
                                control={form.control}
                                name={`units.${index}.hvacReminder`}
                                render={({ field }) => (
                                  <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        data-testid={`checkbox-unit-hvac-reminder-${index}`}
                                      />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                      <FormLabel className="text-xs">
                                        📅 1yr reminder
                                      </FormLabel>
                                    </div>
                                  </FormItem>
                                )}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Water Heater */}
                      <div className="space-y-3 mt-4">
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-medium text-muted-foreground">Water Heater</h5>
                          {(form.watch(`units.${index}.waterHeaterBrand`) || form.watch(`units.${index}.waterHeaterModel`) || form.watch(`units.${index}.waterHeaterYear`)) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => {
                                form.setValue(`units.${index}.waterHeaterBrand`, "");
                                form.setValue(`units.${index}.waterHeaterModel`, "");
                                form.setValue(`units.${index}.waterHeaterYear`, undefined);
                                form.setValue(`units.${index}.waterHeaterLifetime`, undefined);
                                form.setValue(`units.${index}.waterHeaterReminder`, false);
                              }}
                              data-testid={`button-clear-water-heater-${index}`}
                            >
                              Clear Water Heater
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-12 gap-2 items-end">
                          <div className="col-span-3">
                            <FormField
                              control={form.control}
                              name={`units.${index}.waterHeaterBrand`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Brand</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="Rheem" 
                                      {...field}
                                      data-testid={`input-unit-water-heater-brand-${index}`}
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
                              name={`units.${index}.waterHeaterModel`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Model</FormLabel>
                                  <FormControl>
                                    <Input 
                                      placeholder="G12-40" 
                                      {...field}
                                      data-testid={`input-unit-water-heater-model-${index}`}
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
                              name={`units.${index}.waterHeaterYear`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Year</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number"
                                      placeholder="2020" 
                                      {...field}
                                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                      data-testid={`input-unit-water-heater-year-${index}`}
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
                              name={`units.${index}.waterHeaterLifetime`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Lifetime (yrs)</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number"
                                      placeholder="12" 
                                      {...field}
                                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                      data-testid={`input-unit-water-heater-lifetime-${index}`}
                                      className="h-8 text-sm"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                          
                          {form.watch(`units.${index}.waterHeaterLifetime`) && (
                            <div className="col-span-2">
                              <FormField
                                control={form.control}
                                name={`units.${index}.waterHeaterReminder`}
                                render={({ field }) => (
                                  <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        data-testid={`checkbox-unit-water-heater-reminder-${index}`}
                                      />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                      <FormLabel className="text-xs">
                                        📅 1yr reminder
                                      </FormLabel>
                                    </div>
                                  </FormItem>
                                )}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <FormField
                        control={form.control}
                        name={`units.${index}.applianceNotes`}
                        render={({ field }) => (
                          <FormItem className="mt-4">
                            <FormLabel>Equipment Notes</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Additional equipment details for this unit..." 
                                {...field}
                                data-testid={`textarea-unit-appliance-notes-${index}`}
                              />
                            </FormControl>
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
