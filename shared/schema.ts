import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  decimal,
  integer,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Organizations
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  ownerId: varchar("owner_id").notNull().references(() => users.id),
  timezone: varchar("timezone").default("America/New_York"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Organization members
export const organizationMembers = pgTable("organization_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  role: varchar("role").notNull().default("admin"), // admin, manager, tenant, vendor, accountant
  createdAt: timestamp("created_at").defaultNow(),
});

// Ownership entities
export const ownershipEntityTypeEnum = pgEnum("ownership_entity_type", ["LLC", "Individual"]);

export const ownershipEntities = pgTable("ownership_entities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  type: ownershipEntityTypeEnum("type").notNull(),
  name: varchar("name").notNull(),
  state: varchar("state"),
  ein: varchar("ein"),
  registeredAgent: varchar("registered_agent"),
  renewalMonth: integer("renewal_month"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Properties
export const propertyTypeEnum = pgEnum("property_type", ["Single Family", "Duplex", "Triplex", "Fourplex", "Apartment", "Condo", "Townhome", "Commercial"]);

export const properties = pgTable("properties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  name: varchar("name").notNull(),
  type: propertyTypeEnum("type").notNull(),
  street: varchar("street").notNull(),
  city: varchar("city").notNull(),
  state: varchar("state").notNull(),
  zipCode: varchar("zip_code").notNull(),
  country: varchar("country").default("US"),
  yearBuilt: integer("year_built"),
  sqft: integer("sqft"),
  hoaName: varchar("hoa_name"),
  hoaContact: varchar("hoa_contact"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Property ownership (junction table for ownership splits)
export const propertyOwnerships = pgTable("property_ownerships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  entityId: varchar("entity_id").notNull().references(() => ownershipEntities.id),
  percent: decimal("percent", { precision: 5, scale: 2 }).notNull(),
});

// Units
export const units = pgTable("units", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  label: varchar("label").notNull(),
  bedrooms: integer("bedrooms"),
  bathrooms: decimal("bathrooms", { precision: 3, scale: 1 }),
  sqft: integer("sqft"),
  floor: integer("floor"),
  rentAmount: decimal("rent_amount", { precision: 10, scale: 2 }),
  deposit: decimal("deposit", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tenant groups (for multiple tenants per unit)
export const tenantGroups = pgTable("tenant_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tenants
export const tenants = pgTable("tenants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").references(() => tenantGroups.id),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  email: varchar("email"),
  phone: varchar("phone"),
  emergencyContact: varchar("emergency_contact"),
  emergencyPhone: varchar("emergency_phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Leases
export const leaseStatusEnum = pgEnum("lease_status", ["Active", "Expired", "Terminated", "Pending"]);

export const leases = pgTable("leases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  unitId: varchar("unit_id").notNull().references(() => units.id),
  tenantGroupId: varchar("tenant_group_id").notNull().references(() => tenantGroups.id),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  rent: decimal("rent", { precision: 10, scale: 2 }).notNull(),
  deposit: decimal("deposit", { precision: 10, scale: 2 }),
  dueDay: integer("due_day").default(1),
  lateFeeRuleJson: jsonb("late_fee_rule_json"),
  status: leaseStatusEnum("status").default("Active"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Assets/Appliances
export const assetCategoryEnum = pgEnum("asset_category", ["HVAC", "Boiler", "Water Heater", "Fridge", "Range/Oven", "Microwave", "Dishwasher", "Washer", "Dryer", "Disposal", "Smoke/CO", "Roof", "Windows", "Irrigation", "Sump Pump", "Panel", "Garage Door", "Security"]);

export const assets = pgTable("assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  unitId: varchar("unit_id").references(() => units.id),
  propertyId: varchar("property_id").references(() => properties.id),
  category: assetCategoryEnum("category").notNull(),
  make: varchar("make"),
  model: varchar("model"),
  serial: varchar("serial"),
  mfgYear: integer("mfg_year"),
  installDate: timestamp("install_date"),
  warrantyEnd: timestamp("warranty_end"),
  lastServiceAt: timestamp("last_service_at"),
  nextServiceAt: timestamp("next_service_at"),
  photos: text("photos").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Asset extracts (AI vision results)
export const assetExtracts = pgTable("asset_extracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").notNull().references(() => assets.id),
  sourcePhotoUrl: varchar("source_photo_url").notNull(),
  extractJson: jsonb("extract_json"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Maintenance templates
export const maintenanceTemplates = pgTable("maintenance_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: assetCategoryEnum("category").notNull(),
  name: varchar("name").notNull(),
  cadenceDays: integer("cadence_days").notNull(),
  defaultNotes: text("default_notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Maintenance reminders
export const maintenanceReminderStatusEnum = pgEnum("maintenance_reminder_status", ["Pending", "Completed", "Overdue"]);

export const maintenanceReminders = pgTable("maintenance_reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").notNull().references(() => assets.id),
  templateId: varchar("template_id").references(() => maintenanceTemplates.id),
  dueAt: timestamp("due_at").notNull(),
  status: maintenanceReminderStatusEnum("status").default("Pending"),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Smart Cases
export const caseStatusEnum = pgEnum("case_status", ["New", "In Review", "Scheduled", "In Progress", "On Hold", "Resolved", "Closed"]);
export const casePriorityEnum = pgEnum("case_priority", ["Low", "Medium", "High", "Urgent"]);

export const smartCases = pgTable("smart_cases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  unitId: varchar("unit_id").references(() => units.id),
  propertyId: varchar("property_id").references(() => properties.id),
  title: varchar("title").notNull(),
  description: text("description"),
  status: caseStatusEnum("status").default("New"),
  priority: casePriorityEnum("priority").default("Medium"),
  category: varchar("category"),
  aiTriageJson: jsonb("ai_triage_json"),
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 2 }),
  actualCost: decimal("actual_cost", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Case media
export const caseMedia = pgTable("case_media", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  caseId: varchar("case_id").notNull().references(() => smartCases.id),
  url: varchar("url").notNull(),
  type: varchar("type").notNull(), // image, video, document
  caption: text("caption"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Case events
export const caseEvents = pgTable("case_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  caseId: varchar("case_id").notNull().references(() => smartCases.id),
  type: varchar("type").notNull(), // status_change, comment, cost_update, etc.
  description: text("description").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Vendors
export const vendors = pgTable("vendors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  name: varchar("name").notNull(),
  category: varchar("category"), // plumbing, electrical, hvac, etc.
  phone: varchar("phone"),
  email: varchar("email"),
  address: text("address"),
  rating: decimal("rating", { precision: 3, scale: 2 }),
  notes: text("notes"),
  isPreferred: boolean("is_preferred").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// CAM Categories
export const camCategories = pgTable("cam_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  name: varchar("name").notNull(),
  code: varchar("code"),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Transactions
export const transactionTypeEnum = pgEnum("transaction_type", ["Income", "Expense"]);

export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  propertyId: varchar("property_id").references(() => properties.id),
  unitId: varchar("unit_id").references(() => units.id),
  type: transactionTypeEnum("type").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  description: varchar("description").notNull(),
  category: varchar("category"),
  date: timestamp("date").notNull(),
  vendorId: varchar("vendor_id").references(() => vendors.id),
  receiptUrl: varchar("receipt_url"),
  notes: text("notes"),
  isRecurring: boolean("is_recurring").default(false),
  recurringFrequency: varchar("recurring_frequency"), // monthly, quarterly, biannually, annually
  recurringEndDate: timestamp("recurring_end_date"),
  taxDeductible: boolean("tax_deductible").default(true),
  parentRecurringId: varchar("parent_recurring_id"), // Reference to the original transaction for recurring instances
  createdAt: timestamp("created_at").defaultNow(),
});

// CAM Entries
export const camEntries = pgTable("cam_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").notNull().references(() => properties.id),
  categoryId: varchar("category_id").notNull().references(() => camCategories.id),
  transactionId: varchar("transaction_id").references(() => transactions.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  ytdEstimate: decimal("ytd_estimate", { precision: 10, scale: 2 }),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Reminders
export const reminderScopeEnum = pgEnum("reminder_scope", ["entity", "property", "lease", "asset"]);
export const reminderTypeEnum = pgEnum("reminder_type", ["rent", "lease", "regulatory", "maintenance", "custom"]);
export const reminderChannelEnum = pgEnum("reminder_channel", ["inapp", "email"]);
export const reminderStatusEnum = pgEnum("reminder_status", ["Pending", "Sent", "Completed", "Cancelled"]);

export const reminders = pgTable("reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  scope: reminderScopeEnum("scope").notNull(),
  scopeId: varchar("scope_id").notNull(),
  title: varchar("title").notNull(),
  type: reminderTypeEnum("type").notNull(),
  dueAt: timestamp("due_at").notNull(),
  leadDays: integer("lead_days").default(0),
  channel: reminderChannelEnum("channel").default("inapp"),
  payloadJson: jsonb("payload_json"),
  status: reminderStatusEnum("status").default("Pending"),
  sentAt: timestamp("sent_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Regulatory rules
export const regulatoryRules = pgTable("regulatory_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityId: varchar("entity_id").notNull().references(() => ownershipEntities.id),
  name: varchar("name").notNull(),
  cronText: varchar("cron_text"),
  month: integer("month"),
  day: integer("day"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Notifications
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  type: varchar("type").default("info"), // info, warning, error, success
  isRead: boolean("is_read").default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Threads and Messages
export const threadScopeEnum = pgEnum("thread_scope", ["unit", "case", "entity"]);

export const threads = pgTable("threads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  scope: threadScopeEnum("scope").notNull(),
  scopeId: varchar("scope_id").notNull(),
  title: varchar("title"),
  isPrivate: boolean("is_private").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  threadId: varchar("thread_id").notNull().references(() => threads.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  attachments: text("attachments").array(),
  isInternal: boolean("is_internal").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  organizations: many(organizations),
  memberships: many(organizationMembers),
  notifications: many(notifications),
  messages: many(messages),
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  owner: one(users, { fields: [organizations.ownerId], references: [users.id] }),
  members: many(organizationMembers),
  entities: many(ownershipEntities),
  properties: many(properties),
  tenantGroups: many(tenantGroups),
  smartCases: many(smartCases),
  vendors: many(vendors),
  camCategories: many(camCategories),
  transactions: many(transactions),
  reminders: many(reminders),
  threads: many(threads),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  organization: one(organizations, { fields: [properties.orgId], references: [organizations.id] }),
  units: many(units),
  ownerships: many(propertyOwnerships),
  assets: many(assets),
  smartCases: many(smartCases),
  transactions: many(transactions),
  camEntries: many(camEntries),
}));

export const unitsRelations = relations(units, ({ one, many }) => ({
  property: one(properties, { fields: [units.propertyId], references: [properties.id] }),
  leases: many(leases),
  assets: many(assets),
  smartCases: many(smartCases),
  transactions: many(transactions),
}));

export const leasesRelations = relations(leases, ({ one }) => ({
  unit: one(units, { fields: [leases.unitId], references: [units.id] }),
  tenantGroup: one(tenantGroups, { fields: [leases.tenantGroupId], references: [tenantGroups.id] }),
}));

export const smartCasesRelations = relations(smartCases, ({ one, many }) => ({
  organization: one(organizations, { fields: [smartCases.orgId], references: [organizations.id] }),
  unit: one(units, { fields: [smartCases.unitId], references: [units.id] }),
  property: one(properties, { fields: [smartCases.propertyId], references: [properties.id] }),
  media: many(caseMedia),
  events: many(caseEvents),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true });
export const insertOwnershipEntitySchema = createInsertSchema(ownershipEntities).omit({ id: true, createdAt: true });
export const insertPropertySchema = createInsertSchema(properties).omit({ id: true, createdAt: true });
export const insertUnitSchema = createInsertSchema(units).omit({ id: true, createdAt: true });
export const insertTenantGroupSchema = createInsertSchema(tenantGroups).omit({ id: true, createdAt: true });
export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true, createdAt: true });
export const insertLeaseSchema = createInsertSchema(leases).omit({ id: true, createdAt: true });
export const insertAssetSchema = createInsertSchema(assets).omit({ id: true, createdAt: true });
export const insertSmartCaseSchema = createInsertSchema(smartCases).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true, createdAt: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, createdAt: true });
export const insertReminderSchema = createInsertSchema(reminders).omit({ id: true, createdAt: true });
export const insertExpenseSchema = insertTransactionSchema.extend({
  type: z.literal("Expense"),
  isRecurring: z.boolean().default(false),
  recurringFrequency: z.enum(["monthly", "quarterly", "biannually", "annually"]).optional(),
  recurringEndDate: z.string().datetime().optional(),
  taxDeductible: z.boolean().default(true),
  parentRecurringId: z.string().optional(),
}).refine((data) => {
  if (data.isRecurring && !data.recurringFrequency) {
    return false;
  }
  return true;
}, {
  message: "Recurring frequency is required for recurring expenses",
  path: ["recurringFrequency"],
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type OwnershipEntity = typeof ownershipEntities.$inferSelect;
export type InsertOwnershipEntity = z.infer<typeof insertOwnershipEntitySchema>;
export type Property = typeof properties.$inferSelect;
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Unit = typeof units.$inferSelect;
export type InsertUnit = z.infer<typeof insertUnitSchema>;
export type TenantGroup = typeof tenantGroups.$inferSelect;
export type InsertTenantGroup = z.infer<typeof insertTenantGroupSchema>;
export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Lease = typeof leases.$inferSelect;
export type InsertLease = z.infer<typeof insertLeaseSchema>;
export type Asset = typeof assets.$inferSelect;
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type SmartCase = typeof smartCases.$inferSelect;
export type InsertSmartCase = z.infer<typeof insertSmartCaseSchema>;
export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Reminder = typeof reminders.$inferSelect;
export type InsertReminder = z.infer<typeof insertReminderSchema>;
export type Notification = typeof notifications.$inferSelect;
