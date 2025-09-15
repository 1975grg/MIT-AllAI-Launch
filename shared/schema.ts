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
  phone: varchar("phone"),
  bio: text("bio"),
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

// Tax-related enums
export const scheduleECategoryEnum = pgEnum("schedule_e_category", [
  "advertising", "auto_travel", "cleaning_maintenance", "commissions", 
  "insurance", "legal_professional", "management_fees", "mortgage_interest", 
  "other_interest", "repairs", "supplies", "taxes", "utilities", "depreciation", 
  "other_expenses", "capital_improvements"
]);

export const vendorTypeEnum = pgEnum("vendor_type", ["individual", "corporation", "partnership", "llc"]);

export const depreciationMethodEnum = pgEnum("depreciation_method", ["straight_line", "accelerated"]);

export const assetTypeEnum = pgEnum("asset_type", ["building", "improvement", "equipment", "furniture"]);

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
  // Archive status
  status: varchar("status").default("Active").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Properties
export const propertyTypeEnum = pgEnum("property_type", ["Single Family", "Condo", "Townhome", "Residential Building", "Commercial Unit", "Commercial Building"]);
// Remove enum temporarily to avoid migration complexity
// export const propertyStatusEnum = pgEnum("property_status", ["Active", "Archived"]);

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
  // Building-level equipment (for buildings only)
  buildingHvacBrand: varchar("building_hvac_brand"),
  buildingHvacModel: varchar("building_hvac_model"),
  buildingHvacYear: integer("building_hvac_year"),
  buildingHvacLifetime: integer("building_hvac_lifetime"), // years
  buildingHvacReminder: boolean("building_hvac_reminder").default(false),
  buildingHvacLocation: varchar("building_hvac_location"),
  buildingWaterBrand: varchar("building_water_brand"),
  buildingWaterModel: varchar("building_water_model"),
  buildingWaterYear: integer("building_water_year"),
  buildingWaterLifetime: integer("building_water_lifetime"), // years
  buildingWaterReminder: boolean("building_water_reminder").default(false),
  buildingWaterLocation: varchar("building_water_location"),
  buildingWaterShutoff: varchar("building_water_shutoff"),
  buildingElectricalPanel: varchar("building_electrical_panel"),
  buildingEquipmentNotes: text("building_equipment_notes"),
  // Property value tracking
  propertyValue: decimal("property_value", { precision: 12, scale: 2 }), // Total building/property value
  autoAppreciation: boolean("auto_appreciation").default(false), // Enable automatic yearly appreciation
  appreciationRate: decimal("appreciation_rate", { precision: 4, scale: 2 }), // Annual appreciation percentage (e.g., 3.50 for 3.5%)
  valueEntryDate: timestamp("value_entry_date"), // When the value was entered (to calculate yearly increases)
  // Primary mortgage tracking
  monthlyMortgage: decimal("monthly_mortgage", { precision: 10, scale: 2 }), // Monthly mortgage payment amount
  interestRate: decimal("interest_rate", { precision: 5, scale: 3 }), // Annual interest rate percentage (e.g., 5.250 for 5.25%)
  purchasePrice: decimal("purchase_price", { precision: 12, scale: 2 }), // Total purchase price of the property
  downPayment: decimal("down_payment", { precision: 12, scale: 2 }), // Cash invested (down payment + closing costs)
  acquisitionDate: timestamp("acquisition_date"), // Date property was acquired (for partial-year calculations)
  mortgageStartDate: timestamp("mortgage_start_date"), // Date when mortgage payments should start being auto-generated
  // Secondary mortgage tracking
  monthlyMortgage2: decimal("monthly_mortgage_2", { precision: 10, scale: 2 }), // Second mortgage monthly payment amount
  interestRate2: decimal("interest_rate_2", { precision: 5, scale: 3 }), // Second mortgage annual interest rate percentage
  mortgageStartDate2: timestamp("mortgage_start_date_2"), // Date when second mortgage payments should start being auto-generated
  // Property sale tracking
  saleDate: timestamp("sale_date"), // Date property was sold (ends mortgage calculations)
  salePrice: decimal("sale_price", { precision: 12, scale: 2 }), // Sale price of the property
  // Archive status
  status: varchar("status").default("Active").notNull(),
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
  // Equipment tracking (all optional)
  hvacBrand: varchar("hvac_brand"),
  hvacModel: varchar("hvac_model"),
  hvacYear: integer("hvac_year"),
  hvacLifetime: integer("hvac_lifetime"), // years
  hvacReminder: boolean("hvac_reminder").default(false),
  waterHeaterBrand: varchar("water_heater_brand"),
  waterHeaterModel: varchar("water_heater_model"),
  waterHeaterYear: integer("water_heater_year"),
  waterHeaterLifetime: integer("water_heater_lifetime"), // years
  waterHeaterReminder: boolean("water_heater_reminder").default(false),
  applianceNotes: text("appliance_notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Custom appliances for units
export const unitAppliances = pgTable("unit_appliances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  unitId: varchar("unit_id").notNull().references(() => units.id),
  name: varchar("name").notNull(), // e.g., "Refrigerator", "Dishwasher"
  manufacturer: varchar("manufacturer"), // e.g., "GE", "Whirlpool"
  model: varchar("model"),
  year: integer("year"),
  expectedLifetime: integer("expected_lifetime"), // years
  alertBeforeExpiry: integer("alert_before_expiry"), // months before expected end of life
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tenant groups (for multiple tenants per unit)
export const tenantGroups = pgTable("tenant_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  propertyId: varchar("property_id").references(() => properties.id),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  status: varchar("status").notNull().default("Active"), // Active, Former, Archived
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
  // Archive status
  status: varchar("status").default("Active").notNull(),
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
  // Renewal and reminder options
  autoRenewEnabled: boolean("auto_renew_enabled").default(false),
  expirationReminderMonths: integer("expiration_reminder_months").default(3), // Months before lease expires
  renewalReminderEnabled: boolean("renewal_reminder_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Rent payments (specific tracking for lease payments)
export const rentPayments = pgTable("rent_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leaseId: varchar("lease_id").notNull().references(() => leases.id),
  transactionId: varchar("transaction_id").references(() => transactions.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentDate: timestamp("payment_date").notNull(),
  dueDate: timestamp("due_date").notNull(),
  isLate: boolean("is_late").default(false),
  lateFee: decimal("late_fee", { precision: 10, scale: 2 }),
  notes: text("notes"),
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
  // Tax-related fields for 1099 tracking
  vendorType: vendorTypeEnum("vendor_type").default("individual"),
  w9OnFile: boolean("w9_on_file").default(false),
  taxExempt: boolean("tax_exempt").default(false),
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
export const paymentStatusEnum = pgEnum("payment_status", ["Paid", "Unpaid", "Skipped", "Partial"]);

export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  propertyId: varchar("property_id").references(() => properties.id),
  unitId: varchar("unit_id").references(() => units.id),
  entityId: varchar("entity_id").references(() => ownershipEntities.id), // For operational transactions
  type: transactionTypeEnum("type").notNull(),
  scope: varchar("scope").default("property"), // "property" or "operational"
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  description: varchar("description").notNull(),
  category: varchar("category"),
  date: timestamp("date").notNull(),
  isDateRange: boolean("is_date_range").default(false), // For bulk date range entries
  endDate: timestamp("end_date"), // End date for bulk entries
  vendorId: varchar("vendor_id").references(() => vendors.id),
  receiptUrl: varchar("receipt_url"),
  notes: text("notes"),
  isRecurring: boolean("is_recurring").default(false),
  recurringFrequency: varchar("recurring_frequency"), // "days", "weeks", "months", "years"
  recurringInterval: integer("recurring_interval").default(1), // Every X (frequency)
  recurringEndDate: timestamp("recurring_end_date"),
  taxDeductible: boolean("tax_deductible").default(true),
  // Tax-related fields for Schedule E categorization
  scheduleECategory: scheduleECategoryEnum("schedule_e_category"),
  isCapitalizable: boolean("is_capitalizable").default(false), // Whether expense should be capitalized vs deducted
  depreciationAssetId: varchar("depreciation_asset_id").references(() => depreciationAssets.id), // Link to depreciation asset if capitalized
  taxYear: integer("tax_year"), // Override tax year (for year-end adjustments)
  parentRecurringId: varchar("parent_recurring_id"), // Reference to the original transaction for recurring instances
  isBulkEntry: boolean("is_bulk_entry").default(false), // For bulk expense entries
  paymentStatus: paymentStatusEnum("payment_status").default("Paid"), // Payment tracking status
  paidAmount: decimal("paid_amount", { precision: 10, scale: 2 }), // Amount actually paid for partial payments
  // Multi-year amortization fields
  isAmortized: boolean("is_amortized").notNull().default(false), // Whether expense is amortized over multiple years
  amortizationYears: integer("amortization_years"), // Number of years to amortize over (2-40)
  amortizationStartDate: timestamp("amortization_start_date"), // When amortization period begins
  amortizationMethod: varchar("amortization_method").notNull().default("straight_line"), // Amortization calculation method
  createdAt: timestamp("created_at").defaultNow(),
});

// Transaction Line Items (for split expenses)
export const transactionLineItems = pgTable("transaction_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  transactionId: varchar("transaction_id").notNull().references(() => transactions.id),
  category: varchar("category").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  description: varchar("description"),
  taxDeductible: boolean("tax_deductible").default(true),
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
export const reminderChannelEnum = pgEnum("reminder_channel", ["inapp", "email", "sms", "push"]);
export const reminderStatusEnum = pgEnum("reminder_status", ["Pending", "Overdue", "Completed", "Cancelled"]);

export const reminders = pgTable("reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  scope: reminderScopeEnum("scope"),
  scopeId: varchar("scope_id"),
  entityId: varchar("entity_id").references(() => ownershipEntities.id),
  title: varchar("title").notNull(),
  type: reminderTypeEnum("type"),
  dueAt: timestamp("due_at").notNull(),
  leadDays: integer("lead_days").default(0),
  channels: reminderChannelEnum("channels").array().default(sql`ARRAY['inapp']::reminder_channel[]`),
  payloadJson: jsonb("payload_json"),
  status: reminderStatusEnum("status").default("Pending"),
  sentAt: timestamp("sent_at"),
  completedAt: timestamp("completed_at"),
  isRecurring: boolean("is_recurring").default(false),
  recurringFrequency: varchar("recurring_frequency"), // "days", "weeks", "months", "years"
  recurringInterval: integer("recurring_interval").default(1), // Every X (frequency)
  recurringEndDate: timestamp("recurring_end_date"),
  parentRecurringId: varchar("parent_recurring_id"), // Reference to the original reminder for recurring instances
  isBulkEntry: boolean("is_bulk_entry").default(false), // For bulk reminder entries
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

// Depreciation Assets (for tax depreciation tracking)
export const depreciationAssets = pgTable("depreciation_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  propertyId: varchar("property_id").references(() => properties.id),
  assetType: assetTypeEnum("asset_type").notNull(),
  name: varchar("name").notNull(),
  description: text("description"),
  // Cost basis information
  originalCost: decimal("original_cost", { precision: 12, scale: 2 }).notNull(),
  adjustedBasis: decimal("adjusted_basis", { precision: 12, scale: 2 }).notNull(),
  // Depreciation parameters
  inServiceDate: timestamp("in_service_date").notNull(),
  recoveryPeriod: decimal("recovery_period", { precision: 4, scale: 1 }).notNull(), // 27.5, 39, etc.
  depreciationMethod: depreciationMethodEnum("depreciation_method").notNull().default("straight_line"),
  convention: varchar("convention").notNull().default("mid_month"), // mid_month, half_year, etc.
  bonusDepreciationPercent: decimal("bonus_depreciation_percent", { precision: 5, scale: 2 }).default("0"),
  section179Taken: decimal("section179_taken", { precision: 10, scale: 2 }).default("0"),
  // Status tracking
  isActive: boolean("is_active").default(true),
  disposalDate: timestamp("disposal_date"),
  disposalAmount: decimal("disposal_amount", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Depreciation Schedules (yearly depreciation calculations)
export const depreciationSchedules = pgTable("depreciation_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").notNull().references(() => depreciationAssets.id),
  taxYear: integer("tax_year").notNull(),
  // Calculated depreciation amounts
  currentYearDepreciation: decimal("current_year_depreciation", { precision: 10, scale: 2 }).notNull(),
  accumulatedDepreciation: decimal("accumulated_depreciation", { precision: 12, scale: 2 }).notNull(),
  remainingBasis: decimal("remaining_basis", { precision: 12, scale: 2 }).notNull(),
  // Calculation metadata
  calculationMethod: varchar("calculation_method").notNull(),
  monthsInService: integer("months_in_service").notNull(),
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
  depreciationAssets: many(depreciationAssets),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  organization: one(organizations, { fields: [properties.orgId], references: [organizations.id] }),
  units: many(units),
  ownerships: many(propertyOwnerships),
  assets: many(assets),
  smartCases: many(smartCases),
  transactions: many(transactions),
  camEntries: many(camEntries),
  depreciationAssets: many(depreciationAssets),
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

// Depreciation table relations
export const depreciationAssetsRelations = relations(depreciationAssets, ({ one, many }) => ({
  organization: one(organizations, { fields: [depreciationAssets.orgId], references: [organizations.id] }),
  property: one(properties, { fields: [depreciationAssets.propertyId], references: [properties.id] }),
  schedules: many(depreciationSchedules),
  transactions: many(transactions),
}));

export const depreciationSchedulesRelations = relations(depreciationSchedules, ({ one }) => ({
  asset: one(depreciationAssets, { fields: [depreciationSchedules.assetId], references: [depreciationAssets.id] }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  organization: one(organizations, { fields: [transactions.orgId], references: [organizations.id] }),
  property: one(properties, { fields: [transactions.propertyId], references: [properties.id] }),
  unit: one(units, { fields: [transactions.unitId], references: [units.id] }),
  entity: one(ownershipEntities, { fields: [transactions.entityId], references: [ownershipEntities.id] }),
  vendor: one(vendors, { fields: [transactions.vendorId], references: [vendors.id] }),
  depreciationAsset: one(depreciationAssets, { fields: [transactions.depreciationAssetId], references: [depreciationAssets.id] }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true });
export const insertOwnershipEntitySchema = createInsertSchema(ownershipEntities).omit({ id: true, createdAt: true });
export const insertPropertySchema = createInsertSchema(properties).omit({ id: true, createdAt: true });
export const insertUnitSchema = createInsertSchema(units).omit({ id: true, createdAt: true }).extend({
  bedrooms: z.number().optional(),
  bathrooms: z.number().optional(), 
  sqft: z.number().optional(),
  floor: z.number().optional(),
  rentAmount: z.string().optional(),
  deposit: z.string().optional(),
  hvacYear: z.number().optional(),
  hvacLifetime: z.number().optional(),
  waterHeaterYear: z.number().optional(),
  waterHeaterLifetime: z.number().optional(),
});
export const insertTenantGroupSchema = createInsertSchema(tenantGroups).omit({ id: true, createdAt: true });
export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true, createdAt: true });
export const insertLeaseSchema = createInsertSchema(leases).omit({ id: true, createdAt: true });
export const insertAssetSchema = createInsertSchema(assets).omit({ id: true, createdAt: true });
export const insertSmartCaseSchema = createInsertSchema(smartCases).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true, createdAt: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, createdAt: true });
export const insertReminderSchema = createInsertSchema(reminders).omit({ id: true, createdAt: true, parentRecurringId: true }).extend({
  dueAt: z.union([z.date(), z.string().transform((str) => new Date(str))]),
  isRecurring: z.boolean().optional().default(false),
  recurringFrequency: z.enum(["days", "weeks", "months", "years"]).optional(),
  recurringInterval: z.number().min(1).optional().default(1),
  recurringEndDate: z.union([z.date(), z.string().transform((str) => new Date(str))]).optional(),
  isBulkEntry: z.boolean().optional().default(false),
}).refine((data) => {
  if (data.isRecurring && !data.recurringFrequency) {
    return false;
  }
  return true;
}, {
  message: "Recurring frequency is required for recurring reminders",
  path: ["recurringFrequency"],
});
// Line Item schemas
export const insertTransactionLineItemSchema = createInsertSchema(transactionLineItems).omit({ id: true, createdAt: true });

export const insertExpenseSchema = insertTransactionSchema.extend({
  type: z.literal("Expense"),
  isRecurring: z.boolean().default(false),
  recurringFrequency: z.enum(["days", "weeks", "months", "years"]).optional(),
  recurringInterval: z.number().min(1).default(1),
  recurringEndDate: z.union([z.date(), z.string().transform((str) => new Date(str))]).optional(),
  // Explicitly include amortization fields to ensure they're not stripped
  isAmortized: z.boolean().default(false),
  amortizationYears: z.number().int().min(2).max(30).optional(),
  amortizationStartDate: z.union([z.date(), z.string().transform((str) => new Date(str))]).optional(),
  amortizationMethod: z.enum(["straight_line"]).default("straight_line"),
  taxDeductible: z.boolean().default(true),
  // Tax categorization fields
  scheduleECategory: z.enum(["advertising", "auto_travel", "cleaning_maintenance", "commissions", "insurance", "legal_professional", "management_fees", "mortgage_interest", "other_interest", "repairs", "supplies", "taxes", "utilities", "depreciation", "other_expenses", "capital_improvements"]).optional(),
  isCapitalizable: z.boolean().default(false),
  depreciationAssetId: z.string().optional(),
  taxYear: z.number().int().optional(),
  parentRecurringId: z.string().optional(),
  scope: z.enum(["property", "operational"]).default("property"),
  entityId: z.string().optional(),
  isBulkEntry: z.boolean().default(false),
  lineItems: z.array(insertTransactionLineItemSchema.omit({ transactionId: true })).optional(),
}).refine((data) => {
  if (data.isRecurring && !data.recurringFrequency) {
    return false;
  }
  return true;
}, {
  message: "Recurring frequency is required for recurring expenses",
  path: ["recurringFrequency"],
}).refine((data) => {
  if (data.scope === "operational" && !data.entityId) {
    return false;
  }
  return true;
}, {
  message: "Entity ID is required for operational expenses",
  path: ["entityId"],
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
export type TransactionLineItem = typeof transactionLineItems.$inferSelect;
export type InsertTransactionLineItem = z.infer<typeof insertTransactionLineItemSchema>;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Reminder = typeof reminders.$inferSelect;
export type InsertReminder = z.infer<typeof insertReminderSchema>;
export type Notification = typeof notifications.$inferSelect;
export type RentPayment = typeof rentPayments.$inferSelect;
export type InsertRentPayment = typeof rentPayments.$inferInsert;

// Tax-related insert schemas
export const insertDepreciationAssetSchema = createInsertSchema(depreciationAssets).omit({ id: true, createdAt: true }).extend({
  inServiceDate: z.union([z.date(), z.string().transform((str) => new Date(str))]),
  disposalDate: z.union([z.date(), z.string().transform((str) => new Date(str))]).optional(),
  originalCost: z.string().refine((val) => !isNaN(Number(val)), "Must be a valid number"),
  adjustedBasis: z.string().refine((val) => !isNaN(Number(val)), "Must be a valid number"),
  recoveryPeriod: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, "Must be a positive number"),
});

export const insertDepreciationScheduleSchema = createInsertSchema(depreciationSchedules).omit({ id: true, createdAt: true }).extend({
  currentYearDepreciation: z.string().refine((val) => !isNaN(Number(val)), "Must be a valid number"),
  accumulatedDepreciation: z.string().refine((val) => !isNaN(Number(val)), "Must be a valid number"),
  remainingBasis: z.string().refine((val) => !isNaN(Number(val)), "Must be a valid number"),
});

// Tax-related types
export type DepreciationAsset = typeof depreciationAssets.$inferSelect;
export type InsertDepreciationAsset = z.infer<typeof insertDepreciationAssetSchema>;
export type DepreciationSchedule = typeof depreciationSchedules.$inferSelect;
export type InsertDepreciationSchedule = z.infer<typeof insertDepreciationScheduleSchema>;
