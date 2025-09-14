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
      description: `${mortgageType} mortgage payment for ${property.name || `${property.street}, ${property.city}`}`,
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
            mortgageStartDate: validatedData.mortgageStartDate,
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
            mortgageStartDate: validatedData.mortgageStartDate2,
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
            mortgageStartDate: validatedData.mortgageStartDate,
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
            mortgageStartDate: validatedData.mortgageStartDate2,
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
        if (validatedData.monthlyMortgage && validatedData.acquisitionDate) {
          await createMortgageExpense({
            org,
            property,
            monthlyMortgage: validatedData.monthlyMortgage,
            acquisitionDate: validatedData.acquisitionDate,
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
          mortgageStartDate: validatedData.mortgageStartDate,
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
          mortgageStartDate: validatedData.mortgageStartDate2,
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
      
      const validatedData = insertLeaseSchema.parse(requestData);
      const lease = await storage.createLease(validatedData);
      
      // Create lease reminder(s) if enabled
      await createLeaseReminders(org.id, lease);
      
      res.json(lease);
    } catch (error) {
      console.error("Error creating lease:", error);
      res.status(500).json({ message: "Failed to create lease" });
    }
  });

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
      
      const validatedData = insertSmartCaseSchema.parse({
        ...req.body,
        orgId: org.id,
      });
      
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
        recurringEndDate: req.body.recurringEndDate ? (typeof req.body.recurringEndDate === 'string' ? new Date(req.body.recurringEndDate) : req.body.recurringEndDate) : undefined,
        taxDeductible: req.body.taxDeductible !== undefined ? req.body.taxDeductible : true,
        isBulkEntry: req.body.isBulkEntry || false,
        isAmortized: req.body.isAmortized || false,
        amortizationYears: req.body.amortizationYears,
        amortizationStartDate: req.body.amortizationStartDate ? (typeof req.body.amortizationStartDate === 'string' ? new Date(req.body.amortizationStartDate) : req.body.amortizationStartDate) : undefined,
        amortizationMethod: req.body.amortizationMethod,
      };
      
      const validatedData = insertExpenseSchema.parse(cleanedData);
      
      const expense = await storage.createTransaction(validatedData as any);
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

      const userId = req.user.claims.sub;
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
        recurringEndDate: req.body.recurringEndDate ? (typeof req.body.recurringEndDate === 'string' ? new Date(req.body.recurringEndDate) : req.body.recurringEndDate) : undefined,
        propertyId: scope === "property" ? req.body.propertyId : undefined,
        entityId: scope === "operational" ? req.body.entityId : undefined,
        vendorId: req.body.vendorId,
        userId: (req.user as any).claims.sub,
        scope: req.body.scope || "property",
        taxDeductible: req.body.taxDeductible !== undefined ? req.body.taxDeductible : true,
        isBulkEntry: req.body.isBulkEntry || false,
        isAmortized: req.body.isAmortized || false,
        amortizationYears: req.body.amortizationYears,
        amortizationStartDate: req.body.amortizationStartDate ? (typeof req.body.amortizationStartDate === 'string' ? new Date(req.body.amortizationStartDate) : req.body.amortizationStartDate) : undefined,
        amortizationMethod: req.body.amortizationMethod,
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
      
      if (!property.monthlyMortgage || !property.acquisitionDate) {
        return res.status(400).json({ message: "Property must have mortgage details (monthly payment and acquisition date)" });
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
      const actualMortgageStartDate = new Date(property.mortgageStartDate || property.acquisitionDate);
      
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
        recurringEndDate: req.body.recurringEndDate ? (typeof req.body.recurringEndDate === 'string' ? new Date(req.body.recurringEndDate) : req.body.recurringEndDate) : undefined,
        taxDeductible: req.body.taxDeductible !== undefined ? req.body.taxDeductible : true,
      };
      
      const validatedData = insertRevenueSchema.parse(cleanedData);
      
      const revenue = await storage.createTransaction(validatedData as any);
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
        recurringEndDate: req.body.recurringEndDate ? (typeof req.body.recurringEndDate === 'string' ? new Date(req.body.recurringEndDate) : req.body.recurringEndDate) : undefined,
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
      
      const validatedData = insertReminderSchema.parse({
        ...req.body,
        orgId: org.id,
      });
      
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
      const updateData = req.body;
      
      // Convert date strings to Date objects if provided
      if (updateData.completedAt) {
        updateData.completedAt = new Date(updateData.completedAt);
      }
      if (updateData.dueAt) {
        updateData.dueAt = new Date(updateData.dueAt);
      }
      
      const reminder = await storage.updateReminder(id, updateData);
      res.json(reminder);
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
      await storage.deleteReminder(id);
      res.json({ message: "Reminder deleted successfully" });
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
        error: error.message 
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
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // AI Property Assistant endpoint
  app.post('/api/ai/ask', isAuthenticated, async (req: any, res) => {
    try {
      const { question, context } = req.body;
      const orgId = req.user.orgId;

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

      // Gather property data for context
      const [properties, units, tenantGroups, cases, reminders, transactions] = await Promise.all([
        storage.getProperties(orgId),
        storage.getAllUnits(orgId),
        storage.getTenantGroups(orgId),
        storage.getSmartCases(orgId),
        storage.getReminders(orgId),
        storage.getTransactions(orgId)
      ]);

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
        units: units.map(u => ({
          propertyName: u.propertyName,
          unitNumber: u.unitNumber,
          bedrooms: u.bedrooms,
          bathrooms: u.bathrooms,
          sqft: u.sqft,
          monthlyRent: u.monthlyRent
        })),
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
        reminders: reminders.map(r => ({
          title: r.title,
          description: r.description,
          type: r.type,
          status: r.status,
          priority: r.priority,
          dueAt: r.dueAt,
          completed: r.completed,
          scope: r.scope,
          propertyName: r.propertyName,
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
          }).reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0)
        }
      };

      // Create context-aware AI prompt
      let contextualGuidance = "";
      
      if (context === "reminders") {
        contextualGuidance = `

REMINDERS FOCUS: When answering, prioritize information about:
- Upcoming due dates and overdue items  
- Task prioritization and urgency
- Property-specific reminder patterns
- Maintenance scheduling and lease renewals
- Regulatory compliance deadlines`;
      }

      const prompt = `You are a helpful property management assistant. Answer questions about the user's property portfolio based on the provided data.
${contextualGuidance}

PROPERTY DATA:
${JSON.stringify(aiData, null, 2)}

USER QUESTION: ${question}

Please provide a helpful, specific answer based on the actual data provided. Keep responses concise but informative. If you need data that isn't available, mention what additional information would be helpful.`;

      // Call OpenAI
      const completion = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: "You are a knowledgeable property management assistant. Provide helpful, accurate answers based on the user's actual property data. Be concise but thorough."
          },
          {
            role: "user", 
            content: prompt
          }
        ],
        max_completion_tokens: 1500
      });

      const answer = completion.choices[0].message.content;

      res.json({
        answer: answer || "I'm sorry, I couldn't generate a response right now.",
        sources: ["Property Database"],
        confidence: 0.9
      });

    } catch (error) {
      console.error("AI request failed:", error);
      res.status(500).json({ 
        message: "Failed to process AI request",
        error: error.message 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
