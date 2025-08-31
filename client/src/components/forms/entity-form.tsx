import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const entitySchema = z.object({
  type: z.enum(["LLC", "Individual"]),
  name: z.string().min(1, "Entity name is required"),
  state: z.string().optional(),
  ein: z.string().optional(),
  registeredAgent: z.string().optional(),
  renewalMonth: z.number().min(1).max(12).optional(),
  notes: z.string().optional(),
});

interface EntityFormProps {
  onSubmit: (data: z.infer<typeof entitySchema>) => void;
  isLoading: boolean;
  initialData?: Partial<z.infer<typeof entitySchema>>;
}

export default function EntityForm({ onSubmit, isLoading, initialData }: EntityFormProps) {
  const form = useForm<z.infer<typeof entitySchema>>({
    resolver: zodResolver(entitySchema),
    defaultValues: {
      type: "LLC",
      name: "",
      state: "",
      ein: "",
      registeredAgent: "",
      notes: "",
      ...initialData,
    },
  });

  const selectedType = form.watch("type");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Entity Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-entity-type">
                    <SelectValue placeholder="Select entity type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="LLC">LLC</SelectItem>
                  <SelectItem value="Individual">Individual</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {selectedType === "LLC" ? "LLC Name" : "Individual Name"}
              </FormLabel>
              <FormControl>
                <Input 
                  placeholder={selectedType === "LLC" ? "e.g., Smith Properties LLC" : "e.g., John Smith"} 
                  {...field} 
                  data-testid="input-entity-name"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {selectedType === "LLC" && (
          <>
            <FormField
              control={form.control}
              name="state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State of Formation</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., Delaware, California" 
                      {...field} 
                      data-testid="input-entity-state"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ein"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>EIN (Tax ID)</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., 12-3456789" 
                      {...field} 
                      data-testid="input-entity-ein"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="registeredAgent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Registered Agent</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., CT Corporation System" 
                      {...field} 
                      data-testid="input-entity-agent"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="renewalMonth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Annual Renewal Month</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)} 
                    defaultValue={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-renewal-month">
                        <SelectValue placeholder="Select renewal month" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => {
                        const month = i + 1;
                        const monthName = new Date(2024, i).toLocaleString('default', { month: 'long' });
                        return (
                          <SelectItem key={month} value={month.toString()}>
                            {monthName}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Additional notes about this entity..." 
                  {...field} 
                  data-testid="textarea-entity-notes"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" data-testid="button-cancel-entity">
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading} data-testid="button-submit-entity">
            {isLoading ? (initialData ? "Updating..." : "Creating...") : (initialData ? "Update Entity" : "Create Entity")}
          </Button>
        </div>
      </form>
    </Form>
  );
}