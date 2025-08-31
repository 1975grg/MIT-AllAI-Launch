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
import { Plus, Minus, Building2 } from "lucide-react";
import type { OwnershipEntity } from "@shared/schema";

const ownershipSchema = z.object({
  entityId: z.string().min(1, "Entity is required"),
  percent: z.number().min(0.01).max(100),
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
  isLoading: boolean;
  initialData?: Partial<z.infer<typeof propertySchema>>;
}

export default function PropertyForm({ entities, onSubmit, isLoading, initialData }: PropertyFormProps) {
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
      ownerships: [{ entityId: "", percent: 100 }],
      ...initialData,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "ownerships",
  });

  const calculateTotalPercent = () => {
    const ownerships = form.getValues("ownerships");
    return ownerships.reduce((sum, ownership) => sum + (ownership.percent || 0), 0);
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
          <Button type="button" variant="outline" data-testid="button-cancel-property">
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
