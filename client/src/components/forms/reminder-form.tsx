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
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Property, Reminder, OwnershipEntity, Unit } from "@shared/schema";

const reminderSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.enum(["rent", "lease", "regulatory", "maintenance", "custom"]).optional(),
  scope: z.enum(["entity", "property", "lease", "asset"]).optional(),
  scopeId: z.string().optional(),
  entityId: z.string().optional(),
  propertyId: z.string().optional(),
  unitIds: z.array(z.string()).optional(),
  dueAt: z.date(),
  leadDays: z.number().min(0, "Lead days must be 0 or greater"),
  channels: z.array(z.enum(["inapp", "email", "sms", "push"])).min(1, "At least one notification channel is required").default(["inapp"]),
  saveAsDefault: z.boolean().optional(),
  payloadJson: z.record(z.any()).optional(),
});

interface ReminderFormProps {
  properties: Property[];
  entities?: OwnershipEntity[];
  units?: Unit[];
  reminder?: Reminder;
  onSubmit: (data: z.infer<typeof reminderSchema>) => void;
  onCancel?: () => void;
  isLoading: boolean;
}

export default function ReminderForm({ properties, entities = [], units = [], reminder, onSubmit, onCancel, isLoading }: ReminderFormProps) {
  const form = useForm<z.infer<typeof reminderSchema>>({
    resolver: zodResolver(reminderSchema),
    defaultValues: reminder ? {
      title: reminder.title || "",
      type: reminder.type || undefined,
      scope: reminder.scope || undefined,
      scopeId: reminder.scopeId || "",
      entityId: reminder.entityId || "",
      propertyId: "",
      unitIds: [],
      dueAt: reminder.dueAt ? new Date(reminder.dueAt) : new Date(),
      leadDays: reminder.leadDays || 0,
      channels: (reminder as any).channels || ["inapp"],
      saveAsDefault: false,
    } : {
      title: "",
      type: undefined,
      scope: undefined,
      scopeId: "",
      entityId: "",
      propertyId: "",
      unitIds: [],
      dueAt: new Date(),
      leadDays: 0,
      channels: ["inapp"],
      saveAsDefault: false,
    },
  });

  const reminderTypes = [
    { value: "rent", label: "Rent Collection" },
    { value: "lease", label: "Lease Management" },
    { value: "regulatory", label: "Regulatory/Compliance" },
    { value: "maintenance", label: "Maintenance" },
    { value: "custom", label: "Custom" },
  ];

  const scopes = [
    { value: "entity", label: "Ownership Entity" },
    { value: "property", label: "Property" },
    { value: "lease", label: "Lease" },
    { value: "asset", label: "Asset" },
  ];

  const channels = [
    { value: "inapp", label: "In-App Notification", icon: "🔔" },
    { value: "email", label: "Email", icon: "📧" },
    { value: "sms", label: "SMS Text", icon: "📱" },
    { value: "push", label: "Push Notification", icon: "🔔" },
  ];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => {
        // Ensure date is properly formatted
        const formattedData = {
          ...data,
          dueAt: data.dueAt instanceof Date ? data.dueAt : new Date(data.dueAt),
        };
        onSubmit(formattedData);
      })} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reminder Title *</FormLabel>
              <FormControl>
                <Input 
                  placeholder="e.g., Property insurance renewal" 
                  value={field.value || ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  data-testid="input-reminder-title" 
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
              <FormLabel>Type (Optional)</FormLabel>
              <Select onValueChange={(value) => field.onChange(value === "none" ? undefined : value)} defaultValue={field.value || "none"}>
                <FormControl>
                  <SelectTrigger data-testid="select-reminder-type">
                    <SelectValue placeholder="Select type (optional)" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">No Type</SelectItem>
                  {reminderTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="propertyId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Property/Building (Optional)</FormLabel>
              <Select onValueChange={(value) => {
                field.onChange(value === "none" ? "" : value);
                // Clear unit selection when property changes
                form.setValue("unitIds", []);
              }} defaultValue={field.value || "none"}>
                <FormControl>
                  <SelectTrigger data-testid="select-reminder-property">
                    <SelectValue placeholder="Select property/building" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">No Property</SelectItem>
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

        {form.watch("propertyId") && form.watch("propertyId") !== "" && (
          <FormField
            control={form.control}
            name="unitIds"
            render={({ field }) => {
              const selectedPropertyId = form.watch("propertyId");
              const selectedProperty = properties.find(p => p.id === selectedPropertyId);
              const propertyUnits = units.filter(unit => unit.propertyId === selectedPropertyId);
              
              // Only show unit selection for buildings with multiple units (any building type)
              const isBuilding = propertyUnits.length > 1;
              
              if (!isBuilding) {
                return null;
              }
              
              return (
                <FormItem>
                  <FormLabel>Units (Optional - leave empty to apply to entire building)</FormLabel>
                  <div className="grid grid-cols-2 gap-2 max-h-24 overflow-y-auto border rounded p-2">
                    {propertyUnits.map((unit) => (
                      <label key={unit.id} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={field.value?.includes(unit.id) || false}
                          onChange={(e) => {
                            const currentIds = field.value || [];
                            if (e.target.checked) {
                              field.onChange([...currentIds, unit.id]);
                            } else {
                              field.onChange(currentIds.filter(id => id !== unit.id));
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm">{unit.label}</span>
                      </label>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        )}

        <FormField
          control={form.control}
          name="entityId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ownership Entity (Optional)</FormLabel>
              <Select onValueChange={(value) => field.onChange(value === "none" ? "" : value)} defaultValue={field.value || "none"}>
                <FormControl>
                  <SelectTrigger data-testid="select-reminder-entity">
                    <SelectValue placeholder="Select ownership entity" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">No Entity</SelectItem>
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

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="dueAt"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Due Date *</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                        data-testid="button-reminder-date"
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

          <FormField
            control={form.control}
            name="leadDays"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lead Days *</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    placeholder="0"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                    data-testid="input-reminder-lead-days"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="channels"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notification Channels (Select all that apply)</FormLabel>
              <div className="grid grid-cols-2 gap-3">
                {channels.map((channel) => (
                  <label key={channel.value} className="flex items-center space-x-3 cursor-pointer p-3 border rounded-lg hover:bg-muted/50">
                    <input
                      type="checkbox"
                      checked={field.value?.includes(channel.value as any) || false}
                      onChange={(e) => {
                        const currentChannels = field.value || [];
                        if (e.target.checked) {
                          field.onChange([...currentChannels, channel.value]);
                        } else {
                          // Don't allow unchecking if it's the last channel
                          if (currentChannels.length > 1) {
                            field.onChange(currentChannels.filter(c => c !== channel.value));
                          }
                        }
                      }}
                      className="rounded border-gray-300"
                      data-testid={`checkbox-channel-${channel.value}`}
                    />
                    <span className="text-lg">{channel.icon}</span>
                    <span className="text-sm font-medium">{channel.label}</span>
                  </label>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="saveAsDefault"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <input
                  type="checkbox"
                  checked={field.value || false}
                  onChange={field.onChange}
                  className="rounded border-gray-300"
                  data-testid="checkbox-save-as-default"
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel className="text-sm font-medium cursor-pointer">
                  💾 Make this notification selection my default for future reminders
                </FormLabel>
                <p className="text-xs text-muted-foreground">
                  Check this box to save your notification channel preferences for next time
                </p>
              </div>
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-2">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel}
            data-testid="button-cancel-reminder"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading} data-testid="button-submit-reminder">
            {isLoading 
              ? (reminder ? "Updating..." : "Creating...") 
              : (reminder ? "Update Reminder" : "Create Reminder")
            }
          </Button>
        </div>
      </form>
    </Form>
  );
}
