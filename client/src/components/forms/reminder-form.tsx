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
import type { Property, Reminder } from "@shared/schema";

const reminderSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.enum(["rent", "lease", "regulatory", "maintenance", "custom"]),
  scope: z.enum(["entity", "property", "lease", "asset"]),
  scopeId: z.string().min(1, "Scope selection is required"),
  dueAt: z.date(),
  leadDays: z.number().min(0).default(0),
  channel: z.enum(["inapp", "email"]).default("inapp"),
  payloadJson: z.record(z.any()).optional(),
});

interface ReminderFormProps {
  properties: Property[];
  reminder?: Reminder;
  onSubmit: (data: z.infer<typeof reminderSchema>) => void;
  onCancel?: () => void;
  isLoading: boolean;
}

export default function ReminderForm({ properties, reminder, onSubmit, onCancel, isLoading }: ReminderFormProps) {
  const form = useForm<z.infer<typeof reminderSchema>>({
    resolver: zodResolver(reminderSchema),
    defaultValues: reminder ? {
      title: reminder.title || "",
      type: reminder.type || "custom",
      scope: reminder.scope || "property",
      scopeId: reminder.scopeId || "",
      dueAt: reminder.dueAt ? new Date(reminder.dueAt) : new Date(),
      leadDays: reminder.leadDays || 0,
      channel: reminder.channel || "inapp",
    } : {
      title: "",
      type: "custom",
      scope: "property",
      scopeId: "",
      dueAt: new Date(),
      leadDays: 0,
      channel: "inapp",
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
    { value: "inapp", label: "In-App Notification" },
    { value: "email", label: "Email" },
  ];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Reminder Title</FormLabel>
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

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-reminder-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
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
            name="scope"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Scope</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-reminder-scope">
                      <SelectValue placeholder="Select scope" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {scopes.map((scope) => (
                      <SelectItem key={scope.value} value={scope.value}>{scope.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="scopeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {form.watch("scope") === "property" ? "Property" : "Scope Item"}
              </FormLabel>
              {form.watch("scope") === "property" ? (
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-reminder-property">
                      <SelectValue placeholder="Select property" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {properties.map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <FormControl>
                  <Input 
                    placeholder="Enter scope ID" 
                    value={field.value || ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    data-testid="input-reminder-scope-id" 
                  />
                </FormControl>
              )}
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
                <FormLabel>Due Date</FormLabel>
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
                <FormLabel>Lead Days</FormLabel>
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
          name="channel"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notification Channel</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-reminder-channel">
                    <SelectValue placeholder="Select channel" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {channels.map((channel) => (
                    <SelectItem key={channel.value} value={channel.value}>{channel.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
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
