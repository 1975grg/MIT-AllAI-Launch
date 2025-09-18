import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { ObjectStorageService } from "./objectStorage";
import { 
  insertOrganizationSchema,
  insertOwnershipEntitySchema,
  insertPropertySchema,
  insertUnitSchema,
  insertTenantGroupSchema,
  insertTenantSchema,
  insertLeaseSchema,
  insertAssetSchema,
  insertSmartCaseSchema,
  insertVendorSchema,
  insertTransactionSchema,
  insertExpenseSchema,
  insertReminderSchema,
} from "@shared/schema";
import OpenAI from "openai";

// Revenue schema for API validation
const insertRevenueSchema = insertTransactionSchema;
import { startCronJobs } from "./cronJobs";

// Helper function to create equipment reminders
async function createEquipmentReminders({
  org,
  property,
  unit,
  unitData,
  storage
}: {
  org: any;
  property: any;
  unit: any;
  unitData: any;
  storage: any;
}) {
  const reminderPromises = [];
  
  // HVAC Reminder
  if (unitData.hvacReminder && unitData.hvacYear && unitData.hvacLifetime) {
    const replacementYear = unitData.hvacYear + unitData.hvacLifetime;
    const reminderDate = new Date(replacementYear - 1, 0, 1); // 1 year before
    
    const reminderData = {
      orgId: org.id,
      scope: "property" as const,
      scopeId: property.id,
      title: `HVAC System Replacement - ${property.address}`,
      description: `HVAC system installed in ${unitData.hvacYear} (${unitData.hvacBrand || 'Unknown'} ${unitData.hvacModel || ''}) is approaching its expected lifetime of ${unitData.hvacLifetime} years.`,
      type: "maintenance" as const,
      dueAt: reminderDate,
      leadDays: 365,
      channel: "inapp" as const,
      status: "Pending" as const,
    };
    
    reminderPromises.push(storage.createReminder(reminderData));
  }
  
  // Water Heater Reminder
  if (unitData.waterHeaterReminder && unitData.waterHeaterYear && unitData.waterHeaterLifetime) {
    const replacementYear = unitData.waterHeaterYear + unitData.waterHeaterLifetime;
    const reminderDate = new Date(replacementYear - 1, 0, 1); // 1 year before
    
    const reminderData = {
      orgId: org.id,
      scope: "property" as const,
      scopeId: property.id,
      title: `Water Heater Replacement - ${property.address}`,
      description: `Water heater installed in ${unitData.waterHeaterYear} (${unitData.waterHeaterBrand || 'Unknown'} ${unitData.waterHeaterModel || ''}) is approaching its expected lifetime of ${unitData.waterHeaterLifetime} years.`,
      type: "maintenance" as const,
      dueAt: reminderDate,
      leadDays: 365,
      channel: "inapp" as const,
      status: "Pending" as const,
    };
    
    reminderPromises.push(storage.createReminder(reminderData));
  }
  
  // Custom Appliance Reminders
  if (unitData.appliances) {
    for (const appliance of unitData.appliances) {
      if (appliance.alertBeforeExpiry && appliance.year && appliance.expectedLifetime) {
        const replacementYear = appliance.year + appliance.expectedLifetime;
        const reminderDate = new Date(replacementYear, 0, 1);
        reminderDate.setMonth(reminderDate.getMonth() - appliance.alertBeforeExpiry);
        
        const reminderData = {
          orgId: org.id,
          scope: "unit" as const,
          scopeId: unit.id,
          title: `${appliance.name} Replacement - ${property.address}`,
          description: `${appliance.name} installed in ${appliance.year} (${appliance.manufacturer || 'Unknown'} ${appliance.model || ''}) is approaching its expected lifetime of ${appliance.expectedLifetime} years.`,
          type: "maintenance" as const,
          dueAt: reminderDate,
          leadDays: appliance.alertBeforeExpiry * 30,
          channel: "inapp" as const,
          status: "Pending" as const,
        };
        
        reminderPromises.push(storage.createReminder(reminderData));
      }
    }
  }
  
  // Create all reminders
  await Promise.all(reminderPromises);
}

// Helper function to create recurring mortgage expense
async function createMortgageExpense({
  org,
  property,
  monthlyMortgage,
  mortgageStartDate,
  mortgageType = "Primary",
  storage
}: {
  org: any;
  property: any;
  monthlyMortgage: string;
  mortgageStartDate?: Date;
  mortgageType?: string;
  storage: any;
}) {
  try {
    // Use mortgageStartDate if provided, otherwise default to next month from today
    let firstPaymentDate;
    if (mortgageStartDate) {
      firstPaymentDate = new Date(mortgageStartDate);
    } else {
      // Default to first day of next month
      firstPaymentDate = new Date();
      firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1);
      firstPaymentDate.setDate(1);
    }
    
    // Set end date to sale date if property was sold, otherwise 30 years from first payment
    const endDate = property.saleDate ? new Date(property.saleDate) : new Date(firstPaymentDate);
    if (!property.saleDate) {
      endDate.setFullYear(endDate.getFullYear() + 30); // 30 years if no sale date
    }
    
    const mortgageExpenseData = {
      orgId: org.id,
      type: "Expense" as const,
      propertyId: property.id,
      scope: "property" as const,
      amount: monthlyMortgage,
      description: `${mortgageType === "Secondary" ? "Secondary " : ""}Mortgage payment for ${property.name || `${property.street}, ${property.city}`}`,
      category: "Mortgage",
      date: firstPaymentDate,
      isRecurring: true,
      recurringFrequency: "months",
      recurringInterval: 1,
      recurringEndDate: endDate,
      taxDeductible: false, // Will be adjusted at year-end with interest allocation
      isBulkEntry: false,
    };
    
    console.log("🏦 Creating recurring mortgage expense:", {
      propertyId: property.id,
      amount: monthlyMortgage,
      firstPayment: firstPaymentDate.toISOString(),
      endDate: endDate.toISOString()
    });
    
    await storage.createTransaction(mortgageExpenseData);
  } catch (error) {
    console.error("Error creating mortgage expense:", error);
    // Don't throw - we don't want mortgage expense creation to fail the property creation
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Start cron jobs
  startCronJobs();

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Organization routes
  app.get('/api/organizations/current', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      let org = await storage.getUserOrganization(userId);
      
      if (!org) {
        // Create default organization for user
        const user = await storage.getUser(userId);
        if (user) {
          org = await storage.createOrganization({
            name: `${user.firstName || user.email || 'User'}'s Properties`,
            ownerId: userId,
          });
        }
      }
      
      res.json(org);
    } catch (error) {
      console.error("Error fetching organization:", error);
      res.status(500).json({ message: "Failed to fetch organization" });
    }
  });

  // Helper function to create renewal reminder for an entity
  const createEntityRenewalReminder = async (entity: any, orgId: string) => {
    if (!entity.renewalMonth || entity.renewalMonth < 1 || entity.renewalMonth > 12) {
      return false;
    }

    const currentYear = new Date().getFullYear();
    let renewalYear = currentYear;
    
    // If renewal month has passed this year, set for next year
    const currentMonth = new Date().getMonth() + 1;
    if (entity.renewalMonth < currentMonth) {
      renewalYear = currentYear + 1;
    }
    
    // Set due date 30 days before renewal (1st of the month)
    const renewalDate = new Date(renewalYear, entity.renewalMonth - 1, 1);
    const reminderDate = new Date(renewalDate);
    reminderDate.setDate(reminderDate.getDate() - 30);
    
    const reminderData = {
      orgId: orgId,
      scope: "entity" as const,
      scopeId: entity.id,
      title: `${entity.name} Registration Renewal`,
      type: "regulatory" as const,
      dueAt: reminderDate,
      leadDays: 30,
      channel: "inapp" as const,
      status: "Pending" as const,
      isRecurring: false,
      recurringInterval: 1,
      isBulkEntry: false,
    };
    
    await storage.createReminder(reminderData);
    console.log(`Created renewal reminder for entity: ${entity.name}`);
    return true;
  };

  // Backfill reminders for existing entities
  app.post('/api/entities/backfill-reminders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const entities = await storage.getOwnershipEntities(org.id);
      const existingReminders = await storage.getReminders(org.id);
      
      let created = 0;
      for (const entity of entities) {
        if (entity.renewalMonth) {
          // Check if reminder already exists
          const hasRenewalReminder = existingReminders.some(r => 
            r.scope === "entity" && 
            r.scopeId === entity.id && 
            r.type === "regulatory" && 
            r.title.includes("Registration Renewal")
          );
          
          if (!hasRenewalReminder) {
            await createEntityRenewalReminder(entity, org.id);
            created++;
          }
        }
      }
      
      res.json({ message: `Created ${created} renewal reminders` });
    } catch (error) {
      console.error("Error backfilling reminders:", error);
      res.status(500).json({ message: "Failed to backfill reminders" });
    }
  });

  // Ownership entity routes
  app.get('/api/entities', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const entities = await storage.getOwnershipEntities(org.id);
      res.json(entities);
    } catch (error) {
      console.error("Error fetching entities:", error);
      res.status(500).json({ message: "Failed to fetch entities" });
    }
  });

  app.post('/api/entities', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const validatedData = insertOwnershipEntitySchema.parse({
        ...req.body,
        orgId: org.id,
      });
      
      const entity = await storage.createOwnershipEntity(validatedData);
      
      // Auto-create renewal reminder if entity has renewal month
      await createEntityRenewalReminder(entity, org.id);
      
      res.json(entity);
    } catch (error) {
      console.error("Error creating entity:", error);
      res.status(500).json({ message: "Failed to create entity" });
    }
  });

  app.patch('/api/entities/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const validatedData = insertOwnershipEntitySchema.partial().parse(req.body);
      const entity = await storage.updateOwnershipEntity(req.params.id, validatedData);
      
      // Auto-create/update renewal reminder if renewal month was changed
      if (validatedData.renewalMonth !== undefined && entity.renewalMonth && entity.renewalMonth >= 1 && entity.renewalMonth <= 12) {
        // Check if there's already a renewal reminder for this entity
        const existingReminders = await storage.getReminders(org.id);
        const existingRenewalReminder = existingReminders.find(r => 
          r.scope === "entity" && 
          r.scopeId === entity.id && 
          r.type === "regulatory" && 
          r.title.includes("Registration Renewal")
        );
        
        const currentYear = new Date().getFullYear();
        let renewalYear = currentYear;
        
        // If renewal month has passed this year, set for next year
        const currentMonth = new Date().getMonth() + 1;
        if (entity.renewalMonth < currentMonth) {
          renewalYear = currentYear + 1;
        }
        
        // Set due date 30 days before renewal (1st of the month)
        const renewalDate = new Date(renewalYear, entity.renewalMonth - 1, 1);
        const reminderDate = new Date(renewalDate);
        reminderDate.setDate(reminderDate.getDate() - 30);
        
        if (existingRenewalReminder) {
          // Update existing reminder
          await storage.updateReminder(existingRenewalReminder.id, {
            title: `${entity.name} Registration Renewal`,
            dueAt: reminderDate,
          });
          console.log(`Updated renewal reminder for entity: ${entity.name}`);
        } else {
          // Create new reminder
          const reminderData = {
            orgId: org.id,
            scope: "entity" as const,
            scopeId: entity.id,
            title: `${entity.name} Registration Renewal`,
            type: "regulatory" as const,
            dueAt: reminderDate,
            leadDays: 30,
            channel: "inapp" as const,
            status: "Pending" as const,
            isRecurring: false,
            recurringInterval: 1,
            isBulkEntry: false,
          };
          
          await storage.createReminder(reminderData);
          console.log(`Created renewal reminder for entity: ${entity.name}`);
        }
      }
      
      res.json(entity);
    } catch (error) {
      console.error("Error updating entity:", error);
      res.status(500).json({ message: "Failed to update entity" });
    }
  });

  // Archive an entity (set status to "Archived")  
  app.patch('/api/entities/:id/archive', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // SECURITY: Check if entity exists and belongs to organization
      const entities = await storage.getOwnershipEntities(org.id);
      const entity = entities.find(e => e.id === req.params.id);
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }
      
      // ARCHIVE PREVENTION: Check if entity owns any properties
      const propertyCheck = await storage.getEntityPropertyCount(req.params.id, org.id);
      if (propertyCheck.count > 0) {
        return res.status(400).json({ 
          message: "Cannot archive entity - owns properties",
          error: "ENTITY_OWNS_PROPERTIES",
          count: propertyCheck.count,
          properties: propertyCheck.properties,
          details: `${entity.name} owns ${propertyCheck.count} propert${propertyCheck.count === 1 ? 'y' : 'ies'}. Please reassign ownership before archiving.`
        });
      }
      
      const archivedEntity = await storage.updateOwnershipEntity(req.params.id, { status: "Archived" });
      res.json({ message: "Entity archived successfully", entity: archivedEntity });
    } catch (error) {
      console.error("Error archiving entity:", error);
      res.status(500).json({ message: "Failed to archive entity" });
    }
  });

  // Unarchive an entity (set status to "Active")
  app.patch('/api/entities/:id/unarchive', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // SECURITY: Check if entity exists and belongs to organization
      const entities = await storage.getOwnershipEntities(org.id);
      const entity = entities.find(e => e.id === req.params.id);
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }
      
      const unarchivedEntity = await storage.updateOwnershipEntity(req.params.id, { status: "Active" });
      res.json({ message: "Entity unarchived successfully", entity: unarchivedEntity });
    } catch (error) {
      console.error("Error unarchiving entity:", error);
      res.status(500).json({ message: "Failed to unarchive entity" });
    }
  });

  // Permanently delete an entity
  app.delete('/api/entities/:id/permanent', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // Check if entity exists and belongs to organization
      const entities = await storage.getOwnershipEntities(org.id);
      const entity = entities.find(e => e.id === req.params.id);
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }
      
      await storage.deleteOwnershipEntity(req.params.id);
      res.json({ message: "Entity deleted permanently" });
    } catch (error) {
      console.error("Error deleting entity:", error);
      res.status(500).json({ message: "Failed to delete entity" });
    }
  });

  app.get('/api/entities/:id/performance', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const performance = await storage.getEntityPerformance(req.params.id, org.id);
      if (!performance) {
        return res.status(404).json({ message: "Entity not found" });
      }
      
      res.json(performance);
    } catch (error) {
      console.error("Error fetching entity performance:", error);
      res.status(500).json({ message: "Failed to fetch entity performance" });
    }
  });

  // Get entity property ownership count
  app.get('/api/entities/:id/property-count', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // SECURITY: Check if entity exists and belongs to organization
      const entities = await storage.getOwnershipEntities(org.id);
      const entity = entities.find(e => e.id === req.params.id);
      if (!entity) {
        return res.status(404).json({ message: "Entity not found" });
      }
      
      const propertyCount = await storage.getEntityPropertyCount(req.params.id, org.id);
      res.json(propertyCount);
    } catch (error) {
      console.error("Error fetching entity property count:", error);
      res.status(500).json({ message: "Failed to fetch entity property count" });
    }
  });

  // Property routes
  app.get('/api/properties/:id/performance', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      const performance = await storage.getPropertyPerformance(req.params.id, org.id);
      if (!performance) return res.status(404).json({ message: "Property not found" });

      res.json(performance);
    } catch (error) {
      console.error("Error fetching property performance:", error);
      res.status(500).json({ message: "Failed to fetch property performance" });
    }
  });
  app.get('/api/properties', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // Disable caching for this endpoint
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Expires', '0');
      res.set('Pragma', 'no-cache');
      res.set('Surrogate-Control', 'no-store');
      
      const properties = await storage.getProperties(org.id);
      
      console.log("🏠 GET /api/properties response sample:", JSON.stringify(properties[0], null, 2));
      
      res.json(properties);
    } catch (error) {
      console.error("Error fetching properties:", error);
      res.status(500).json({ message: "Failed to fetch properties" });
    }
  });

  app.get('/api/properties/:id', isAuthenticated, async (req: any, res) => {
    try {
      const property = await storage.getProperty(req.params.id);
      if (!property) return res.status(404).json({ message: "Property not found" });
      
      res.json(property);
    } catch (error) {
      console.error("Error fetching property:", error);
      res.status(500).json({ message: "Failed to fetch property" });
    }
  });

  app.post('/api/properties', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const { ownerships, createDefaultUnit, defaultUnit, units, ...propertyData } = req.body;
      
      // Transform date strings to Date objects for validation
      const dataWithDates = {
        ...propertyData,
        orgId: org.id,
        acquisitionDate: propertyData.acquisitionDate ? new Date(propertyData.acquisitionDate) : undefined,
        mortgageStartDate: propertyData.mortgageStartDate ? new Date(propertyData.mortgageStartDate) : undefined,
        mortgageStartDate2: propertyData.mortgageStartDate2 ? new Date(propertyData.mortgageStartDate2) : undefined,
        saleDate: propertyData.saleDate ? new Date(propertyData.saleDate) : undefined,
      };
      
      const validatedData = insertPropertySchema.parse(dataWithDates);
      
      // Check if we have multiple units (for buildings)
      if (units && Array.isArray(units) && units.length > 0) {
        console.log(`🏢 Creating building with ${units.length} units`);
        const result = await storage.createPropertyWithOwnershipsAndUnits(
          validatedData, 
          ownerships, 
          units
        );
        
        // Auto-create primary mortgage expense if mortgage details provided
        if (validatedData.monthlyMortgage) {
          await createMortgageExpense({
            org,
            property: result.property,
            monthlyMortgage: validatedData.monthlyMortgage,
            mortgageStartDate: validatedData.mortgageStartDate || undefined,
            mortgageType: "Primary",
            storage
          });
        }

        // Auto-create secondary mortgage expense if provided
        if (validatedData.monthlyMortgage2) {
          await createMortgageExpense({
            org,
            property: result.property,
            monthlyMortgage: validatedData.monthlyMortgage2,
            mortgageStartDate: validatedData.mortgageStartDate2 || undefined,
            mortgageType: "Secondary",
            storage
          });
        }
        
        res.json({ property: result.property, units: result.units });
      }
      // Check if we should create a single default unit
      else if (createDefaultUnit && defaultUnit) {
        console.log("🏠 Creating single property with default unit");
        const result = await storage.createPropertyWithOwnershipsAndUnit(
          validatedData, 
          ownerships, 
          defaultUnit
        );
        
        // Auto-create primary mortgage expense if mortgage details provided
        if (validatedData.monthlyMortgage) {
          await createMortgageExpense({
            org,
            property: result.property,
            monthlyMortgage: validatedData.monthlyMortgage,
            mortgageStartDate: validatedData.mortgageStartDate || undefined,
            mortgageType: "Primary",
            storage
          });
        }

        // Auto-create secondary mortgage expense if provided
        if (validatedData.monthlyMortgage2) {
          await createMortgageExpense({
            org,
            property: result.property,
            monthlyMortgage: validatedData.monthlyMortgage2,
            mortgageStartDate: validatedData.mortgageStartDate2 || undefined,
            mortgageType: "Secondary",
            storage
          });
        }
        
        res.json({ property: result.property, unit: result.unit });
      } else {
        console.log("🏗️ Creating property without units");
        // Use the old method for just property creation
        const property = await storage.createPropertyWithOwnerships(validatedData, ownerships);
        
        // Auto-create mortgage expense if mortgage details provided
        if (validatedData.monthlyMortgage) {
          await createMortgageExpense({
            org,
            property,
            monthlyMortgage: validatedData.monthlyMortgage,
            mortgageStartDate: validatedData.mortgageStartDate || undefined,
            mortgageType: "Primary",
            storage
          });
        }

        // Auto-create secondary mortgage expense if provided
        if (validatedData.monthlyMortgage2) {
          await createMortgageExpense({
            org,
            property,
            monthlyMortgage: validatedData.monthlyMortgage2,
            mortgageStartDate: validatedData.mortgageStartDate2 || undefined,
            mortgageType: "Secondary",
            storage
          });
        }
        
        res.json({ property, unit: null });
      }
    } catch (error) {
      console.error("Error creating property:", error);
      res.status(500).json({ message: "Failed to create property" });
    }
  });

  app.patch('/api/properties/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const { ownerships, defaultUnit, units, ...propertyData } = req.body;
      
      console.log("🏠 Updating property ID:", req.params.id);
      console.log("🔧 Has unit data:", !!defaultUnit);
      console.log("🏢 Has multiple units data:", !!(units && Array.isArray(units) && units.length > 0));
      if (defaultUnit) {
        console.log("📋 Unit details:", {
          hasId: !!defaultUnit.id,
          hvacBrand: defaultUnit.hvacBrand,
          hvacModel: defaultUnit.hvacModel,
          label: defaultUnit.label
        });
      }
      if (units && Array.isArray(units)) {
        console.log("📋 Multiple units count:", units.length);
      }
      
      // Validate the property data (excluding required fields for updates)
      const updatePropertySchema = insertPropertySchema.partial().omit({ orgId: true });
      
      console.log("🔍 Raw property data:", JSON.stringify(propertyData, null, 2));
      console.log("🔍 Property value fields:", {
        propertyValue: propertyData.propertyValue,
        autoAppreciation: propertyData.autoAppreciation,
        appreciationRate: propertyData.appreciationRate
      });
      
      // Transform date strings to Date objects for validation
      const propertyDataWithDates = {
        ...propertyData,
        acquisitionDate: propertyData.acquisitionDate ? new Date(propertyData.acquisitionDate) : undefined,
        mortgageStartDate: propertyData.mortgageStartDate ? new Date(propertyData.mortgageStartDate) : undefined,
        mortgageStartDate2: propertyData.mortgageStartDate2 ? new Date(propertyData.mortgageStartDate2) : undefined,
        saleDate: propertyData.saleDate ? new Date(propertyData.saleDate) : undefined,
      };
      
      const validatedData = updatePropertySchema.parse(propertyDataWithDates);
      
      console.log("✅ Validated data:", JSON.stringify(validatedData, null, 2));
      console.log("✅ Validated value fields:", {
        propertyValue: validatedData.propertyValue,
        autoAppreciation: validatedData.autoAppreciation,
        appreciationRate: validatedData.appreciationRate
      });
      
      // Update property and ownerships
      const property = await storage.updatePropertyWithOwnerships(req.params.id, validatedData, ownerships);
      
      // Handle multiple units update for buildings
      if (units && Array.isArray(units) && units.length > 0) {
        console.log("🏢 Updating building with multiple units");
        
        // Get existing units
        const existingUnits = await storage.getUnits(req.params.id);
        console.log("🔍 Existing units count:", existingUnits.length);
        
        // Delete all existing units
        for (const existingUnit of existingUnits) {
          console.log("🗑️ Deleting existing unit:", existingUnit.id);
          await storage.deleteUnit(existingUnit.id);
        }
        
        // Create new units
        const createdUnits = [];
        for (const unitData of units) {
          console.log("➕ Creating new unit:", unitData.label);
          const unitInsertData = {
            propertyId: req.params.id,
            label: unitData.label || 'Unit',
            bedrooms: unitData.bedrooms,
            bathrooms: unitData.bathrooms,
            sqft: unitData.sqft,
            rentAmount: unitData.rentAmount ? String(unitData.rentAmount) : undefined,
            deposit: unitData.deposit ? String(unitData.deposit) : undefined,
            notes: unitData.notes,
            hvacBrand: unitData.hvacBrand,
            hvacModel: unitData.hvacModel,
            hvacYear: unitData.hvacYear,
            hvacLifetime: unitData.hvacLifetime,
            hvacReminder: unitData.hvacReminder,
            waterHeaterBrand: unitData.waterHeaterBrand,
            waterHeaterModel: unitData.waterHeaterModel,
            waterHeaterYear: unitData.waterHeaterYear,
            waterHeaterLifetime: unitData.waterHeaterLifetime,
            waterHeaterReminder: unitData.waterHeaterReminder,
            applianceNotes: unitData.applianceNotes,
          };
          
          const newUnit = await storage.createUnit(unitInsertData);
          createdUnits.push(newUnit);
          
          // Handle custom appliances for this unit
          if (unitData.appliances && unitData.appliances.length > 0) {
            for (const appliance of unitData.appliances) {
              await storage.createUnitAppliance({
                unitId: newUnit.id,
                name: appliance.name,
                manufacturer: appliance.manufacturer,
                model: appliance.model,
                year: appliance.year,
                expectedLifetime: appliance.expectedLifetime,
                alertBeforeExpiry: appliance.alertBeforeExpiry,
                notes: appliance.notes,
              });
            }
          }
        }
        
        console.log("✅ Successfully updated building with", createdUnits.length, "units");
        res.json({ property, units: createdUnits });
        return;
      }
      
      // Handle single unit update if provided  
      let updatedUnit = null;
      if (defaultUnit) {
        // Check if we have an explicit unit ID or if there are existing units for this property
        const existingUnits = await storage.getUnits(req.params.id);
        console.log("🔍 Existing units count:", existingUnits.length);
        console.log("🔍 Existing unit IDs:", existingUnits.map(u => u.id));
        
        if (existingUnits.length > 0) {
          // Always update the first existing unit
          const targetUnitId = defaultUnit.id || existingUnits[0].id;
          console.log("✏️ Updating existing unit ID:", targetUnitId);
          // Update existing unit with appliance data
          const unitData = {
          label: defaultUnit.label,
          bedrooms: defaultUnit.bedrooms || undefined,
          bathrooms: defaultUnit.bathrooms ? defaultUnit.bathrooms.toString() : undefined,
          sqft: defaultUnit.sqft || undefined,
          rentAmount: defaultUnit.rentAmount || undefined,
          deposit: defaultUnit.deposit || undefined,
          notes: defaultUnit.notes,
          hvacBrand: defaultUnit.hvacBrand,
          hvacModel: defaultUnit.hvacModel,
          hvacYear: defaultUnit.hvacYear || undefined,
          hvacLifetime: defaultUnit.hvacLifetime || undefined,
          hvacReminder: defaultUnit.hvacReminder,
          waterHeaterBrand: defaultUnit.waterHeaterBrand,
          waterHeaterModel: defaultUnit.waterHeaterModel,
          waterHeaterYear: defaultUnit.waterHeaterYear || undefined,
          waterHeaterLifetime: defaultUnit.waterHeaterLifetime || undefined,
          waterHeaterReminder: defaultUnit.waterHeaterReminder,
          applianceNotes: defaultUnit.applianceNotes,
        };
        
        updatedUnit = await storage.updateUnit(targetUnitId, unitData);
        
        // Update custom appliances
        if (defaultUnit.appliances) {
          // Delete existing appliances and recreate
          await storage.deleteUnitAppliances(targetUnitId);
          
          for (const appliance of defaultUnit.appliances) {
            await storage.createUnitAppliance({
              unitId: targetUnitId,
              name: appliance.name,
              manufacturer: appliance.manufacturer,
              model: appliance.model,
              year: appliance.year,
              expectedLifetime: appliance.expectedLifetime,
              alertBeforeExpiry: appliance.alertBeforeExpiry,
              notes: appliance.notes,
            });
          }
        }
        } else {
          // Create new unit with equipment data if none exists  
          console.log("📦 Creating new unit for property:", req.params.id);
          const unitData = {
            propertyId: req.params.id,
            label: defaultUnit.label || "Unit 1", // Default label if not provided
            bedrooms: defaultUnit.bedrooms || undefined,
            bathrooms: defaultUnit.bathrooms ? defaultUnit.bathrooms.toString() : undefined,
            sqft: defaultUnit.sqft || undefined,
            rentAmount: defaultUnit.rentAmount || undefined,
            deposit: defaultUnit.deposit || undefined,
            notes: defaultUnit.notes,
            hvacBrand: defaultUnit.hvacBrand,
            hvacModel: defaultUnit.hvacModel,
            hvacYear: defaultUnit.hvacYear || undefined,
            hvacLifetime: defaultUnit.hvacLifetime || undefined,
            hvacReminder: defaultUnit.hvacReminder,
            waterHeaterBrand: defaultUnit.waterHeaterBrand,
            waterHeaterModel: defaultUnit.waterHeaterModel,
            waterHeaterYear: defaultUnit.waterHeaterYear || undefined,
            waterHeaterLifetime: defaultUnit.waterHeaterLifetime || undefined,
            waterHeaterReminder: defaultUnit.waterHeaterReminder,
            applianceNotes: defaultUnit.applianceNotes,
          };
          
          updatedUnit = await storage.createUnit(unitData);
          
          // Add custom appliances to new unit
          if (defaultUnit.appliances && defaultUnit.appliances.length > 0) {
            for (const appliance of defaultUnit.appliances) {
              await storage.createUnitAppliance({
                unitId: updatedUnit.id,
                name: appliance.name,
                manufacturer: appliance.manufacturer,
                model: appliance.model,
                year: appliance.year,
                expectedLifetime: appliance.expectedLifetime,
                alertBeforeExpiry: appliance.alertBeforeExpiry,
                notes: appliance.notes,
              });
            }
          }
        }
        
        // Create equipment reminders if requested
        await createEquipmentReminders({
          org,
          property,
          unit: updatedUnit,
          unitData: defaultUnit,
          storage
        });
      }

      // Auto-create primary mortgage expense if mortgage details provided in update
      if (validatedData.monthlyMortgage) {
        await createMortgageExpense({
          org,
          property,
          monthlyMortgage: validatedData.monthlyMortgage,
          mortgageStartDate: validatedData.mortgageStartDate || undefined,
          mortgageType: "Primary",
          storage
        });
      }

      // Auto-create secondary mortgage expense if provided in update
      if (validatedData.monthlyMortgage2) {
        await createMortgageExpense({
          org,
          property,
          monthlyMortgage: validatedData.monthlyMortgage2,
          mortgageStartDate: validatedData.mortgageStartDate2 || undefined,
          mortgageType: "Secondary",
          storage
        });
      }
      
      res.json({ property, unit: updatedUnit });
    } catch (error) {
      console.error("Error updating property:", error);
      res.status(500).json({ message: "Failed to update property" });
    }
  });

  // Archive a property (set status to "Archived")
  app.patch('/api/properties/:id/archive', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // SECURITY: Check if property exists and belongs to organization  
      const property = await storage.getProperty(req.params.id);
      if (!property || property.orgId !== org.id) {
        return res.status(404).json({ message: "Property not found" });
      }
      
      const archivedProperty = await storage.updateProperty(req.params.id, { status: "Archived" });
      res.json({ message: "Property archived successfully", property: archivedProperty });
    } catch (error) {
      console.error("Error archiving property:", error);
      res.status(500).json({ message: "Failed to archive property" });
    }
  });

  // Unarchive a property (set status back to "Active")
  app.patch('/api/properties/:id/unarchive', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // Verify property exists and user owns it
      const property = await storage.getProperty(req.params.id);
      if (!property || property.orgId !== org.id) {
        return res.status(404).json({ message: "Property not found" });
      }
      
      const unarchivedProperty = await storage.updateProperty(req.params.id, { status: "Active" });
      res.json({ message: "Property unarchived successfully", property: unarchivedProperty });
    } catch (error) {
      console.error("Error unarchiving property:", error);
      res.status(500).json({ message: "Failed to unarchive property" });
    }
  });

  // Permanently delete a property
  app.delete('/api/properties/:id/permanent', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // Check if property exists and belongs to organization
      const property = await storage.getProperty(req.params.id);
      if (!property || property.orgId !== org.id) {
        return res.status(404).json({ message: "Property not found" });
      }
      
      await storage.deleteProperty(req.params.id);
      res.json({ message: "Property deleted permanently" });
    } catch (error) {
      console.error("Error deleting property:", error);
      res.status(500).json({ message: "Failed to delete property" });
    }
  });

  // Unit routes
  app.get('/api/units', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const units = await storage.getAllUnits(org.id);
      res.json(units);
    } catch (error) {
      console.error("Error fetching all units:", error);
      res.status(500).json({ message: "Failed to fetch units" });
    }
  });

  // Get appliances for a specific unit
  app.get('/api/units/:id/appliances', isAuthenticated, async (req: any, res) => {
    try {
      const appliances = await storage.getUnitAppliances(req.params.id);
      res.json(appliances);
    } catch (error) {
      console.error("Error fetching unit appliances:", error);
      res.status(500).json({ message: "Failed to fetch appliances" });
    }
  });

  app.get('/api/properties/:propertyId/units', isAuthenticated, async (req: any, res) => {
    try {
      const units = await storage.getUnits(req.params.propertyId);
      res.json(units);
    } catch (error) {
      console.error("Error fetching units:", error);
      res.status(500).json({ message: "Failed to fetch units" });
    }
  });

  app.post('/api/units', isAuthenticated, async (req: any, res) => {
    try {
      const validatedData = insertUnitSchema.parse(req.body);
      const unit = await storage.createUnit(validatedData);
      res.json(unit);
    } catch (error) {
      console.error("Error creating unit:", error);
      res.status(500).json({ message: "Failed to create unit" });
    }
  });

  // Tenant routes
  app.get('/api/tenants', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const tenantGroups = await storage.getTenantGroups(org.id);
      res.json(tenantGroups);
    } catch (error) {
      console.error("Error fetching tenants:", error);
      res.status(500).json({ message: "Failed to fetch tenants" });
    }
  });

  // Get tenants for a specific group
  app.get('/api/tenants/:groupId/members', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const { groupId } = req.params;
      const tenants = await storage.getTenantsInGroup(groupId);
      res.json(tenants);
    } catch (error) {
      console.error("Error fetching tenants for group:", error);
      res.status(500).json({ message: "Failed to fetch tenants for group" });
    }
  });

  app.post('/api/tenants', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const { tenantGroup, tenants } = req.body;
      const { unitId, ...tenantGroupData } = tenantGroup; // Extract unitId for lease creation
      
      const validatedGroup = insertTenantGroupSchema.parse({
        ...tenantGroupData,
        orgId: org.id,
      });
      
      const group = await storage.createTenantGroup(validatedGroup);
      
      if (tenants && tenants.length > 0) {
        for (const tenant of tenants) {
          const validatedTenant = insertTenantSchema.parse({
            ...tenant,
            groupId: group.id,
          });
          await storage.createTenant(validatedTenant);
        }
      }

      // If unitId is provided (for buildings), automatically create a lease
      if (unitId) {
        console.log(`🏢 Creating lease for tenant group ${group.id} in unit ${unitId}`);
        
        // Create a basic lease with default values
        // The user can edit lease details later if needed
        const today = new Date();
        const oneYearFromToday = new Date(today);
        oneYearFromToday.setFullYear(today.getFullYear() + 1);
        
        const defaultLease = {
          unitId: unitId,
          tenantGroupId: group.id,
          startDate: today, // Use Date object directly
          endDate: oneYearFromToday, // Use Date object directly
          rent: "0", // Default rent - user can update later
          deposit: "0", // Default deposit - user can update later
          dueDay: 1,
          status: "Active" as const,
          // New renewal and reminder options with sensible defaults
          autoRenewEnabled: false, // Default: no automatic renewal
          expirationReminderMonths: 3, // Default: 3 months before expiration
          renewalReminderEnabled: false, // Default: no renewal notifications
        };
        
        try {
          const validatedLease = insertLeaseSchema.parse(defaultLease);
          const createdLease = await storage.createLease(validatedLease);
          
          // Create lease reminders for automatic leases too
          await createLeaseReminders(org.id, createdLease);
          
          console.log(`✅ Successfully created lease for unit ${unitId}`);
        } catch (leaseError) {
          console.error("Error creating lease:", leaseError);
          // Don't fail the entire tenant creation if lease creation fails
          // The user can create the lease manually later
        }
      }
      
      res.json(group);
    } catch (error) {
      console.error("Error creating tenant:", error);
      res.status(500).json({ message: "Failed to create tenant" });
    }
  });

  app.put('/api/tenants/:groupId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const { groupId } = req.params;
      const { tenantGroup, tenants } = req.body;
      
      // Update tenant group
      const validatedGroup = insertTenantGroupSchema.partial().parse(tenantGroup);
      const updatedGroup = await storage.updateTenantGroup(groupId, validatedGroup);
      
      // Update individual tenants if provided
      if (tenants && tenants.length > 0) {
        for (const tenant of tenants) {
          if (tenant.id) {
            // Update existing tenant
            const validatedTenant = insertTenantSchema.partial().parse(tenant);
            await storage.updateTenant(tenant.id, validatedTenant);
          } else {
            // Create new tenant
            const validatedTenant = insertTenantSchema.parse({
              ...tenant,
              groupId: groupId,
            });
            await storage.createTenant(validatedTenant);
          }
        }
      }
      
      res.json(updatedGroup);
    } catch (error) {
      console.error("Error updating tenant:", error);
      res.status(500).json({ message: "Failed to update tenant" });
    }
  });

  // Archive a tenant group
  app.patch('/api/tenants/:groupId/archive', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const { groupId } = req.params;
      
      // SECURITY: Check if tenant group exists and belongs to organization
      const tenantGroup = await storage.getTenantGroup(groupId);
      if (!tenantGroup || tenantGroup.orgId !== org.id) {
        return res.status(404).json({ message: "Tenant group not found" });
      }
      
      // Archive the tenant group
      const archivedTenant = await storage.archiveTenantGroup(groupId);
      
      res.json({ message: "Tenant archived successfully", tenant: archivedTenant });
    } catch (error) {
      console.error("Error archiving tenant:", error);
      res.status(500).json({ message: "Failed to archive tenant" });
    }
  });

  // Unarchive a tenant group  
  app.patch('/api/tenants/:groupId/unarchive', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const { groupId } = req.params;
      
      // SECURITY: Check if tenant group exists and belongs to organization
      const tenantGroup = await storage.getTenantGroup(groupId);
      if (!tenantGroup || tenantGroup.orgId !== org.id) {
        return res.status(404).json({ message: "Tenant group not found" });
      }
      
      // Unarchive the tenant group (set status to "Active")
      const unarchivedTenant = await storage.unarchiveTenantGroup(groupId);
      
      res.json({ message: "Tenant unarchived successfully", tenant: unarchivedTenant });
    } catch (error) {
      console.error("Error unarchiving tenant:", error);
      res.status(500).json({ message: "Failed to unarchive tenant" });
    }
  });

  app.delete('/api/tenants/:groupId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const { groupId } = req.params;
      
      // Archive the tenant group instead of deleting
      const archivedTenant = await storage.archiveTenantGroup(groupId);
      
      res.json({ message: "Tenant archived successfully", tenant: archivedTenant });
    } catch (error) {
      console.error("Error archiving tenant:", error);
      res.status(500).json({ message: "Failed to archive tenant" });
    }
  });

  // Permanently delete a tenant group
  app.delete('/api/tenant-groups/:id/permanent', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const { id } = req.params;
      
      // SECURITY: Check if tenant group exists and belongs to organization
      const tenantGroup = await storage.getTenantGroup(id);
      if (!tenantGroup || tenantGroup.orgId !== org.id) {
        return res.status(404).json({ message: "Tenant group not found" });
      }
      
      await storage.deleteTenantGroup(id);
      res.json({ message: "Tenant group deleted permanently" });
    } catch (error) {
      console.error("Error deleting tenant group:", error);
      res.status(500).json({ message: "Failed to delete tenant group" });
    }
  });

  // Individual Tenant Archive/Unarchive endpoints (separate from tenant groups)
  // Archive a tenant (set status to "Archived")
  app.patch('/api/tenants/:id/archive', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // SECURITY: Verify tenant exists and belongs to organization by checking relationships
      // This also validates the tenant exists and belongs to the org
      try {
        await storage.getTenantRelationshipCount(req.params.id, org.id);
      } catch (error) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      const archivedTenant = await storage.archiveTenant(req.params.id);
      res.json({ message: "Tenant archived successfully", tenant: archivedTenant });
    } catch (error) {
      console.error("Error archiving tenant:", error);
      res.status(500).json({ message: "Failed to archive tenant" });
    }
  });

  // Unarchive a tenant (set status to "Active")
  app.patch('/api/tenants/:id/unarchive', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // SECURITY: Verify tenant exists and belongs to organization by checking relationships
      // This also validates the tenant exists and belongs to the org
      try {
        await storage.getTenantRelationshipCount(req.params.id, org.id);
      } catch (error) {
        return res.status(404).json({ message: "Tenant not found" });
      }
      
      const unarchivedTenant = await storage.unarchiveTenant(req.params.id);
      res.json({ message: "Tenant unarchived successfully", tenant: unarchivedTenant });
    } catch (error) {
      console.error("Error unarchiving tenant:", error);
      res.status(500).json({ message: "Failed to unarchive tenant" });
    }
  });

  // Get tenant relationship count for delete safety check
  app.get('/api/tenants/:id/relationship-count', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const count = await storage.getTenantRelationshipCount(req.params.id, org.id);
      res.json(count);
    } catch (error) {
      console.error("Error getting tenant relationship count:", error);
      res.status(500).json({ message: "Failed to get tenant relationships" });
    }
  });

  // Permanently delete a tenant (only if no relationships)
  app.delete('/api/tenants/:id/permanent', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // DELETE PREVENTION: Check if tenant has any relationships (also validates tenant exists and belongs to org)
      const relationshipCheck = await storage.getTenantRelationshipCount(req.params.id, org.id);
      if (relationshipCheck.count > 0) {
        return res.status(400).json({ 
          message: "Cannot delete tenant - has relationships",
          error: "TENANT_HAS_RELATIONSHIPS",
          count: relationshipCheck.count,
          relationships: relationshipCheck.relationships,
          details: `Tenant has ${relationshipCheck.count} relationship${relationshipCheck.count === 1 ? '' : 's'}. Please archive instead of deleting.`
        });
      }
      
      await storage.permanentDeleteTenant(req.params.id);
      res.json({ message: "Tenant deleted permanently" });
    } catch (error) {
      console.error("Error deleting tenant:", error);
      res.status(500).json({ message: "Failed to delete tenant" });
    }
  });

  // Lease routes
  app.get('/api/leases', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const leases = await storage.getLeases(org.id);
      res.json(leases);
    } catch (error) {
      console.error("Error fetching leases:", error);
      res.status(500).json({ message: "Failed to fetch leases" });
    }
  });

  app.post('/api/leases', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // Convert date strings to Date objects before validation
      const requestData = {
        ...req.body,
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate),
      };
      
      // Handle missing unitId for single-family properties
      if (!requestData.unitId) {
        // Get tenant group to find property
        const tenantGroup = await storage.getTenantGroup(requestData.tenantGroupId);
        if (!tenantGroup?.propertyId) {
          return res.status(400).json({ message: "Tenant group has no associated property" });
        }

        // Get property to check type
        const property = await storage.getProperty(tenantGroup.propertyId);
        if (!property || property.orgId !== org.id) {
          return res.status(400).json({ message: "Property not found or access denied" });
        }

        // Check if property already has units
        const existingUnits = await storage.getUnits(property.id);
        
        if (existingUnits.length === 0) {
          // For single-family properties (non-buildings), auto-create a default unit
          const isBuilding = property.type === "Residential Building" || property.type === "Commercial Building";
          
          if (!isBuilding) {
            console.log("🏠 Auto-creating default unit for single-family property:", property.id);
            // Create a default unit for the property
            const defaultUnitData = {
              propertyId: property.id,
              label: "Main Unit",
              sqft: property.sqft || undefined,
            };
            
            const unit = await storage.createUnit(defaultUnitData);
            requestData.unitId = unit.id;
          } else {
            return res.status(400).json({ message: "Building property requires specific unit selection" });
          }
        } else {
          // Use the first available unit for single-family properties
          requestData.unitId = existingUnits[0].id;
          console.log("🏠 Auto-selecting existing unit for property:", existingUnits[0].id);
        }
      }
      
      const validatedData = insertLeaseSchema.parse(requestData);
      const lease = await storage.createLease(validatedData);
      
      // Create lease reminder(s) if enabled
      await createLeaseReminders(org.id, lease);
      
      // CRITICAL: Create recurring rent revenue transaction
      await createLeaseRentRevenue(org.id, lease);
      
      res.json(lease);
    } catch (error) {
      console.error("Error creating lease:", error);
      res.status(500).json({ message: "Failed to create lease" });
    }
  });

  // Update existing lease
  app.put('/api/leases/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const leaseId = req.params.id;
      
      // Get existing lease for comparison
      const existingLease = await storage.getLease(leaseId);
      if (!existingLease) {
        return res.status(404).json({ message: "Lease not found" });
      }
      
      // Verify existing lease belongs to user's organization
      const existingUnit = await storage.getUnit(existingLease.unitId);
      if (!existingUnit) {
        return res.status(404).json({ message: "Unit not found for lease" });
      }
      const existingProperty = await storage.getProperty(existingUnit.propertyId);
      if (!existingProperty || existingProperty.orgId !== org.id) {
        return res.status(403).json({ message: "Access denied to existing lease" });
      }
      
      // SECURITY: Validate new unitId belongs to same organization if provided
      if (req.body.unitId && req.body.unitId !== existingLease.unitId) {
        const newUnit = await storage.getUnit(req.body.unitId);
        if (!newUnit) {
          return res.status(400).json({ message: "New unit not found" });
        }
        const newProperty = await storage.getProperty(newUnit.propertyId);
        if (!newProperty || newProperty.orgId !== org.id) {
          console.warn(`🚨 SECURITY: User ${userId} attempted to move lease ${leaseId} to unit ${req.body.unitId} from different organization`);
          return res.status(403).json({ message: "Access denied - new unit belongs to different organization" });
        }
      }
      
      // SECURITY: Validate new tenantGroupId belongs to same organization if provided
      if (req.body.tenantGroupId && req.body.tenantGroupId !== existingLease.tenantGroupId) {
        const tenantGroups = await storage.getTenantGroups(org.id);
        const newTenantGroup = tenantGroups.find(tg => tg.id === req.body.tenantGroupId);
        if (!newTenantGroup) {
          console.warn(`🚨 SECURITY: User ${userId} attempted to move lease ${leaseId} to tenant group ${req.body.tenantGroupId} from different organization`);
          return res.status(403).json({ message: "Access denied - tenant group belongs to different organization" });
        }
      }
      
      // Convert date strings to Date objects before validation - only when present
      const requestData = { ...req.body };
      
      // Only convert startDate if provided and validate it
      if (req.body.startDate) {
        requestData.startDate = new Date(req.body.startDate);
        if (isNaN(requestData.startDate.getTime())) {
          return res.status(400).json({ message: "Invalid start date format" });
        }
      }
      
      // Only convert endDate if provided and validate it
      if (req.body.endDate) {
        requestData.endDate = new Date(req.body.endDate);
        if (isNaN(requestData.endDate.getTime())) {
          return res.status(400).json({ message: "Invalid end date format" });
        }
      }
      
      // SECURITY: Override orgId from request body with validated org.id to prevent tampering
      delete requestData.orgId;
      
      // Use partial validation schema for updates instead of full insert schema
      const partialLeaseSchema = insertLeaseSchema.partial();
      const validatedData = partialLeaseSchema.parse(requestData);
      
      // Update the lease
      const updatedLease = await storage.updateLease(leaseId, validatedData);
      
      // Handle side effects of lease modifications
      await handleLeaseModificationSideEffects(org.id, existingLease, updatedLease);
      
      console.log(`✅ SECURITY: User ${userId} successfully updated lease ${leaseId} in org ${org.id}`);
      res.json(updatedLease);
    } catch (error) {
      console.error("Error updating lease:", error);
      res.status(500).json({ message: "Failed to update lease" });
    }
  });

  // Helper function to handle side effects when lease is modified
  async function handleLeaseModificationSideEffects(orgId: string, oldLease: any, newLease: any) {
    try {
      // CRITICAL: Handle manual lease termination with comprehensive financial cleanup
      if (oldLease.status !== "Terminated" && newLease.status === "Terminated") {
        console.log(`🏠 Manual lease termination detected - performing comprehensive financial cleanup for lease ${newLease.id}`);
        
        // Use our comprehensive cleanup functions from storage
        await storage.cancelLeaseRecurringRevenue(newLease.id);
        await storage.cancelLeaseReminders(newLease.id);
        
        console.log(`✅ Manual lease termination completed with full financial side-effects cleanup for lease ${newLease.id}`);
        return; // Skip other side effects since lease is now terminated
      }
      
      // Only process other side effects if lease is not terminated
      if (newLease.status === "Terminated") {
        console.log(`ℹ️ Skipping lease modification side effects for terminated lease ${newLease.id}`);
        return;
      }
      
      // 1. Handle rent changes - update recurring revenue
      if (oldLease.rent !== newLease.rent || 
          oldLease.dueDay !== newLease.dueDay ||
          new Date(oldLease.endDate).getTime() !== new Date(newLease.endDate).getTime()) {
        
        console.log(`🔄 Lease modification detected - updating recurring revenue for lease ${newLease.id}`);
        await updateLeaseRecurringRevenue(orgId, oldLease, newLease);
      }
      
      // 2. Handle reminder changes - update lease reminders
      if (oldLease.expirationReminderMonths !== newLease.expirationReminderMonths ||
          oldLease.renewalReminderEnabled !== newLease.renewalReminderEnabled ||
          new Date(oldLease.endDate).getTime() !== new Date(newLease.endDate).getTime()) {
        
        console.log(`🔔 Lease dates/reminder settings changed - updating reminders for lease ${newLease.id}`);
        await updateLeaseReminders(orgId, oldLease, newLease);
      }
      
    } catch (error) {
      console.error("Error handling lease modification side effects:", error);
      // Don't fail the lease update if side effects fail
    }
  }

  // Helper function to update recurring revenue when lease is modified
  async function updateLeaseRecurringRevenue(orgId: string, oldLease: any, newLease: any) {
    try {
      // Find existing recurring revenue transactions for this lease using robust matching
      const transactions = await storage.getTransactions(orgId);
      
      // Use multiple criteria to find lease-related transactions more reliably
      const existingRentTransactions = transactions.filter(t => {
        // Primary matching criteria
        const basicMatch = t.type === "Income" && 
                           t.category === "Rental Income" && 
                           t.isRecurring;
        
        // Enhanced matching with multiple patterns for robustness
        const leaseIdPatterns = [
          `lease ${newLease.id}`,  // Current format
          `lease ${oldLease.id}`,  // In case ID changed (shouldn't happen but safer)
          `leaseId: ${newLease.id}`, // Alternative format
          `lease-${newLease.id}`,   // Alternative format
        ];
        
        const notesMatch = leaseIdPatterns.some(pattern => 
          t.notes?.toLowerCase().includes(pattern.toLowerCase())
        );
        
        // Additional validation criteria
        const unitMatch = t.unitId === newLease.unitId || t.unitId === oldLease.unitId;
        const amountMatch = Math.abs(parseFloat(t.amount) - parseFloat(oldLease.rent)) < 0.01; // Allow for rounding differences
        
        return basicMatch && (notesMatch || (unitMatch && amountMatch));
      });
      
      // Log matching results for debugging
      console.log(`🔍 Found ${existingRentTransactions.length} existing rent transactions for lease ${newLease.id}`);
      if (existingRentTransactions.length > 1) {
        console.warn(`⚠️ Multiple recurring rent transactions found for lease ${newLease.id}. Using the first one.`);
      }
      
      // Update or recreate recurring revenue based on changes
      if (existingRentTransactions.length > 0) {
        const primaryTransaction = existingRentTransactions[0];
        
        // Calculate new first rent date if due day changed
        const startDate = new Date(newLease.startDate);
        const dueDay = Math.min(newLease.dueDay || 1, 28);
        const firstRentDate = new Date(startDate.getFullYear(), startDate.getMonth(), dueDay);
        
        if (firstRentDate < startDate) {
          firstRentDate.setMonth(firstRentDate.getMonth() + 1);
        }
        
        // Update the primary recurring transaction
        const updatedTransactionData = {
          amount: newLease.rent.toString(),
          date: firstRentDate,
          recurringEndDate: new Date(newLease.endDate),
          notes: `Recurring rent for lease ${newLease.id} (updated ${new Date().toLocaleDateString()})`,
        };
        
        await storage.updateTransaction(primaryTransaction.id, updatedTransactionData);
        console.log(`✅ Updated recurring rent revenue for lease ${newLease.id}: $${newLease.rent}/month`);
        
        // Update future transactions in the series if rent amount changed
        if (oldLease.rent !== newLease.rent) {
          const futureTransactions = existingRentTransactions.filter(t => 
            t.id !== primaryTransaction.id && 
            new Date(t.date) > new Date()
          );
          
          for (const transaction of futureTransactions) {
            await storage.updateTransaction(transaction.id, {
              amount: newLease.rent.toString()
            });
          }
          console.log(`✅ Updated ${futureTransactions.length} future rent transactions with new amount`);
        }
      } else {
        // No existing recurring revenue found, create it
        console.log(`🆕 No existing recurring revenue found, creating new one for lease ${newLease.id}`);
        await createLeaseRentRevenue(orgId, newLease);
      }
      
    } catch (error) {
      console.error("Error updating lease recurring revenue:", error);
    }
  }

  // Helper function to update lease reminders when lease is modified
  async function updateLeaseReminders(orgId: string, oldLease: any, newLease: any) {
    try {
      // Get all existing reminders for this lease
      const reminders = await storage.getReminders(orgId);
      const existingLeaseReminders = reminders.filter(r => 
        r.scope === "lease" && 
        r.scopeId === newLease.id
      );
      
      // Remove old reminders
      for (const reminder of existingLeaseReminders) {
        await storage.deleteReminder(reminder.id);
      }
      
      // Create new reminders with updated lease data
      await createLeaseReminders(orgId, newLease);
      console.log(`✅ Updated lease reminders for lease ${newLease.id}`);
      
    } catch (error) {
      console.error("Error updating lease reminders:", error);
    }
  }

  // Helper function to create lease reminders
  async function createLeaseReminders(orgId: string, lease: any) {
    const reminders = [];
    
    // Create expiration reminder if configured
    if (lease.expirationReminderMonths && lease.expirationReminderMonths > 0) {
      const reminderDate = new Date(lease.endDate);
      reminderDate.setMonth(reminderDate.getMonth() - lease.expirationReminderMonths);
      
      reminders.push({
        orgId,
        scope: "lease" as const,
        scopeId: lease.id,
        title: `Lease expires in ${lease.expirationReminderMonths} month${lease.expirationReminderMonths > 1 ? 's' : ''}`,
        type: "lease" as const,
        dueAt: reminderDate,
        leadDays: 0,
        channel: "inapp" as const,
        status: "Pending" as const,
        isRecurring: false,
        recurringInterval: 1,
        isBulkEntry: false,
        payloadJson: {
          leaseId: lease.id,
          unitId: lease.unitId,
          tenantGroupId: lease.tenantGroupId,
          reminderType: "expiration",
          monthsBeforeExpiry: lease.expirationReminderMonths
        }
      });
    }
    
    // Create renewal reminder if enabled
    if (lease.renewalReminderEnabled) {
      const renewalReminderDate = new Date(lease.endDate);
      renewalReminderDate.setMonth(renewalReminderDate.getMonth() - 1); // 1 month before
      
      reminders.push({
        orgId,
        scope: "lease" as const,
        scopeId: lease.id,
        title: "Send lease renewal notification to tenant",
        type: "lease" as const,
        dueAt: renewalReminderDate,
        leadDays: 0,
        channel: "inapp" as const,
        status: "Pending" as const,
        isRecurring: false,
        recurringInterval: 1,
        isBulkEntry: false,
        payloadJson: {
          leaseId: lease.id,
          unitId: lease.unitId,
          tenantGroupId: lease.tenantGroupId,
          reminderType: "renewal",
          action: "notify_tenant"
        }
      });
    }
    
    // Create all reminders
    for (const reminder of reminders) {
      try {
        await storage.createReminder(reminder);
      } catch (error) {
        console.error("Error creating lease reminder:", error);
        // Don't fail the entire lease creation if reminder creation fails
      }
    }
  }

  // Helper function to create recurring rent revenue when lease is created
  async function createLeaseRentRevenue(orgId: string, lease: any) {
    try {
      // Get unit details to find the property ID
      const unit = await storage.getUnit(lease.unitId);
      if (!unit) {
        console.error(`Unit not found for lease ${lease.id}`);
        return;
      }

      // Calculate first rent due date based on lease start and due day
      const startDate = new Date(lease.startDate);
      const dueDay = Math.min(lease.dueDay || 1, 28); // Clamp to safe day to avoid month overflow
      const firstRentDate = new Date(startDate.getFullYear(), startDate.getMonth(), dueDay);
      
      // If the due day has already passed in the start month, move to next month
      if (firstRentDate < startDate) {
        firstRentDate.setMonth(firstRentDate.getMonth() + 1);
      }

      // Generate clear month/year description
      const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
      const rentMonth = monthNames[firstRentDate.getMonth()];
      const rentYear = firstRentDate.getFullYear();
      const clearDescription = `${rentMonth} ${rentYear} Rent`;

      // Get property details for user-friendly notes
      const property = await storage.getProperty(unit.propertyId);
      if (!property) {
        console.error(`Property not found for unit ${unit.id}`);
        return;
      }

      // Create user-friendly location description
      const propertyName = property.name || `${property.street}, ${property.city}`;
      let locationDescription = propertyName;
      
      // Check if this property has multiple units
      const propertyUnits = await storage.getUnits(unit.propertyId);
      const isMultiUnit = propertyUnits.length > 1;
      
      // Add unit information only for buildings with multiple units
      if (isMultiUnit && unit.label && unit.label.trim()) {
        locationDescription += `, Unit ${unit.label}`;
      }

      // Prepare rent revenue data matching existing schema patterns
      const rentRevenueData = {
        orgId: orgId,
        propertyId: unit.propertyId,
        unitId: lease.unitId,
        type: "Income" as const,
        scope: "property" as const,
        amount: lease.rent.toString(),
        description: clearDescription,
        category: "Rental Income",
        date: firstRentDate,
        isRecurring: true,
        recurringFrequency: "months" as const, // Use "months" to match cron expectations
        recurringInterval: 1,
        recurringEndDate: new Date(lease.endDate), // Ensure proper date normalization
        taxDeductible: false, // Rental income is taxable, not deductible
        notes: `Recurring rent for ${locationDescription}`,
        paymentStatus: "Unpaid" as const, // Rent starts as unpaid until payment received
      };

      // Validate using proper schema before creating
      const validatedData = insertTransactionSchema.parse(rentRevenueData);
      
      // Create the revenue transaction using the correct storage method
      await storage.createTransaction(validatedData);
      
      console.log(`✅ Created recurring rent revenue for lease ${lease.id}: $${lease.rent}/month starting ${firstRentDate.toDateString()}`);
      
    } catch (error) {
      console.error("Error creating lease rent revenue:", error);
      // Don't fail the entire lease creation if revenue creation fails
    }
  }

  // Smart case routes
  app.get('/api/cases', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const cases = await storage.getSmartCases(org.id);
      res.json(cases);
    } catch (error) {
      console.error("Error fetching cases:", error);
      res.status(500).json({ message: "Failed to fetch cases" });
    }
  });

  app.post('/api/cases', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // Clean the data: convert empty strings to null for optional fields
      const cleanedData = {
        ...req.body,
        orgId: org.id,
        unitId: req.body.unitId === "" ? null : req.body.unitId,
        propertyId: req.body.propertyId === "" ? null : req.body.propertyId,
        description: req.body.description === "" ? null : req.body.description,
        category: req.body.category === "" ? null : req.body.category,
      };
      
      const validatedData = insertSmartCaseSchema.parse(cleanedData);
      
      const smartCase = await storage.createSmartCase(validatedData);
      res.json(smartCase);
    } catch (error) {
      console.error("Error creating case:", error);
      res.status(500).json({ message: "Failed to create case" });
    }
  });

  app.patch('/api/cases/:id', isAuthenticated, async (req: any, res) => {
    try {
      const smartCase = await storage.updateSmartCase(req.params.id, req.body);
      res.json(smartCase);
    } catch (error) {
      console.error("Error updating case:", error);
      res.status(500).json({ message: "Failed to update case" });
    }
  });

  // Vendor routes
  app.get('/api/vendors', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const vendors = await storage.getVendors(org.id);
      res.json(vendors);
    } catch (error) {
      console.error("Error fetching vendors:", error);
      res.status(500).json({ message: "Failed to fetch vendors" });
    }
  });

  app.post('/api/vendors', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const validatedData = insertVendorSchema.parse({
        ...req.body,
        orgId: org.id,
      });
      
      const vendor = await storage.createVendor(validatedData);
      res.json(vendor);
    } catch (error) {
      console.error("Error creating vendor:", error);
      res.status(500).json({ message: "Failed to create vendor" });
    }
  });

  // Depreciation assets routes
  app.get('/api/depreciation-assets', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // TODO: Implement storage.getDepreciationAssets(org.id) when ready
      // For now, return empty array to prevent Tax Center query errors
      const depreciationAssets: any[] = [];
      res.json(depreciationAssets);
    } catch (error) {
      console.error("Error fetching depreciation assets:", error);
      res.status(500).json({ message: "Failed to fetch depreciation assets" });
    }
  });

  // Transaction routes
  app.get('/api/transactions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const type = req.query.type as "Income" | "Expense" | undefined;
      const transactions = await storage.getTransactions(org.id, type);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  app.post('/api/transactions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const validatedData = insertTransactionSchema.parse({
        ...req.body,
        orgId: org.id,
      });
      
      const transaction = await storage.createTransaction(validatedData);
      res.json(transaction);
    } catch (error) {
      console.error("Error creating transaction:", error);
      res.status(500).json({ message: "Failed to create transaction" });
    }
  });

  app.post('/api/expenses', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // Handle custom category logic
      let finalCategory = req.body.category;
      if (req.body.category === "custom" && req.body.customCategory) {
        finalCategory = req.body.customCategory;
      } else if (req.body.category === "none") {
        finalCategory = "";
      }
      
      // Clean up the data to match schema expectations
      const cleanedData = {
        orgId: org.id,
        type: "Expense" as const,
        propertyId: req.body.propertyId === "none" ? undefined : req.body.propertyId,
        unitId: req.body.unitId === "none" || req.body.unitId === "" ? undefined : req.body.unitId,
        entityId: req.body.entityId || undefined,
        scope: req.body.scope || "property",
        amount: (req.body.amount !== undefined && req.body.amount !== null && req.body.amount !== "") ? String(req.body.amount) : "0",
        description: req.body.description || "",
        category: finalCategory,
        date: typeof req.body.date === 'string' ? new Date(req.body.date) : req.body.date,
        isDateRange: req.body.isDateRange || false,
        endDate: req.body.endDate ? (typeof req.body.endDate === 'string' ? new Date(req.body.endDate) : req.body.endDate) : undefined,
        receiptUrl: req.body.receiptUrl,
        notes: req.body.notes,
        isRecurring: req.body.isRecurring || false,
        recurringFrequency: req.body.recurringFrequency,
        recurringInterval: req.body.recurringInterval || 1,
        recurringEndDate: req.body.recurringEndDate,
        taxDeductible: req.body.taxDeductible !== undefined ? req.body.taxDeductible : true,
        isBulkEntry: req.body.isBulkEntry || false,
        isAmortized: req.body.isAmortized || false,
        amortizationYears: req.body.amortizationYears,
        amortizationStartDate: req.body.amortizationStartDate,
        amortizationMethod: req.body.amortizationMethod,
        // Tax categorization fields
        scheduleECategory: req.body.scheduleECategory,
      };
      
      const validatedData = insertExpenseSchema.parse(cleanedData);
      
      const expense = await storage.createExpense(validatedData as any);
      res.json(expense);
    } catch (error) {
      console.error("Error creating expense:", error);
      res.status(500).json({ message: "Failed to create expense" });
    }
  });

  // Update an expense
  app.put("/api/expenses/:id", isAuthenticated, async (req, res) => {
    try {
      console.log("Updating expense ID:", req.params.id);
      console.log("Update request body:", JSON.stringify(req.body, null, 2));

      const userId = (req as any).user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      const { category, customCategory, scope, ...requestBody } = req.body;

      let finalCategory = category;
      if (category === "custom" && customCategory) {
        finalCategory = customCategory;
      }

      const cleanedData = {
        id: req.params.id,
        orgId: org.id,
        type: "Expense",
        amount: (req.body.amount !== undefined && req.body.amount !== null && req.body.amount !== "") ? String(req.body.amount) : "0",
        description: req.body.description || "",
        category: finalCategory,
        date: typeof req.body.date === 'string' ? new Date(req.body.date) : req.body.date,
        isDateRange: req.body.isDateRange || false,
        endDate: req.body.endDate ? (typeof req.body.endDate === 'string' ? new Date(req.body.endDate) : req.body.endDate) : undefined,
        receiptUrl: req.body.receiptUrl,
        notes: req.body.notes,
        isRecurring: req.body.isRecurring || false,
        recurringFrequency: req.body.recurringFrequency || undefined,
        recurringInterval: req.body.recurringInterval || 1,
        recurringEndDate: req.body.recurringEndDate,
        propertyId: scope === "property" ? req.body.propertyId : undefined,
        unitId: req.body.unitId === "none" || req.body.unitId === "" ? undefined : req.body.unitId,
        entityId: scope === "operational" ? req.body.entityId : undefined,
        vendorId: req.body.vendorId,
        userId: (req.user as any).claims.sub,
        scope: req.body.scope || "property",
        taxDeductible: req.body.taxDeductible !== undefined ? req.body.taxDeductible : true,
        isBulkEntry: req.body.isBulkEntry || false,
        isAmortized: req.body.isAmortized || false,
        amortizationYears: req.body.amortizationYears,
        amortizationStartDate: req.body.amortizationStartDate,
        amortizationMethod: req.body.amortizationMethod,
        // Tax categorization fields
        scheduleECategory: req.body.scheduleECategory,
      };

      console.log("DEBUG: Data being sent to storage.updateTransaction:", JSON.stringify(cleanedData, null, 2));

      // Validate the data using the expense schema
      const validatedData = insertExpenseSchema.parse(cleanedData);
      console.log("DEBUG: Data after Zod validation:", JSON.stringify(validatedData, null, 2));

      const updatedExpense = await storage.updateTransaction(req.params.id, validatedData as any);
      res.json(updatedExpense);
    } catch (error) {
      console.error("Error updating expense:", error);
      res.status(500).json({ message: "Failed to update expense" });
    }
  });

  // Delete an expense
  app.delete("/api/expenses/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      // Check if the expense exists and belongs to the user's organization
      const expense = await storage.getTransactionById(req.params.id);
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }

      if (expense.orgId !== org.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deleteTransaction(req.params.id);
      res.json({ message: "Expense deleted successfully" });
    } catch (error) {
      console.error("Error deleting expense:", error);
      res.status(500).json({ message: "Failed to delete expense" });
    }
  });

  // Delete recurring expense series with mode support
  app.delete("/api/expenses/:id/recurring", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const { id } = req.params;
      const mode = req.query.mode as string; // Get mode from query params
      
      // Validate mode parameter if provided
      if (mode && !['future', 'all'].includes(mode)) {
        return res.status(400).json({ message: "Invalid mode. Must be 'future' or 'all'" });
      }
      
      // Check if this is a recurring operation
      if (mode && ['future', 'all'].includes(mode)) {
        // Check if the expense exists and belongs to the user's organization
        const expense = await storage.getTransactionById(id);
        if (!expense) {
          return res.status(404).json({ message: "Expense not found" });
        }

        if (expense.orgId !== org.id) {
          return res.status(403).json({ message: "Access denied" });
        }

        // Verify this is actually a recurring transaction
        if (!expense.isRecurring && !expense.parentRecurringId) {
          return res.status(400).json({ message: "This is not a recurring expense" });
        }

        await storage.deleteRecurringTransaction(id, mode as "future" | "all");
        res.json({ message: `Recurring expense series deleted successfully (mode: ${mode})` });
      } else {
        // Single expense deletion
        const expense = await storage.getTransactionById(id);
        if (!expense) {
          return res.status(404).json({ message: "Expense not found" });
        }
        
        if (expense.orgId !== org.id) {
          return res.status(403).json({ message: "Access denied" });
        }
        
        await storage.deleteTransaction(id);
        res.json({ message: "Expense deleted successfully" });
      }
    } catch (error) {
      console.error("Error deleting recurring expense series:", error);
      res.status(500).json({ message: "Failed to delete recurring expense series" });
    }
  });

  // Update recurring expense series with mode support
  app.put("/api/expenses/:id/recurring", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const { id } = req.params;
      const { mode, ...updateData } = req.body; // Extract mode from request body
      const queryMode = req.query.mode as string; // Also check query params
      const finalMode = mode || queryMode;
      
      // Validate mode parameter if provided
      if (finalMode && !['future', 'all'].includes(finalMode)) {
        return res.status(400).json({ message: "Invalid mode. Must be 'future' or 'all'" });
      }
      
      // Check if this is a recurring operation
      if (finalMode && ['future', 'all'].includes(finalMode)) {
        // Check if the expense exists and belongs to the user's organization
        const expense = await storage.getTransactionById(id);
        if (!expense) {
          return res.status(404).json({ message: "Expense not found" });
        }

        if (expense.orgId !== org.id) {
          return res.status(403).json({ message: "Access denied" });
        }

        // Verify this is actually a recurring transaction
        if (!expense.isRecurring && !expense.parentRecurringId) {
          return res.status(400).json({ message: "This is not a recurring expense" });
        }

        await storage.updateRecurringTransaction(id, updateData, finalMode as "future" | "all");
        res.json({ message: `Recurring expense series updated successfully (mode: ${finalMode})` });
      } else {
        // Single expense update
        const expense = await storage.getTransactionById(id);
        if (!expense) {
          return res.status(404).json({ message: "Expense not found" });
        }
        
        if (expense.orgId !== org.id) {
          return res.status(403).json({ message: "Access denied" });
        }
        
        const updated = await storage.updateTransaction(id, updateData);
        res.json(updated);
      }
    } catch (error) {
      console.error("Error updating recurring expense series:", error);
      res.status(500).json({ message: "Failed to update recurring expense series" });
    }
  });

  // Mortgage interest adjustment endpoint
  app.post("/api/expenses/mortgage-adjustment", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      const { propertyId, year, actualInterestPaid } = req.body;

      // Validate input
      if (!propertyId || !year || actualInterestPaid === undefined) {
        return res.status(400).json({ message: "Property ID, year, and actual interest paid are required" });
      }

      // Get property details
      const property = await storage.getProperty(propertyId);
      if (!property) return res.status(404).json({ message: "Property not found" });
      
      if (!property.monthlyMortgage || (!property.acquisitionDate && !property.mortgageStartDate)) {
        return res.status(400).json({ message: "Property must have mortgage details (monthly payment and acquisition or mortgage start date)" });
      }

      // Find all "Mortgage" category expenses for this property in the specified year
      const allTransactions = await storage.getTransactions(org.id);
      const mortgageExpenses = allTransactions.filter((transaction: any) => 
        transaction.propertyId === propertyId &&
        transaction.category === "Mortgage" &&
        new Date(transaction.date).getFullYear() === year
      );

      if (mortgageExpenses.length === 0) {
        return res.status(404).json({ message: `No mortgage expenses found for ${year}` });
      }

      // Use the property's mortgage start date field
      const actualMortgageStartDate = new Date(property.mortgageStartDate || property.acquisitionDate || Date.now());
      
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31);
      
      const mortgageActiveStart = actualMortgageStartDate > yearStart ? actualMortgageStartDate : yearStart;
      // Use sale date as end of mortgage payments if property was sold during the year
      const saleDate = property.saleDate ? new Date(property.saleDate) : null;
      const mortgageActiveEnd = (saleDate && saleDate.getFullYear() === year && saleDate < yearEnd) ? saleDate : yearEnd;
      const mortgageActiveDays = Math.ceil((mortgageActiveEnd.getTime() - mortgageActiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const yearDays = new Date(year, 11, 31).getDate() === 31 && new Date(year, 1, 29).getDate() === 29 ? 366 : 365;

      // Calculate expected total mortgage payments for the year based on monthly amount and ownership period
      const monthlyPrimary = Number(property.monthlyMortgage) || 0;
      const monthlySecondary = Number(property.monthlyMortgage2) || 0;
      const totalMonthlyMortgage = monthlyPrimary + monthlySecondary;
      
      // Calculate months of mortgage payments in the year
      let mortgageActiveMonths = 12;
      
      // Adjust for partial year if mortgage started during the year
      if (actualMortgageStartDate.getFullYear() === year) {
        mortgageActiveMonths = 12 - actualMortgageStartDate.getMonth(); // Months from mortgage start to end of year
      }
      
      // Adjust for partial year if sold during the year
      if (saleDate && saleDate.getFullYear() === year) {
        if (actualMortgageStartDate.getFullYear() === year) {
          // Both mortgage start and sale in same year
          mortgageActiveMonths = Math.max(0, saleDate.getMonth() - actualMortgageStartDate.getMonth() + 1);
        } else {
          // Mortgage started before this year, sold during year
          mortgageActiveMonths = saleDate.getMonth() + 1; // Months from start of year to sale
        }
      }
      
      const expectedTotalPayments = totalMonthlyMortgage * mortgageActiveMonths;
      
      // Use expected payments for validation (this represents what should have been paid)
      const actualMortgagePayments = mortgageExpenses.reduce((sum: number, expense: any) => sum + Number(expense.amount), 0);
      
      console.log(`🏦 Mortgage calculation debug:`, {
        monthlyPrimary,
        monthlySecondary,
        totalMonthlyMortgage,
        mortgageActiveMonths,
        expectedTotalPayments,
        actualMortgagePayments,
        propertyMortgageStartDate: property.mortgageStartDate,
        actualMortgageStartYear: actualMortgageStartDate.getFullYear(),
        actualMortgageStartMonth: actualMortgageStartDate.getMonth() + 1,
        targetYear: year
      });
      
      // Use expected payments for validation
      const totalMortgagePayments = expectedTotalPayments;
      
      // Calculate interest vs principal split
      const totalPrincipal = totalMortgagePayments - actualInterestPaid;
      
      if (totalPrincipal < 0) {
        return res.status(400).json({ 
          message: `Interest paid ($${actualInterestPaid}) exceeds expected total mortgage payments ($${totalMortgagePayments.toFixed(2)}) for ${year}` 
        });
      }

      console.log(`🏦 Processing mortgage adjustment for ${property.name || property.street}:`, {
        year,
        totalPayments: totalMortgagePayments,
        actualInterest: actualInterestPaid,
        calculatedPrincipal: totalPrincipal,
        mortgageActiveDays,
        yearDays,
        expenseCount: mortgageExpenses.length
      });

      // Process each mortgage expense
      let adjustedCount = 0;
      for (const expense of mortgageExpenses) {
        const paymentAmount = Number(expense.amount);
        const interestPortion = (paymentAmount / totalMortgagePayments) * actualInterestPaid;
        const principalPortion = paymentAmount - interestPortion;

        // Delete the original "Mortgage" expense
        await storage.deleteTransaction(expense.id);

        // Create interest expense (tax deductible)
        if (interestPortion > 0) {
          const interestExpenseData = {
            orgId: org.id,
            type: "Expense" as const,
            propertyId: expense.propertyId,
            scope: expense.scope,
            amount: interestPortion.toFixed(2),
            description: `Mortgage interest - ${property.name || `${property.street}, ${property.city}`} (adjusted from full payment)`,
            category: "Mortgage Interest Paid to Banks",
            date: expense.date,
            isRecurring: false,
            taxDeductible: true,
            isBulkEntry: false,
            scheduleECategory: "mortgage_interest" as "mortgage_interest",
            notes: `Split from original mortgage payment of $${paymentAmount.toFixed(2)} - Interest: $${interestPortion.toFixed(2)}, Principal: $${principalPortion.toFixed(2)}`
          };
          await storage.createTransaction(interestExpenseData);
        }

        // Create principal expense (non-tax deductible)
        if (principalPortion > 0) {
          const principalExpenseData = {
            orgId: org.id,
            type: "Expense" as const,
            propertyId: expense.propertyId,
            scope: expense.scope,
            amount: principalPortion.toFixed(2),
            description: `Mortgage principal - ${property.name || `${property.street}, ${property.city}`} (adjusted from full payment)`,
            category: "Mortgage Principal Payment",
            date: expense.date,
            isRecurring: false,
            taxDeductible: false,
            isBulkEntry: false,
            notes: `Split from original mortgage payment of $${paymentAmount.toFixed(2)} - Interest: $${interestPortion.toFixed(2)}, Principal: $${principalPortion.toFixed(2)}`
          };
          await storage.createTransaction(principalExpenseData);
        }

        adjustedCount++;
      }

      res.json({ 
        message: "Mortgage adjustment completed successfully",
        adjustedCount,
        totalInterest: actualInterestPaid,
        totalPrincipal: totalPrincipal,
        mortgageInfo: mortgageActiveDays < yearDays ? 
          `Partial year: ${mortgageActiveDays} days of ${yearDays}` : 
          "Full year mortgage payments"
      });

    } catch (error) {
      console.error("Error processing mortgage adjustment:", error);
      res.status(500).json({ message: "Failed to process mortgage adjustment" });
    }
  });

  // Revenue routes
  app.post("/api/revenues", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      const { category, customCategory, scope, ...requestBody } = req.body;

      let finalCategory = category;
      if (category === "custom" && customCategory) {
        finalCategory = customCategory;
      }

      const cleanedData = {
        orgId: org.id,
        type: "Income" as const,
        propertyId: req.body.propertyId === "none" ? undefined : req.body.propertyId,
        entityId: req.body.entityId || undefined,
        scope: req.body.scope || "property",
        amount: (req.body.amount !== undefined && req.body.amount !== null && req.body.amount !== "") ? String(req.body.amount) : "0",
        description: req.body.description || "",
        category: finalCategory,
        date: typeof req.body.date === 'string' ? new Date(req.body.date) : req.body.date,
        isDateRange: req.body.isDateRange || false,
        endDate: req.body.endDate ? (typeof req.body.endDate === 'string' ? new Date(req.body.endDate) : req.body.endDate) : undefined,
        notes: req.body.notes,
        isRecurring: req.body.isRecurring || false,
        recurringFrequency: req.body.recurringFrequency,
        recurringInterval: req.body.recurringInterval || 1,
        recurringEndDate: req.body.recurringEndDate,
        taxDeductible: req.body.taxDeductible !== undefined ? req.body.taxDeductible : true,
      };
      
      const validatedData = insertRevenueSchema.parse(cleanedData);
      
      const revenue = await storage.createRevenue(validatedData as any);
      res.json(revenue);
    } catch (error) {
      console.error("Error creating revenue:", error);
      res.status(500).json({ message: "Failed to create revenue" });
    }
  });

  app.put("/api/revenues/:id", isAuthenticated, async (req, res) => {
    try {
      console.log("Updating revenue ID:", req.params.id);
      console.log("Update request body:", JSON.stringify(req.body, null, 2));

      const { category, customCategory, scope, ...requestBody } = req.body;

      let finalCategory = category;
      if (category === "custom" && customCategory) {
        finalCategory = customCategory;
      }

      const cleanedData = {
        id: req.params.id,
        type: "Income",
        amount: (req.body.amount !== undefined && req.body.amount !== null && req.body.amount !== "") ? String(req.body.amount) : "0",
        description: req.body.description || "",
        category: finalCategory,
        date: typeof req.body.date === 'string' ? new Date(req.body.date) : req.body.date,
        isDateRange: req.body.isDateRange || false,
        endDate: req.body.endDate ? (typeof req.body.endDate === 'string' ? new Date(req.body.endDate) : req.body.endDate) : undefined,
        notes: req.body.notes,
        isRecurring: req.body.isRecurring || false,
        recurringFrequency: req.body.recurringFrequency,
        recurringInterval: req.body.recurringInterval || 1,
        recurringEndDate: req.body.recurringEndDate,
        propertyId: scope === "property" ? req.body.propertyId : undefined,
        entityId: scope === "operational" ? req.body.entityId : undefined,
        userId: (req.user as any).claims.sub,
        scope: req.body.scope || "property",
        taxDeductible: req.body.taxDeductible !== undefined ? req.body.taxDeductible : true,
      };

      const updatedRevenue = await storage.updateTransaction(req.params.id, cleanedData as any);
      res.json(updatedRevenue);
    } catch (error) {
      console.error("Error updating revenue:", error);
      res.status(500).json({ message: "Failed to update revenue" });
    }
  });

  app.delete("/api/revenues/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      // Check if the revenue exists and belongs to the user's organization
      const revenue = await storage.getTransactionById(req.params.id);
      if (!revenue) {
        return res.status(404).json({ message: "Revenue not found" });
      }

      if (revenue.orgId !== org.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deleteTransaction(req.params.id);
      res.json({ message: "Revenue deleted successfully" });
    } catch (error) {
      console.error("Error deleting revenue:", error);
      res.status(500).json({ message: "Failed to delete revenue" });
    }
  });

  // Delete recurring revenue series with mode support
  app.delete("/api/revenues/:id/recurring", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const { id } = req.params;
      const mode = req.query.mode as string; // Get mode from query params
      
      // Validate mode parameter if provided
      if (mode && !['future', 'all'].includes(mode)) {
        return res.status(400).json({ message: "Invalid mode. Must be 'future' or 'all'" });
      }
      
      // Check if this is a recurring operation
      if (mode && ['future', 'all'].includes(mode)) {
        // Check if the revenue exists and belongs to the user's organization
        const revenue = await storage.getTransactionById(id);
        if (!revenue) {
          return res.status(404).json({ message: "Revenue not found" });
        }

        if (revenue.orgId !== org.id) {
          return res.status(403).json({ message: "Access denied" });
        }

        // Verify this is actually a recurring transaction
        if (!revenue.isRecurring && !revenue.parentRecurringId) {
          return res.status(400).json({ message: "This is not a recurring revenue" });
        }

        await storage.deleteRecurringTransaction(id, mode as "future" | "all");
        res.json({ message: `Recurring revenue series deleted successfully (mode: ${mode})` });
      } else {
        // Single revenue deletion
        const revenue = await storage.getTransactionById(id);
        if (!revenue) {
          return res.status(404).json({ message: "Revenue not found" });
        }
        
        if (revenue.orgId !== org.id) {
          return res.status(403).json({ message: "Access denied" });
        }
        
        await storage.deleteTransaction(id);
        res.json({ message: "Revenue deleted successfully" });
      }
    } catch (error) {
      console.error("Error deleting recurring revenue series:", error);
      res.status(500).json({ message: "Failed to delete recurring revenue series" });
    }
  });

  // Update recurring revenue series with mode support
  app.put("/api/revenues/:id/recurring", isAuthenticated, async (req, res) => {
    try {
      const userId = (req as any).user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const { id } = req.params;
      const { mode, ...updateData } = req.body; // Extract mode from request body
      const queryMode = req.query.mode as string; // Also check query params
      const finalMode = mode || queryMode;
      
      // Validate mode parameter if provided
      if (finalMode && !['future', 'all'].includes(finalMode)) {
        return res.status(400).json({ message: "Invalid mode. Must be 'future' or 'all'" });
      }
      
      // Check if this is a recurring operation
      if (finalMode && ['future', 'all'].includes(finalMode)) {
        // Check if the revenue exists and belongs to the user's organization
        const revenue = await storage.getTransactionById(id);
        if (!revenue) {
          return res.status(404).json({ message: "Revenue not found" });
        }

        if (revenue.orgId !== org.id) {
          return res.status(403).json({ message: "Access denied" });
        }

        // Verify this is actually a recurring transaction
        if (!revenue.isRecurring && !revenue.parentRecurringId) {
          return res.status(400).json({ message: "This is not a recurring revenue" });
        }

        await storage.updateRecurringTransaction(id, updateData, finalMode as "future" | "all");
        res.json({ message: `Recurring revenue series updated successfully (mode: ${finalMode})` });
      } else {
        // Single revenue update
        const revenue = await storage.getTransactionById(id);
        if (!revenue) {
          return res.status(404).json({ message: "Revenue not found" });
        }
        
        if (revenue.orgId !== org.id) {
          return res.status(403).json({ message: "Access denied" });
        }
        
        const updated = await storage.updateTransaction(id, updateData);
        res.json(updated);
      }
    } catch (error) {
      console.error("Error updating recurring revenue series:", error);
      res.status(500).json({ message: "Failed to update recurring revenue series" });
    }
  });

  // Object Storage routes
  app.post('/api/objects/upload', isAuthenticated, async (req: any, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ message: "Failed to get upload URL" });
    }
  });

  // Reminder routes
  app.get('/api/reminders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const reminders = await storage.getReminders(org.id);
      res.json(reminders);
    } catch (error) {
      console.error("Error fetching reminders:", error);
      res.status(500).json({ message: "Failed to fetch reminders" });
    }
  });

  app.post('/api/reminders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // Clean the data: convert empty strings to null for optional fields
      const cleanedData = {
        ...req.body,
        orgId: org.id,
        dueAt: req.body.dueAt ? new Date(req.body.dueAt) : undefined,
        recurringEndDate: req.body.recurringEndDate ? new Date(req.body.recurringEndDate) : undefined,
        // Convert empty strings to null for optional fields
        type: req.body.type === "" ? null : req.body.type,
        scope: req.body.scope === "" ? null : req.body.scope,
        scopeId: req.body.scopeId === "" ? null : req.body.scopeId,
        entityId: req.body.entityId === "" ? null : req.body.entityId,
        recurringFrequency: req.body.recurringFrequency === "" ? null : req.body.recurringFrequency,
      };
      
      const validatedData = insertReminderSchema.parse(cleanedData);
      
      // storage.createReminder already handles recurring reminder creation
      const reminder = await storage.createReminder(validatedData);
      res.json(reminder);
    } catch (error) {
      console.error("Error creating reminder:", error);
      res.status(500).json({ message: "Failed to create reminder" });
    }
  });

  app.patch('/api/reminders/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const { id } = req.params;
      const { mode, ...updateData } = req.body; // Extract mode from request body
      const queryMode = req.query.mode as string; // Also check query params
      const finalMode = mode || queryMode;
      
      // Convert date strings to Date objects if provided
      if (updateData.completedAt) {
        updateData.completedAt = new Date(updateData.completedAt);
      }
      if (updateData.dueAt) {
        updateData.dueAt = new Date(updateData.dueAt);
      }
      if (updateData.recurringEndDate) {
        updateData.recurringEndDate = new Date(updateData.recurringEndDate);
      }
      
      // Validate mode parameter if provided
      if (finalMode && !['future', 'all'].includes(finalMode)) {
        return res.status(400).json({ message: "Invalid mode. Must be 'future' or 'all'" });
      }
      
      // Skip validation for now due to ZodEffects complexity
      const validatedUpdateData = updateData;
      
      // Check if this is a recurring operation
      if (finalMode && ['future', 'all'].includes(finalMode)) {
        // Check if the reminder exists and belongs to the user's organization
        const reminder = await storage.getReminders(org.id);
        const targetReminder = reminder.find(r => r.id === id);
        if (!targetReminder) {
          return res.status(404).json({ message: "Reminder not found" });
        }
        
        // Verify this is actually a recurring reminder
        if (!targetReminder.isRecurring && !targetReminder.parentRecurringId) {
          return res.status(400).json({ message: "This is not a recurring reminder" });
        }
        
        await storage.updateRecurringReminder(id, validatedUpdateData, finalMode as "future" | "all");
        res.json({ message: `Recurring reminder series updated successfully (mode: ${finalMode})` });
      } else {
        // Single reminder update - SECURITY FIX: Verify org ownership
        const reminders = await storage.getReminders(org.id);
        const targetReminder = reminders.find(r => r.id === id);
        if (!targetReminder) {
          return res.status(404).json({ message: "Reminder not found" });
        }
        
        const reminder = await storage.updateReminder(id, validatedUpdateData);
        res.json(reminder);
      }
    } catch (error) {
      console.error("Error updating reminder:", error);
      res.status(500).json({ message: "Failed to update reminder" });
    }
  });

  app.delete('/api/reminders/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const { id } = req.params;
      const mode = req.query.mode as string; // Get mode from query params
      
      // Validate mode parameter if provided
      if (mode && !['future', 'all'].includes(mode)) {
        return res.status(400).json({ message: "Invalid mode. Must be 'future' or 'all'" });
      }
      
      // Check if this is a recurring operation
      if (mode && ['future', 'all'].includes(mode)) {
        // Check if the reminder exists and belongs to the user's organization
        const reminders = await storage.getReminders(org.id);
        const targetReminder = reminders.find(r => r.id === id);
        if (!targetReminder) {
          return res.status(404).json({ message: "Reminder not found" });
        }
        
        // Verify this is actually a recurring reminder
        if (!targetReminder.isRecurring && !targetReminder.parentRecurringId) {
          return res.status(400).json({ message: "This is not a recurring reminder" });
        }
        
        await storage.deleteRecurringReminder(id, mode as "future" | "all");
        res.json({ message: `Recurring reminder series deleted successfully (mode: ${mode})` });
      } else {
        // Single reminder deletion - SECURITY FIX: Verify org ownership
        const reminders = await storage.getReminders(org.id);
        const targetReminder = reminders.find(r => r.id === id);
        if (!targetReminder) {
          return res.status(404).json({ message: "Reminder not found" });
        }
        
        await storage.deleteReminder(id);
        res.json({ message: "Reminder deleted successfully" });
      }
    } catch (error) {
      console.error("Error deleting reminder:", error);
      res.status(500).json({ message: "Failed to delete reminder" });
    }
  });

  // Dashboard routes
  app.get('/api/dashboard/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const stats = await storage.getDashboardStats(org.id);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  app.get('/api/dashboard/rent-collection', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const rentCollection = await storage.getRentCollectionStatus(org.id);
      res.json(rentCollection);
    } catch (error) {
      console.error("Error fetching rent collection:", error);
      res.status(500).json({ message: "Failed to fetch rent collection" });
    }
  });

  // Notification routes
  app.get('/api/notifications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const notifications = await storage.getUserNotifications(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.patch('/api/notifications/:id/read', isAuthenticated, async (req: any, res) => {
    try {
      await storage.markNotificationAsRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // Payment status update endpoint
  app.patch('/api/transactions/:id/payment-status', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { paymentStatus, paidAmount } = req.body;
      
      if (!['Paid', 'Unpaid', 'Partial', 'Skipped'].includes(paymentStatus)) {
        return res.status(400).json({ message: "Invalid payment status" });
      }

      await storage.updateTransactionPaymentStatus(id, paymentStatus, paidAmount);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating payment status:", error);
      res.status(500).json({ message: "Failed to update payment status" });
    }
  });

  // Manual trigger for recurring transaction generation (temporary for testing)
  app.post('/api/admin/generate-recurring', isAuthenticated, async (req: any, res) => {
    try {
      console.log("Manually triggering recurring transaction generation...");
      await storage.generateRecurringTransactions();
      res.json({ 
        success: true, 
        message: "Recurring transactions generated successfully" 
      });
    } catch (error) {
      console.error("Error generating recurring transactions:", error);
      res.status(500).json({ 
        message: "Failed to generate recurring transactions",
        error: (error as Error).message 
      });
    }
  });

  // Test endpoint for recurring generation (safer)
  app.post('/api/test/generate-recurring', isAuthenticated, async (req: any, res) => {
    try {
      console.log("🔧 TEST: Manually triggering safe recurring transaction generation...");
      await storage.generateRecurringTransactions();
      res.json({ 
        success: true, 
        message: "TEST: Safe recurring transactions generated successfully",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("🔧 TEST: Error generating recurring transactions:", error);
      res.status(500).json({ 
        message: "TEST: Failed to generate recurring transactions",
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // AI Property Assistant endpoint
  app.post('/api/ai/ask', isAuthenticated, async (req: any, res) => {
    try {
      const { question, context } = req.body;
      const userId = req.user.claims.sub;
      
      // Get user's organization (same pattern as other routes)
      const org = await storage.getUserOrganization(userId);
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      const orgId = org.id;

      if (!question?.trim()) {
        return res.status(400).json({ message: "Question is required" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ 
          message: "AI service not configured" 
        });
      }

      // Initialize OpenAI
      const openai = new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY 
      });

      // Gather property data for context (including leases for rent mapping)
      const [properties, units, tenantGroups, cases, reminders, transactions, leases] = await Promise.all([
        storage.getProperties(orgId),
        storage.getAllUnits(orgId),
        storage.getTenantGroups(orgId),
        storage.getSmartCases(orgId),
        storage.getReminders(orgId),
        storage.getTransactions(orgId),
        storage.getLeases(orgId)
      ]);


      // Filter August 2025 transactions for AI context
      const augustTransactions = transactions.filter((t: any) => {
        const transactionDate = new Date(t.date);
        return t.type === 'Income' && 
               transactionDate.getMonth() === 7 && // August = month 7 (0-indexed)
               transactionDate.getFullYear() === 2025;
      });

      // Build data context for AI
      const aiData = {
        properties: properties.map(p => ({
          name: p.name,
          type: p.type,
          city: p.city,
          state: p.state,
          value: p.propertyValue,
          monthlyMortgage: p.monthlyMortgage,
          interestRate: p.interestRate,
          purchasePrice: p.purchasePrice,
          acquisitionDate: p.acquisitionDate
        })),
        units: units.map((u: any) => {
          // Find active lease for this unit to get correct monthly rent
          const activeLease = leases.find((l: any) => 
            l.unitId === u.id && 
            l.status === 'Active' && 
            new Date(l.startDate) <= new Date() && 
            (l.endDate ? new Date(l.endDate) >= new Date() : true)
          );
          
          return {
            propertyName: (u as any).propertyName || 'Unknown',
            unitNumber: u.label || 'Unknown',
            bedrooms: u.bedrooms,
            bathrooms: u.bathrooms,
            sqft: u.sqft,
            monthlyRent: Number(activeLease?.rent || u.rentAmount || 0)
          };
        }),
        tenants: tenantGroups.map((tg: any) => ({
          name: tg.name,
          propertyName: tg.propertyName,
          unitNumber: tg.unitNumber,
          monthlyRent: tg.monthlyRent,
          leaseStart: tg.leaseStart,
          leaseEnd: tg.leaseEnd,
          status: tg.status
        })),
        maintenanceCases: cases.map(c => ({
          title: c.title,
          status: c.status,
          priority: c.priority,
          createdAt: c.createdAt
        })),
        reminders: reminders.map((r: any) => ({
          title: r.title,
          description: (r as any).description || r.notes || '',
          type: r.type,
          status: r.status,
          priority: (r as any).priority || 'Medium',
          dueAt: r.dueAt,
          completed: r.completedAt ? true : false,
          scope: r.scope,
          propertyName: (r as any).propertyName || 'Unknown',
          createdAt: r.createdAt
        })),
        financials: {
          totalRevenue: transactions.filter((t: any) => t.type === 'Income').reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0),
          totalExpenses: transactions.filter((t: any) => t.type === 'Expense').reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0),
          monthlyRevenue: transactions.filter((t: any) => {
            const transactionDate = new Date(t.date);
            const currentMonth = new Date();
            return t.type === 'Income' && 
                   transactionDate.getMonth() === currentMonth.getMonth() && 
                   transactionDate.getFullYear() === currentMonth.getFullYear();
          }).reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0),
          augustCollections: augustTransactions.map((t: any) => ({
            description: t.description,
            amount: Number(t.amount),
            date: t.date,
            paymentStatus: t.paymentStatus || 'Paid'
          })),
          augustTotal: augustTransactions.reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0)
        }
      };

      // Create structured, context-aware AI prompt
      let contextualGuidance = "";
      let fewShotExample = "";
      
      // Detect financial questions for specialized guidance
      const financialKeywords = ['cash on cash', 'cash-on-cash', 'roi', 'return on investment', 'returns', 'yield', 'down payment', 'investment return', 'cash flow'];
      const questionText = String(question || '').toLowerCase();
      const isFinancialQuestion = financialKeywords.some(keyword => 
        questionText.includes(keyword)
      );
      
      if (isFinancialQuestion) {
        contextualGuidance = `

FINANCIAL ANALYSIS FOCUS: For return calculations, use "downPayment" field as the primary cash investment. Cash-on-cash return = (Annual Net Cash Flow ÷ Cash Invested) × 100. Net cash flow = rental income - mortgage payments - expenses. If only downPayment is available, use it as Cash Invested; otherwise include closing costs and initial repairs when available.`;
        
        fewShotExample = `

EXAMPLE OUTPUT for financial question "What's my cash-on-cash return by property?":
{
  "tldr": "Property 1: 12.5% cash-on-cash return, Property 2: 8.2% return. Strong performance on both investments.",
  "bullets": [
    "Property 1: $2,400 annual cash flow ÷ $100,000 down payment = 12.5% return",
    "Property 2: $1,640 annual cash flow ÷ $80,000 down payment = 8.2% return", 
    "Combined portfolio: 10.8% average cash-on-cash return"
  ],
  "actions": [
    {"label": "Review Property 2 expenses for optimization opportunities", "due": "This month"},
    {"label": "Research comparable rents for potential increases", "due": "Next quarter"},
    {"label": "Calculate after-tax returns for tax planning", "due": "Before year-end"}
  ]
}`;
      } else if (context === "dashboard") {
        contextualGuidance = `

DASHBOARD FOCUS: Provide high-level overview of portfolio performance, key metrics, urgent items needing attention, and strategic insights across all properties.`;
        
        fewShotExample = `

EXAMPLE OUTPUT for dashboard question "How are my properties performing?":
{
  "tldr": "3 properties generating $3,600/month. 1 maintenance issue, 2 leases expiring soon.",
  "bullets": [
    "Monthly revenue: $3,600 across 3 properties",
    "Property 1 (CA): $2,000/month, fully occupied",
    "Property 2 (CA): $1,600/month, needs HVAC attention",
    "2 lease renewals due in next 60 days"
  ],
  "actions": [
    {"label": "Schedule HVAC inspection for Property 2", "due": "This week"},
    {"label": "Start lease renewal conversations", "due": "Next 2 weeks"},
    {"label": "Review market rents for potential increases", "due": "This month"}
  ]
}`;
      } else if (context === "maintenance") {
        contextualGuidance = `

MAINTENANCE FOCUS: Prioritize urgent/overdue repairs, preventive maintenance schedules, contractor management, and cost optimization.`;
        
        fewShotExample = `

EXAMPLE OUTPUT for maintenance question "What maintenance needs attention?":
{
  "tldr": "2 urgent repairs, 1 overdue inspection. HVAC and plumbing issues need immediate action.",
  "bullets": [
    "Unit A HVAC system failed - tenant without heat (URGENT)",
    "Property 2 plumbing leak in basement (needs repair)",
    "Annual inspection overdue for Property 1 (compliance risk)"
  ],
  "actions": [
    {"label": "Call HVAC contractor for emergency Unit A repair", "due": "Today"},
    {"label": "Schedule plumber for Property 2 basement leak", "due": "Tomorrow"},
    {"label": "Book annual inspection for Property 1", "due": "This week"}
  ]
}`;
      } else if (context === "expenses") {
        contextualGuidance = `

EXPENSES FOCUS: Analyze spending patterns, identify cost-saving opportunities, track budget vs actual, and highlight unusual expenses.`;
        
        fewShotExample = `

EXAMPLE OUTPUT for expenses question "What are my biggest expenses?":
{
  "tldr": "Spent $4,200 this quarter. Maintenance up 30%, mortgage stable, utilities higher than expected.",
  "bullets": [
    "Maintenance: $1,800 (30% increase from last quarter)",
    "Mortgage payments: $2,000 (on schedule)",
    "Utilities: $400 (15% above normal due to repairs)"
  ],
  "actions": [
    {"label": "Review maintenance contracts for cost optimization", "due": "This month"},
    {"label": "Check utility bills for billing errors", "due": "This week"},
    {"label": "Set up quarterly expense budget alerts", "due": "Next month"}
  ]
}`;
      } else if (context === "reminders") {
        contextualGuidance = `

REMINDERS FOCUS: Prioritize due/overdue counts, top 3 items with dates and urgency, owners/assignees, immediate actions. Use format "... and N more" for overflow.`;
        
        fewShotExample = `

EXAMPLE OUTPUT for reminders question "What needs my attention?":
{
  "tldr": "3 overdue items, 2 due this week. Focus on Unit A rent collection and B2 maintenance.",
  "bullets": [
    "2 rent payments overdue (Unit A: 5 days, Unit C: 2 days)",
    "Unit B2 HVAC repair due tomorrow",
    "Lease renewal for Tenant Smith expires in 3 days"
  ],
  "actions": [
    {"label": "Contact Unit A tenant for payment", "due": "Today"},
    {"label": "Schedule HVAC repair", "due": "Tomorrow"},
    {"label": "Send lease renewal docs to Smith", "due": "This week"}
  ]
}`;
      }

      const systemPrompt = `You are Mailla, a friendly property management assistant. Answer user questions in a conversational, helpful way using their actual property data.

COMMUNICATION STYLE:
- Be warm, conversational, and supportive (like talking to a friend)
- Use simple, everyday language (avoid technical jargon)
- Focus on what matters most to busy landlords
- Always use the actual transaction data provided, especially augustCollections for August questions
- For financial calculations, prominently use the "downPayment" field as the cash investment
- Give specific numbers and actionable advice${contextualGuidance}

RESPONSE FORMAT (JSON):
{
  "tldr": "Conversational summary with specific numbers",
  "bullets": ["Easy-to-understand facts with real data"],
  "actions": [{"label": "Clear next step", "due": "timeframe"}]
}

IMPORTANT: 
- Never include technical caveats or data quality notes. Keep responses clean and user-focused.
- ALWAYS provide 2-4 actionable items in the "actions" array, even for status questions. Think about logical next steps, follow-ups, or proactive management tasks.
- Actions should be specific, time-bound, and relevant to the data presented.

EXAMPLE for question "How much rent did I collect in August?":
{
  "tldr": "You collected $3,600 in August rent from both properties - that's 100% of what was due!",
  "bullets": [
    "Property 1 paid $2,000 (on time)",
    "Property 2 paid $1,600 (on time)", 
    "Both tenants are current on rent payments"
  ],
  "actions": [
    {"label": "Send September rent collection notices", "due": "September 1st"},
    {"label": "Schedule quarterly property inspections", "due": "This month"},
    {"label": "Review and update rental rates for next year", "due": "October"}
  ]
}
${fewShotExample}

PROPERTY DATA:
${JSON.stringify(aiData, null, 2)}

Provide helpful analysis based on the actual data. Respond with valid JSON only:`;

      // Call OpenAI Responses API (GPT-5) with optimized token budget and reasoning
      const response = await openai.responses.create({
        model: "gpt-5",
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question }
        ],
        text: {
          format: { type: "json_object" }
        },
        reasoning: { effort: 'low' },
        max_output_tokens: 4096,
        stream: false
      });

      // Enhanced extraction for GPT-5 Responses API - handle both text and JSON responses
      let aiResponse = '';
      let isJsonResponse = false;
      
      if ((response as any).output_text?.trim()) {
        aiResponse = (response as any).output_text.trim();
      } else {
        // Extract from response.output array with JSON support
        const outputs = (response as any).output || [];
        for (const output of outputs) {
          if (output.content && Array.isArray(output.content)) {
            for (const content of output.content) {
              if (content.type === 'json' && content.json) {
                // Direct JSON object from API
                aiResponse = JSON.stringify(content.json);
                isJsonResponse = true;
                break;
              } else if (content.type === 'output_text' && content.text) {
                aiResponse = content.text.trim();
                break;
              } else if (content.type === 'text' && content.text) {
                aiResponse = content.text.trim();
                break;
              }
            }
            if (aiResponse) break;
          }
        }
      }
      
      
      console.log("🤖 Raw AI response:", aiResponse);

      if (!aiResponse || aiResponse.trim().length === 0) {
        console.log("❌ Empty AI response received - attempting retry with simplified prompt");
        
        // Retry with simplified prompt and reduced data
        try {
          const simplifiedAiData = {
            ...aiData,
            properties: aiData.properties?.slice(0, 3) || [],
            financials: {
              ...aiData.financials,
              augustCollections: aiData.financials?.augustCollections?.slice(0, 5) || []
            },
            cases: aiData.cases?.slice(0, 5) || [],
            reminders: aiData.reminders?.slice(0, 5) || []
          };

          const retryPrompt = `You are Mailla, a property management assistant. Answer briefly using actual data.${contextualGuidance}

PROPERTY DATA:
${JSON.stringify(simplifiedAiData, null, 2)}

Respond with valid JSON: {"tldr": "summary", "bullets": ["facts"], "actions": [{"label": "task", "due": "time"}]}`;

          const retryResponse = await openai.responses.create({
            model: "gpt-5",
            input: [
              { role: 'system', content: retryPrompt },
              { role: 'user', content: question }
            ],
            reasoning: { effort: 'low' },
            max_output_tokens: 2048,
            stream: false
          });

          let retryAiResponse = '';
          if ((retryResponse as any).output_text?.trim()) {
            retryAiResponse = (retryResponse as any).output_text.trim();
            console.log("✅ Retry successful, using simplified response");
            aiResponse = retryAiResponse;
          }
        } catch (retryError) {
          console.log("❌ Retry failed:", retryError);
        }

        // Final fallback if retry also failed
        if (!aiResponse || aiResponse.trim().length === 0) {
          console.log("❌ Both attempts failed - using fallback response");
          return res.json({
            answer: {
              tldr: "No data available for analysis",
              bullets: ["Unable to analyze your property data at this time"],
              actions: [{ label: "Please try your question again", due: "Now" }],
              caveats: "The AI assistant is temporarily unavailable"
            },
            sources: ["Property Database"],
            confidence: 0.3
          });
        }
      }

      try {
        // Handle response parsing - direct JSON vs. text
        let structuredResponse;
        
        if (isJsonResponse) {
          // Already parsed JSON object from API
          structuredResponse = JSON.parse(aiResponse);
        } else {
          // Clean the response by removing potential code fences and whitespace
          let cleanResponse = aiResponse.trim();
          if (cleanResponse.startsWith('```json')) {
            cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/```\s*$/, '');
          } else if (cleanResponse.startsWith('```')) {
            cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/```\s*$/, '');
          }
          
          try {
            structuredResponse = JSON.parse(cleanResponse);
          } catch (jsonError) {
            console.log("❌ JSON parsing failed:", jsonError);
            console.log("Raw response that failed to parse:", cleanResponse);
            
            // Robust fallback: create structured response from partial data
            const fallbackResponse = {
              tldr: "Unable to parse detailed analysis - raw data shows active properties and transactions",
              bullets: [
                `Found ${properties?.length || 0} properties with ${units?.length || 0} units`,
                `${transactions?.filter((t: any) => t.type === 'Income')?.length || 0} revenue transactions recorded`,
                `${tenantGroups?.filter((tg: any) => tg.status === 'Active')?.length || 0} active tenant groups`
              ],
              actions: [
                { label: "Review property data for completeness", due: "This week" },
                { label: "Ensure monthly rent amounts are set correctly", due: "Today" }
              ],
              caveats: "Response parsing failed - showing summary from raw data"
            };
            
            return res.json({
              answer: fallbackResponse,
              sources: ["Property Database"],
              confidence: 0.7
            });
          }
        }
        
        // Validate required fields and structure
        const isValidStructure = 
          structuredResponse &&
          typeof structuredResponse === 'object' &&
          typeof structuredResponse.tldr === 'string' &&
          Array.isArray(structuredResponse.bullets) &&
          Array.isArray(structuredResponse.actions);
        
        if (!isValidStructure) {
          console.log("❌ Invalid response structure:", structuredResponse);
          throw new Error("Invalid response structure from AI");
        }
        
        console.log("✅ Parsed AI response:", JSON.stringify(structuredResponse, null, 2));
        
        res.json({
          answer: structuredResponse,
          sources: ["Property Database"],
          confidence: 0.9
        });
        
      } catch (parseError) {
        console.log("❌ Complete parsing failure:", parseError);
        
        // Final fallback for any other parsing issues
        const emergencyFallback = {
          tldr: "Unable to analyze data due to processing error",
          bullets: ["Property data is available but analysis failed"],
          actions: [{ label: "Please try your question again", due: "Now" }],
          caveats: "AI assistant encountered a processing error"
        };
        
        res.json({
          answer: emergencyFallback,
          sources: ["Property Database"],
          confidence: 0.5
        });
      }

    } catch (error) {
      console.error("AI request failed:", error);
      res.status(500).json({ 
        message: "Failed to process AI request",
        error: (error as Error).message 
      });
    }
  });

  // Manual trigger for recurring transactions (for testing)
  app.post('/api/admin/generate-recurring', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      console.log(`🔄 Manually triggering recurring transaction generation for org: ${org.id}...`);
      await storage.generateRecurringTransactions();
      res.json({ message: "Recurring transactions generated successfully" });
    } catch (error) {
      console.error("Error generating recurring transactions:", error);
      res.status(500).json({ message: "Failed to generate recurring transactions" });
    }
  });

  // Generate missing mortgage expenses for existing properties (admin/debug route)
  app.post('/api/admin/generate-missing-mortgages', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const properties = await storage.getProperties(org.id);
      let generatedCount = 0;
      
      for (const property of properties) {
        // Check if property has mortgage data but no mortgage expenses
        if (property.monthlyMortgage) {
          const existingTransactions = await storage.getTransactionsByProperty(property.id);
          const hasMortgageExpense = existingTransactions.some(t => 
            t.category === "Mortgage" && t.type === "Expense" && t.isRecurring
          );
          
          if (!hasMortgageExpense) {
            console.log(`🏦 Creating missing mortgage expense for property: ${property.name || property.street}`);
            await createMortgageExpense({
              org,
              property,
              monthlyMortgage: property.monthlyMortgage,
              mortgageStartDate: property.mortgageStartDate || undefined,
              mortgageType: "Primary",
              storage
            });
            generatedCount++;
          }
          
          // Check for secondary mortgage
          if (property.monthlyMortgage2) {
            const hasSecondaryMortgageExpense = existingTransactions.some(t => 
              t.category === "Mortgage" && t.type === "Expense" && t.isRecurring && 
              t.description?.includes("Secondary")
            );
            
            if (!hasSecondaryMortgageExpense) {
              console.log(`🏦 Creating missing secondary mortgage expense for property: ${property.name || property.street}`);
              await createMortgageExpense({
                org,
                property,
                monthlyMortgage: property.monthlyMortgage2,
                mortgageStartDate: property.mortgageStartDate2 || undefined,
                mortgageType: "Secondary",
                storage
              });
              generatedCount++;
            }
          }
        }
      }
      
      res.json({ 
        message: `Generated ${generatedCount} missing mortgage expense${generatedCount === 1 ? '' : 's'}`,
        count: generatedCount
      });
    } catch (error) {
      console.error("Error generating missing mortgage expenses:", error);
      res.status(500).json({ message: "Failed to generate missing mortgage expenses" });
    }
  });

  // Generate missing revenue for existing leases (admin/debug route)
  app.post('/api/admin/generate-missing-revenues', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const leases = await storage.getLeases(org.id);
      const activeLeases = leases.filter(lease => lease.status === "Active");
      let generatedCount = 0;
      
      for (const lease of activeLeases) {
        // Get unit and property for this lease
        const unit = await storage.getUnit(lease.unitId);
        if (!unit) continue;
        
        const property = await storage.getProperty(unit.propertyId);
        if (!property) continue;
        
        // Check if lease has revenue transactions
        const existingTransactions = await storage.getTransactionsByProperty(property.id);
        const hasRevenue = existingTransactions.some(t => 
          t.type === "Income" && t.category === "Rental Income" && 
          t.notes?.includes(lease.id)
        );
        
        if (!hasRevenue) {
          console.log(`💰 Creating missing rent revenue for lease: ${lease.id} (${property.name || property.street})`);
          await createLeaseRentRevenue(org.id, lease);
          generatedCount++;
        }
      }
      
      res.json({ 
        message: `Generated ${generatedCount} missing lease revenue${generatedCount === 1 ? '' : 's'}`,
        count: generatedCount
      });
    } catch (error) {
      console.error("Error generating missing lease revenues:", error);
      res.status(500).json({ message: "Failed to generate missing lease revenues" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
