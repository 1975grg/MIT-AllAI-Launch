import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus, Building2, Home } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { OwnershipEntity } from "@shared/schema";

const ownershipSchema = z.object({
  entityId: z.string().min(1, "Entity is required"),
  percent: z.number().min(0.01).max(100),
});

const unitSchema = z.object({
  label: z.string().min(1, "Unit label is required"),
  bedrooms: z.number().min(0).optional(),
  bathrooms: z.number().min(0).optional(),
  sqft: z.number().min(0).optional(),
  rentAmount: z.string().optional(),
  deposit: z.string().optional(),
  notes: z.string().optional(),
});

const propertySchema = z.object({
  name: z.string().min(1, "Property name is required"),
  type: z.enum(["Single Family", "Duplex", "Triplex", "Fourplex", "Apartment", "Condo", "Townhome", "Commercial"]),
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
}).refine(
  (data) => {
    // If createDefaultUnit is true, we need either defaultUnit or units
    if (data.createDefaultUnit) {
      if (data.hasMultipleUnits && (!data.units || data.units.length === 0)) {
        return false;
      }
      if (!data.hasMultipleUnits && !data.defaultUnit) {
        return false;
      }
    }
    return true;
  },
  {
    message: "Unit information is required when creating units",
    path: ["units"],
  }
);

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
      createDefaultUnit: true,
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
        });
      }
    }
    
    // Update the form with new units
    form.setValue("units", newUnits);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-property-type">
                    <SelectValue placeholder="Select property type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Single Family">Single Family</SelectItem>
                  <SelectItem value="Duplex">Duplex</SelectItem>
                  <SelectItem value="Triplex">Triplex</SelectItem>
                  <SelectItem value="Fourplex">Fourplex</SelectItem>
                  <SelectItem value="Apartment">Apartment</SelectItem>
                  <SelectItem value="Condo">Condo</SelectItem>
                  <SelectItem value="Townhome">Townhome</SelectItem>
                  <SelectItem value="Commercial">Commercial</SelectItem>
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
              Configure the units for this property. Most properties start with one main unit.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
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
                      Recommended for single-family homes and simple properties
                    </p>
                  </div>
                </FormItem>
              )}
            />
            
            {/* Multiple Units Option */}
            {form.watch("createDefaultUnit") && (
              <FormField
                control={form.control}
                name="hasMultipleUnits"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          if (checked) {
                            // Initialize with current number of units or default to 2
                            const currentCount = form.getValues("numberOfUnits") || 2;
                            form.setValue("numberOfUnits", currentCount);
                            generateUnits(currentCount);
                          } else {
                            // Reset to single unit
                            form.setValue("numberOfUnits", 1);
                            form.setValue("units", []);
                          }
                        }}
                        data-testid="checkbox-multiple-units"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        This property has multiple units
                      </FormLabel>
                      <p className="text-sm text-muted-foreground">
                        For duplexes, apartments, or buildings with separate units
                      </p>
                    </div>
                  </FormItem>
                )}
              />
            )}
            
            {/* Number of Units Selection */}
            {form.watch("createDefaultUnit") && form.watch("hasMultipleUnits") && (
              <FormField
                control={form.control}
                name="numberOfUnits"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of Units</FormLabel>
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
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            {/* Single Unit Setup */}
            {form.watch("createDefaultUnit") && !form.watch("hasMultipleUnits") && (
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
            
            {/* Multiple Units Setup */}
            {form.watch("createDefaultUnit") && form.watch("hasMultipleUnits") && (
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
          <Button type="submit" disabled={isLoading} data-testid="button-submit-property">
            {isLoading ? (initialData ? "Updating..." : "Creating...") : (initialData ? "Update Property" : "Create Property")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
