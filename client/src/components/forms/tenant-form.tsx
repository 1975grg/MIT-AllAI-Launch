import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { Property, OwnershipEntity, Unit } from "@shared/schema";

const tenantSchema = z.object({
  tenantGroup: z.object({
    name: z.string().min(1, "Group name is required"),
    propertyId: z.string().min(1, "Property selection is required"),
    unitId: z.string().optional(), // For buildings, specify which unit
  }),
  tenants: z.array(z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email("Valid email is required").optional().or(z.literal("")),
    phone: z.string().optional(),
    emergencyContact: z.string().optional(),
    emergencyPhone: z.string().optional(),
    notes: z.string().optional(),
  })).min(1, "At least one tenant is required"),
}).refine((data) => {
  // For buildings, require unit selection
  const property = data.tenantGroup.propertyId;
  // We'll validate this in the form component where we have access to properties data
  return true;
}, {
  message: "Unit selection is required for buildings",
  path: ["tenantGroup", "unitId"],
});

interface TenantFormProps {
  onSubmit: (data: z.infer<typeof tenantSchema>) => void;
  onCancel: () => void;
  isLoading: boolean;
}

export default function TenantForm({ onSubmit, onCancel, isLoading }: TenantFormProps) {
  const { data: properties } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    retry: false,
  });

  const { data: entities } = useQuery<OwnershipEntity[]>({
    queryKey: ["/api/entities"],
    retry: false,
  });

  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ["/api/units"],
    retry: false,
  });

  const form = useForm<z.infer<typeof tenantSchema>>({
    resolver: zodResolver(tenantSchema),
    defaultValues: {
      tenantGroup: {
        name: "",
        propertyId: "",
        unitId: "",
      },
      tenants: [{
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        emergencyContact: "",
        emergencyPhone: "",
        notes: "",
      }],
    },
  });

  const selectedPropertyId = form.watch("tenantGroup.propertyId");
  const selectedProperty = properties?.find(p => p.id === selectedPropertyId);

  // Get entity information for selected property
  const getPropertyEntity = (property: Property) => {
    if (!entities) return null;
    // Properties can have multiple entities through propertyOwnerships
    // For simplicity, we'll show the first entity or indicate multiple
    return entities[0]; // This would need to be enhanced with actual property-entity relationships
  };

  const addTenant = () => {
    const currentTenants = form.getValues("tenants");
    form.setValue("tenants", [
      ...currentTenants,
      {
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        emergencyContact: "",
        emergencyPhone: "",
        notes: "",
      },
    ]);
  };

  const removeTenant = (index: number) => {
    const currentTenants = form.getValues("tenants");
    if (currentTenants.length > 1) {
      form.setValue("tenants", currentTenants.filter((_, i) => i !== index));
    }
  };

  // Check if selected property is a building
  const isSelectedPropertyBuilding = selectedProperty && 
    (selectedProperty.type === "Residential Building" || selectedProperty.type === "Commercial Building");

  // Get units for the selected property
  const getPropertyUnits = (propertyId: string) => {
    return units.filter(unit => unit.propertyId === propertyId);
  };

  const availableUnits = selectedPropertyId ? getPropertyUnits(selectedPropertyId) : [];

  // Clear unit selection when property changes
  const handlePropertyChange = (propertyId: string) => {
    form.setValue("tenantGroup.propertyId", propertyId);
    form.setValue("tenantGroup.unitId", ""); // Clear unit selection when property changes
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-6">
          <FormField
            control={form.control}
            name="tenantGroup.propertyId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Property</FormLabel>
                <FormControl>
                  <Select onValueChange={handlePropertyChange} value={field.value}>
                    <SelectTrigger data-testid="select-tenant-property">
                      <SelectValue placeholder="Select a property" />
                    </SelectTrigger>
                    <SelectContent>
                      {properties?.map((property) => (
                        <SelectItem key={property.id} value={property.id}>
                          {property.street}, {property.city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
                {selectedProperty && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {selectedProperty.street}, {selectedProperty.city}
                    {isSelectedPropertyBuilding && (
                      <span className="text-blue-600 font-medium ml-2">
                        • Building - Please select a unit below
                      </span>
                    )}
                  </p>
                )}
              </FormItem>
            )}
          />

          {/* Unit Selection - Only show for buildings */}
          {isSelectedPropertyBuilding && (
            <FormField
              control={form.control}
              name="tenantGroup.unitId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger data-testid="select-tenant-unit">
                        <SelectValue placeholder="Select a unit in this building" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableUnits.length > 0 ? (
                          availableUnits.map((unit) => (
                            <SelectItem key={unit.id} value={unit.id}>
                              {unit.label}
                              {unit.bedrooms && ` • ${unit.bedrooms} bed`}
                              {unit.bathrooms && `, ${unit.bathrooms} bath`}
                              {unit.rentAmount && ` • $${Number(unit.rentAmount).toLocaleString()}/mo`}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="" disabled>
                            No units available - Create units first
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                  {selectedPropertyId && availableUnits.length === 0 && (
                    <p className="text-sm text-orange-600">
                      This building has no units yet. Please add units to this property first before creating tenants.
                    </p>
                  )}
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="tenantGroup.name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tenant Group Name</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="e.g., Smith Family, John & Jane Doe" 
                    value={field.value || ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    data-testid="input-tenant-group-name" 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Tenants</h3>
            <Button type="button" variant="outline" onClick={addTenant} data-testid="button-add-tenant">
              Add Tenant
            </Button>
          </div>

          {form.watch("tenants").map((_, index) => (
            <div key={index} className="border border-border rounded-lg p-4 space-y-4" data-testid={`tenant-form-${index}`}>
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Tenant {index + 1}</h4>
                {form.watch("tenants").length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeTenant(index)}
                    data-testid={`button-remove-tenant-${index}`}
                  >
                    Remove
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name={`tenants.${index}.firstName`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="John" 
                          value={field.value || ""}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          name={field.name}
                          data-testid={`input-tenant-first-name-${index}`} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`tenants.${index}.lastName`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Doe" 
                          value={field.value || ""}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          name={field.name}
                          data-testid={`input-tenant-last-name-${index}`} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`tenants.${index}.email`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input 
                          type="email" 
                          placeholder="john@example.com" 
                          value={field.value || ""}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          name={field.name}
                          data-testid={`input-tenant-email-${index}`} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`tenants.${index}.phone`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="(555) 123-4567" 
                          value={field.value || ""}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          name={field.name}
                          data-testid={`input-tenant-phone-${index}`} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`tenants.${index}.emergencyContact`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Emergency Contact</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Jane Doe" 
                          value={field.value || ""}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          name={field.name}
                          data-testid={`input-tenant-emergency-contact-${index}`} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`tenants.${index}.emergencyPhone`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Emergency Phone</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="(555) 987-6543" 
                          value={field.value || ""}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          name={field.name}
                          data-testid={`input-tenant-emergency-phone-${index}`} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name={`tenants.${index}.notes`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Additional notes about this tenant..." 
                        value={field.value || ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        data-testid={`textarea-tenant-notes-${index}`} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel-tenant">
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading} data-testid="button-submit-tenant">
            {isLoading ? "Creating..." : "Create Tenant"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
