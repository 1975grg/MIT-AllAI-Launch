import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { WebSocketServer, WebSocket } from 'ws';
import { ObjectStorageService } from "./objectStorage";
import { db } from "./db";
import { users } from "@shared/schema";
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
  insertAppointmentSchema,
  insertTransactionSchema,
  insertExpenseSchema,
  insertReminderSchema,
  contractorAvailabilityUpdateSchema,
} from "@shared/schema";
import OpenAI from "openai";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { aiTriageService } from "./aiTriage";
import { aiCoordinatorService } from "./aiCoordinator";
import { aiDuplicateDetectionService } from "./aiDuplicateDetection";
import { dataAuditService } from "./dataAudit";
// Mailla AI service import handled dynamically in endpoints

// Revenue schema for API validation
const insertRevenueSchema = insertTransactionSchema;
import { startCronJobs } from "./cronJobs";

// Ensure MIT properties exist in database
async function initializeMITProperties() {
  try {
    console.log('🏢 Initializing MIT properties...');
    
    // Find or create the MIT housing organization
    let mitOrg;
    const orgs = await storage.getOrganizations();
    
    // Look for existing MIT housing organization
    mitOrg = orgs.find(org => org.name === 'MIT Housing' || org.id === 'mit-housing');
    
    if (!mitOrg) {
      console.log('🏫 Creating MIT Housing organization...');
      
      // Find an existing user to be the owner (use the first user if available)
      const allUsers = await db.select().from(users).limit(1);
      let ownerId = 'default-owner';
      
      if (allUsers.length > 0) {
        ownerId = allUsers[0].id;
        console.log(`Using existing user ${ownerId} as MIT Housing owner`);
      } else {
        // Create a system user if no users exist
        console.log('Creating system user for MIT Housing...');
        const systemUser = {
          id: 'mit-system-user',
          email: 'system@mit.edu',
          name: 'MIT System',
          createdAt: new Date()
        };
        const [createdUser] = await db.insert(users).values(systemUser).returning();
        ownerId = createdUser.id;
      }
      
      // Create MIT housing organization if it doesn't exist
      const orgData = {
        id: 'mit-housing',
        name: 'MIT Housing',
        email: 'housing@mit.edu',
        phone: '617-253-2301',
        address: '77 Massachusetts Avenue',
        city: 'Cambridge',
        state: 'MA',
        zipCode: '02139',
        ownerId: ownerId,
        createdAt: new Date()
      };
      
      try {
        mitOrg = await storage.createOrganization(orgData);
        console.log('✅ Created MIT Housing organization');
      } catch (error) {
        console.error('❌ Failed to create MIT Housing organization:', error);
        return;
      }
    }
    
    const mitProperties = [
      { id: 'mit-senior-house', name: 'Senior House', street: '3 Ames Street' },
      { id: 'mit-burton-conner', name: 'Burton Conner', street: '410 Memorial Drive' },
      { id: 'mit-next-house', name: 'Next House', street: '500 Memorial Drive' },
      { id: 'mit-simmons-hall', name: 'Simmons Hall', street: '229 Vassar Street' },
      { id: 'mit-macgregor-house', name: 'MacGregor House', street: '450 Memorial Drive' },
      { id: 'mit-tang-hall', name: 'Tang Hall', street: '550 Memorial Drive' },
      { id: 'mit-new-house', name: 'New House', street: '476 Memorial Drive' },
      { id: 'mit-baker-house', name: 'Baker House', street: '362 Memorial Drive' },
      { id: 'mit-mccormick-hall', name: 'McCormick Hall', street: '320 Memorial Drive' },
      { id: 'mit-random-hall', name: 'Random Hall', street: '282 Memorial Drive' },
      { id: 'mit-westgate', name: 'Westgate', street: '222 Albany Street' },
      { id: 'mit-ashdown-house', name: 'Ashdown House', street: '305 Memorial Drive' },
      { id: 'mit-sidney-pacific', name: 'Sidney-Pacific', street: '70 Pacific Street' }
    ];
    
    for (const prop of mitProperties) {
      // Check if property already exists
      const existing = await storage.getProperty(prop.id).catch(() => null);
      if (!existing) {
        // Create new property with duplicate key protection
        try {
          const propertyData = {
            id: prop.id,
            orgId: mitOrg.id,
            name: prop.name,
            type: 'Residential Building',
            street: prop.street,
            city: 'Cambridge',
            state: 'MA',
            zipCode: '02139',
            country: 'US',
            status: 'Active' as const,
            createdAt: new Date()
          };
          
          await storage.createProperty(propertyData);
          console.log(`✅ Created MIT property: ${prop.name}`);
        } catch (error: any) {
          if (error?.code === '23505') {
            // Duplicate key - property was created by another process, skip
            console.log(`✓ MIT property already exists: ${prop.name}`);
          } else {
            throw error;
          }
        }
      } else if (existing.orgId !== mitOrg.id) {
        // Fix existing property with wrong organization
        console.log(`🔧 Reassigning ${prop.name} from org ${existing.orgId} to MIT Housing org ${mitOrg.id}`);
        await storage.updateProperty(prop.id, {
          orgId: mitOrg.id,
          name: prop.name, // Ensure name is correct
          type: 'Residential Building',
          street: prop.street,
          city: 'Cambridge',
          state: 'MA',
          zipCode: '02139',
          country: 'US'
        });
        console.log(`✅ Fixed MIT property: ${prop.name}`);
      } else {
        console.log(`✓ MIT property already correct: ${prop.name}`);
      }
    }
    
    console.log('🏢 MIT properties initialization complete');
  } catch (error) {
    console.error('❌ Error initializing MIT properties:', error);
    // Don't throw - let the app continue even if initialization fails
  }
}

// ✅ Mailla AI Triage validation schemas
const startTriageSchema = z.object({
  initialRequest: z.string().min(10).max(2000)
  // studentId and orgId will be inferred from authenticated session
});

const continueTriageSchema = z.object({
  conversationId: z.string().min(1).max(100),
  studentMessage: z.string().min(1).max(1000),
  mediaUrls: z.array(z.string().url()).optional()
});

const completeTriageSchema = z.object({
  conversationId: z.string().min(1).max(100)
});

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

  // Initialize MIT properties
  await initializeMITProperties();

  // Role-based authorization middleware
  function requireRole(allowedRoles: string[]) {
    return async (req: any, res: any, next: any) => {
      try {
        const userId = req.user.claims.sub;
        const userOrg = await storage.getUserOrganization(userId);
        let userRole = userOrg?.role;
        
        // SECURITY: Never default to admin - require explicit role assignment
        // Users must have roles explicitly assigned by administrators
        
        if (!userRole) {
          return res.status(403).json({ 
            message: "User not assigned to organization or role. Please contact administrator." 
          });
        }
        
        if (!allowedRoles.includes(userRole)) {
          return res.status(403).json({ 
            message: "Insufficient permissions for this operation." 
          });
        }
        
        // Add user role to request for further use
        req.userRole = userRole;
        next();
      } catch (error) {
        console.error("Error checking user role:", error);
        res.status(500).json({ message: "Failed to verify permissions" });
      }
    };
  }

  // Convenience middleware for admin/manager/staff only
  const requireAdmin = requireRole(['admin', 'manager', 'staff']);
  
  // 🔧 Contractor/vendor middleware for maintenance operations
  const requireVendor = requireRole(['vendor', 'contractor', 'admin']);

  // 🔧 Temporary role assignment endpoint for testing contractor functionality (ADMIN ONLY)
  app.post('/api/auth/assign-contractor-role', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get or create organization for user
      let userOrg = await storage.getUserOrganization(userId);
      if (!userOrg) {
        const user = await storage.getUser(userId);
        if (user) {
          userOrg = await storage.createOrganization({
            name: `${user.firstName || user.email || 'User'}'s Maintenance`,
            ownerId: userId,
          });
        }
      }
      
      if (!userOrg) {
        return res.status(404).json({ message: "Could not create organization" });
      }
      
      // Update user role to contractor using proper storage method
      await storage.updateOrganizationMemberRole(userId, userOrg.id, 'contractor');
      console.log(`✅ User ${userId} assigned contractor role in org ${userOrg.id}`);
      
      res.json({ message: "Contractor role assigned successfully", role: 'contractor' });
    } catch (error) {
      console.error("Error assigning contractor role:", error);
      res.status(500).json({ message: "Failed to assign contractor role" });
    }
  });

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Get user's role from organization membership
      const userOrg = await storage.getUserOrganization(userId);
      let userRole = userOrg?.role;
      
      // SECURITY: Never default to admin - require explicit role assignment
      // Users must have roles explicitly assigned by administrators
      
      if (!userRole) {
        return res.status(403).json({ 
          message: "User not assigned to organization or role. Please contact administrator." 
        });
      }
      
      // Validate role is one of expected values
      const validRoles = ['admin', 'manager', 'staff', 'vendor', 'contractor'];
      if (!validRoles.includes(userRole)) {
        return res.status(403).json({ 
          message: "Invalid user role. Please contact administrator." 
        });
      }
      
      res.json({
        ...user,
        role: userRole
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Organization routes - Allow access for organization bootstrapping  
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
  app.post('/api/entities/backfill-reminders', isAuthenticated, requireAdmin, async (req: any, res) => {
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
  app.get('/api/entities', isAuthenticated, requireAdmin, async (req: any, res) => {
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

  app.post('/api/entities', isAuthenticated, requireAdmin, async (req: any, res) => {
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

  app.patch('/api/entities/:id', isAuthenticated, requireAdmin, async (req: any, res) => {
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
  app.patch('/api/entities/:id/archive', isAuthenticated, requireAdmin, async (req: any, res) => {
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
  app.patch('/api/entities/:id/unarchive', isAuthenticated, requireAdmin, async (req: any, res) => {
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
  app.delete('/api/entities/:id/permanent', isAuthenticated, requireAdmin, async (req: any, res) => {
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
  app.get('/api/properties', isAuthenticated, requireAdmin, async (req: any, res) => {
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

  app.get('/api/properties/:id', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const property = await storage.getProperty(req.params.id);
      if (!property) return res.status(404).json({ message: "Property not found" });
      
      // Verify property belongs to user's organization  
      if (property.orgId !== org.id) {
        return res.status(403).json({ message: "Access denied: Property belongs to another organization" });
      }
      
      res.json(property);
    } catch (error) {
      console.error("Error fetching property:", error);
      res.status(500).json({ message: "Failed to fetch property" });
    }
  });

  app.post('/api/properties', isAuthenticated, requireAdmin, async (req: any, res) => {
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

  app.patch('/api/properties/:id', isAuthenticated, requireAdmin, async (req: any, res) => {
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
  app.patch('/api/properties/:id/archive', isAuthenticated, requireAdmin, async (req: any, res) => {
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
  app.patch('/api/properties/:id/unarchive', isAuthenticated, requireAdmin, async (req: any, res) => {
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
  app.delete('/api/properties/:id/permanent', isAuthenticated, requireAdmin, async (req: any, res) => {
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
      
      // ✅ DEMO FIX: Show both user's org AND MIT Housing cases for full demo experience
      const userCases = await storage.getSmartCases(org.id);
      const mitCases = await storage.getSmartCases("30033c31-7111-4c83-b796-5f7f33786774"); // MIT Housing
      
      // Combine and deduplicate cases, add user-friendly display numbers
      const allCases = [...userCases, ...mitCases].filter((caseItem, index, self) => 
        index === self.findIndex(c => c.id === caseItem.id)
      );
      
      // Helper function to match Mailla's case number generation
      const generateFriendlyCaseNumber = (caseId: string): string => {
        const hash = caseId.split('-')[0]; // Use first part of UUID  
        const num = parseInt(hash.substring(0, 6), 16) % 9000 + 1000; // Generate 1000-9999
        return `MIT-${num}`;
      };
      
      // Add user-friendly case numbers for display (keep original ID as primary key)
      const casesWithFriendlyNumbers = allCases.map((caseItem) => ({
        ...caseItem,
        displayNumber: generateFriendlyCaseNumber(caseItem.id) // Same algorithm as Mailla
      }));
      
      res.json(casesWithFriendlyNumbers);
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

  // REMOVED: Duplicate PATCH endpoint - see contractor-specific one below at line ~5484

  // ========================================
  // 🤝 CONTRACTOR ACCEPTANCE/REJECTION ENDPOINTS
  // ========================================
  
  // Input validation schemas
  const acceptCaseSchema = z.object({
    estimatedArrival: z.string().optional(),
    notes: z.string().max(500).optional()
  });

  const declineCaseSchema = z.object({
    reason: z.string().min(1, "Decline reason is required").max(200),
    notes: z.string().max(500).optional()
  });
  
  // Contractor accepts a maintenance case
  app.post('/api/contractor/cases/:caseId/accept', isAuthenticated, requireVendor, async (req: any, res) => {
    try {
      const { caseId } = req.params;
      const validatedInput = acceptCaseSchema.parse(req.body);
      const { estimatedArrival, notes } = validatedInput;
      const userId = req.user.claims.sub;
      const userOrg = await storage.getUserOrganization(userId);
      
      if (!userOrg) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Get contractor info FIRST (before any checks that reference it)
      const contractor = await storage.getVendorByUserId(userId);
      if (!contractor) {
        return res.status(404).json({ message: "Contractor profile not found" });
      }

      // Get the case and verify it exists and is available
      const smartCase = await storage.getSmartCase(caseId);
      if (!smartCase) {
        return res.status(404).json({ message: "Case not found" });
      }

      // 🚨 SECURITY FIX: Verify contractor belongs to same org as case
      if (smartCase.orgId !== userOrg.id) {
        return res.status(403).json({ message: "Access denied to this case" });
      }

      // Allow idempotency: if already accepted by same contractor, return success
      if (smartCase.status === 'Scheduled' && smartCase.contractorId === contractor.id) {
        return res.json({ 
          message: "Case already accepted by you",
          contractor: contractor.name,
          estimatedArrival
        });
      }

      // Check if case is available for acceptance (only allow specific initial states)
      const acceptableStates = ['New', 'In Review'];
      if (!acceptableStates.includes(smartCase.status || 'New')) {
        return res.status(400).json({ message: "Case is no longer available for acceptance" });
      }
      
      // Check if case is already assigned to someone else
      if (smartCase.contractorId && smartCase.contractorId !== contractor.id) {
        return res.status(400).json({ message: "Case is already assigned to another contractor" });
      }

      // 🚨 ATOMIC UPDATE: Use optimistic concurrency control
      // This is the best we can do with current storage interface
      const finalCheck = await storage.getSmartCase(caseId);
      
      // Final atomic checks before update
      if (!finalCheck || 
          !acceptableStates.includes(finalCheck.status || 'New') ||
          (finalCheck.contractorId && finalCheck.contractorId !== contractor.id) ||
          finalCheck.orgId !== userOrg.id) {
        return res.status(409).json({ 
          message: "Case was accepted by another contractor or is no longer available" 
        });
      }

      // Update case to Scheduled status (best effort atomicity)
      await storage.updateSmartCase(caseId, {
        status: 'Scheduled',
        contractorId: contractor.id
      });

      // Send notifications about case acceptance
      await notifyOfCaseAcceptance(smartCase, contractor, estimatedArrival, userOrg.id);

      res.json({ 
        message: "Case accepted successfully",
        contractor: contractor.name,
        estimatedArrival
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid input", 
          details: error.errors 
        });
      }
      console.error("Error accepting case:", error);
      res.status(500).json({ message: "Failed to accept case" });
    }
  });

  // Contractor declines a maintenance case
  app.post('/api/contractor/cases/:caseId/decline', isAuthenticated, requireVendor, async (req: any, res) => {
    try {
      const { caseId } = req.params;
      const validatedInput = declineCaseSchema.parse(req.body);
      const { reason, notes } = validatedInput;
      const userId = req.user.claims.sub;
      const userOrg = await storage.getUserOrganization(userId);
      
      if (!userOrg) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Get the case
      const smartCase = await storage.getSmartCase(caseId);
      if (!smartCase) {
        return res.status(404).json({ message: "Case not found" });
      }

      // 🚨 SECURITY FIX: Verify contractor belongs to same org as case
      if (smartCase.orgId !== userOrg.id) {
        return res.status(403).json({ message: "Access denied to this case" });
      }

      // Get contractor info
      const contractor = await storage.getVendorByUserId(userId);
      if (!contractor) {
        return res.status(404).json({ message: "Contractor profile not found" });
      }

      // Log the decline and potentially escalate
      await handleCaseDecline(smartCase, contractor, reason, notes);

      res.json({ message: "Case declined successfully" });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid input", 
          details: error.errors 
        });
      }
      console.error("Error declining case:", error);
      res.status(500).json({ message: "Failed to decline case" });
    }
  });

  // Get available cases for contractor
  app.get('/api/contractor/available-cases', isAuthenticated, requireVendor, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userOrg = await storage.getUserOrganization(userId);
      
      if (!userOrg) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Get contractor profile to check specializations
      const contractor = await storage.getVendorByUserId(userId);
      if (!contractor) {
        return res.status(404).json({ message: "Contractor profile not found" });
      }

      // Get unassigned cases that match contractor's skills
      const availableCases = await storage.getAvailableSmartCases(userOrg.id);
      
      // Sort by urgency (Critical first, then by creation time)
      const sortedCases = availableCases.sort((a: any, b: any) => {
        const urgencyOrder = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
        const aUrgency = urgencyOrder[a.priority as keyof typeof urgencyOrder] || 1;
        const bUrgency = urgencyOrder[b.priority as keyof typeof urgencyOrder] || 1;
        
        if (aUrgency !== bUrgency) return bUrgency - aUrgency;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      res.json(sortedCases);

    } catch (error) {
      console.error("Error fetching available cases:", error);
      res.status(500).json({ message: "Failed to fetch available cases" });
    }
  });

  // AI Override endpoint - allows humans to override AI triage decisions
  const aiOverrideSchema = z.object({
    category: z.string().min(1, "Category is required"),
    priority: z.enum(["Low", "Medium", "High", "Critical"]),
    contractorType: z.string().min(1, "Contractor type is required"),
    reasoning: z.string().min(10, "Detailed reasoning is required for audit trail")
  });

  app.patch('/api/cases/:id/ai-override', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      // Validate override data
      const overrideData = aiOverrideSchema.parse(req.body);
      
      // Get the current case to preserve AI analysis data
      const existingCase = await storage.getSmartCase(req.params.id);
      if (!existingCase) {
        return res.status(404).json({ message: "Case not found" });
      }

      // SECURITY: Verify case belongs to user's organization
      if (existingCase.orgId !== org.id) {
        return res.status(403).json({ message: "Access denied: Case belongs to different organization" });
      }

      // Parse existing AI triage data
      const existingAiData = existingCase.aiTriageJson || {};
      
      // Create override record in AI analysis data
      const overrideRecord = {
        overriddenAt: new Date().toISOString(),
        overriddenBy: userId,
        originalDecision: {
          category: existingCase.category,
          priority: existingCase.priority,
          aiCategory: existingAiData?.aiAnalysis?.category,
          aiUrgency: existingAiData?.aiAnalysis?.urgency,
          aiContractorType: existingAiData?.aiAnalysis?.contractorType
        },
        newDecision: {
          category: overrideData.category,
          priority: overrideData.priority,
          contractorType: overrideData.contractorType
        },
        reasoning: overrideData.reasoning,
        humanOverride: true
      };

      // Update case with human override data
      const updatedCaseData = {
        category: overrideData.category,
        priority: overrideData.priority,
        aiTriageJson: {
          ...existingAiData,
          humanOverride: overrideRecord
        }
      };

      console.log(`🔄 AI Override Applied by ${userId} for case ${req.params.id}: ${overrideData.category} (${overrideData.priority})`);
      console.log(`📝 Override Reason: ${overrideData.reasoning}`);

      const updatedCase = await storage.updateSmartCase(req.params.id, updatedCaseData);
      
      // Log the override event for audit purposes
      console.log(`📊 AI Override Complete: Case ${req.params.id} - ${overrideData.category} → ${overrideData.priority} priority`);
      
      res.json({
        success: true,
        case: updatedCase,
        override: overrideRecord,
        message: "AI decision successfully overridden"
      });

    } catch (error) {
      console.error("Error applying AI override:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid override data", 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: "Failed to apply AI override" });
    }
  });

  // Input validation schema for public student requests
  const publicStudentRequestSchema = z.object({
    studentName: z.string().min(2, "Name must be at least 2 characters"),
    studentEmail: z.string().email("Please enter a valid email address"),
    studentPhone: z.string().optional(),
    building: z.string().min(1, "Building is required"),
    room: z.string().min(1, "Room number is required"),
    title: z.string().min(5, "Title must be at least 5 characters"),
    description: z.string().min(10, "Description must be at least 10 characters"),
    category: z.string().min(1, "Category is required"),
    priority: z.enum(["Low", "Medium", "High", "Critical"], {
      errorMap: () => ({ message: "Priority must be Low, Medium, High, or Critical" })
    }),
    photos: z.array(z.string()).max(5, "Maximum 5 photos allowed").optional() // Base64 encoded images for AI analysis (max 5)
  });

  // Rate limiter for public endpoints (protect against spam/abuse)
  const publicRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: {
      message: "Too many maintenance requests from this IP. Please try again in 15 minutes."
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // In-flight organization creation guard to prevent race conditions
  let mitOrgPromise: Promise<any> | null = null;
  let mitOrgCache: any = null;
  
  const getMITOrganization = async () => {
    if (mitOrgCache) {
      return mitOrgCache;
    }
    
    if (mitOrgPromise) {
      return mitOrgPromise;
    }
    
    mitOrgPromise = (async () => {
      try {
        // First check if MIT organization already exists by looking for system user's org
        let systemUser = await storage.getUser("mit-system");
        if (!systemUser) {
          systemUser = await storage.upsertUser({
            id: "mit-system",
            email: "system@mit.edu",
            firstName: "MIT",
            lastName: "Housing System"
          });
        }
        
        // Try to get existing organization for this user
        const existingOrg = await storage.getUserOrganization(systemUser.id);
        if (existingOrg) {
          mitOrgCache = existingOrg;
          return existingOrg;
        }
        
        // Create new organization if none exists
        const newOrg = await storage.createOrganization({
          name: "MIT Housing Maintenance",
          ownerId: systemUser.id,
        });
        
        mitOrgCache = newOrg;
        return newOrg;
      } catch (error) {
        console.error("Error initializing MIT organization:", error);
        throw new Error("Failed to initialize MIT organization");
      } finally {
        mitOrgPromise = null;
      }
    })();
    
    return mitOrgPromise;
  };

  // ✅ Mailla AI Triage Agent endpoints (public for students, optional auth)
  app.post('/api/mailla/start-triage', publicRateLimit, async (req: any, res) => {
    try {
      // ✅ Handle both authenticated and anonymous students
      let studentId: string;
      let orgId: string;
      
      if (req.user?.claims?.sub) {
        // Authenticated user - use real identity
        studentId = req.user.claims.sub;
        const userOrg = await storage.getUserOrganization(studentId);
        if (!userOrg) {
          return res.status(403).json({ error: 'User organization not found' });
        }
        orgId = userOrg.id;
      } else {
        // Anonymous student - create temporary identity
        studentId = `anonymous-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        orgId = "30033c31-7111-4c83-b796-5f7f33786774"; // MIT Housing Maintenance organization
      }

      // ✅ Validate only the request content, not identity
      const { initialRequest } = req.body;
      if (!initialRequest || typeof initialRequest !== 'string' || initialRequest.length < 10) {
        return res.status(400).json({ error: 'Invalid initial request - must be at least 10 characters' });
      }
      
      const { maillaAIService } = await import('./maillaAIService');
      const response = await maillaAIService.startTriageConversation(
        studentId, 
        orgId, 
        initialRequest
      );
      
      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid input', details: error.errors });
      }
      console.error('Error starting Mailla triage:', error);
      res.status(500).json({ error: 'Failed to start triage conversation' });
    }
  });

  app.post('/api/mailla/continue-triage', publicRateLimit, async (req: any, res) => {
    try {
      // ✅ Validate conversation ownership (supports both auth'd and anonymous)
      const { conversationId, studentMessage, mediaUrls } = req.body;
      
      // Verify conversation exists
      const conversation = await storage.getTriageConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // For authenticated users, verify ownership
      if (req.user?.claims?.sub && conversation.studentId !== req.user.claims.sub) {
        return res.status(403).json({ error: 'Access denied to this conversation' });
      }
      
      const { maillaAIService } = await import('./maillaAIService');
      const response = await maillaAIService.continueTriageConversation({
        conversationId,
        studentMessage,
        mediaUrls: mediaUrls || []
      });
      
      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid input', details: error.errors });
      }
      console.error('Error continuing Mailla triage:', error);
      res.status(500).json({ error: 'Failed to continue triage conversation' });
    }
  });

  app.post('/api/mailla/complete-triage', publicRateLimit, async (req: any, res) => {
    try {
      // ✅ Validate conversation ownership (supports both auth'd and anonymous)
      const { conversationId } = req.body;
      
      // Verify conversation exists
      const conversation = await storage.getTriageConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // For authenticated users, verify ownership
      if (req.user?.claims?.sub && conversation.studentId !== req.user.claims.sub) {
        return res.status(403).json({ error: 'Access denied to this conversation' });
      }
      
      // 🎯 MANDATORY: Enforce contact collection before completing triage
      const triageData = conversation.triageData as any;
      const conversationSlots = triageData?.conversationSlots || {};
      
      // Check if all required contact info is present
      const hasRequiredContact = conversationSlots.studentName && 
                                conversationSlots.studentEmail && 
                                conversationSlots.studentPhone;
      
      if (!hasRequiredContact) {
        console.log(`🚨 CONTACT COLLECTION BLOCKED: Missing required info for conversation ${conversationId}`);
        console.log(`📞 Contact Status: Name: ${!!conversationSlots.studentName}, Email: ${!!conversationSlots.studentEmail}, Phone: ${!!conversationSlots.studentPhone}`);
        
        const missing = [];
        if (!conversationSlots.studentName) missing.push('full name');
        if (!conversationSlots.studentEmail) missing.push('email');
        if (!conversationSlots.studentPhone) missing.push('phone number');
        
        return res.status(400).json({ 
          error: 'Contact information required',
          message: `Please provide your ${missing.join(' and ')} before we can create your maintenance request.`,
          missingFields: missing
        });
      }
      
      console.log(`✅ CONTACT VALIDATION PASSED: All required info collected for conversation ${conversationId}`);
      
      const { maillaAIService } = await import('./maillaAIService');
      const response = await maillaAIService.completeTriageConversation(conversationId);
      
      res.json(response);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid input', details: error.errors });
      }
      console.error('Error completing Mailla triage:', error);
      res.status(500).json({ error: 'Failed to complete triage conversation' });
    }
  });

  // ✅ REMOVED: GET conversation endpoint for security
  // The architect identified this as a critical security vulnerability (IDOR)
  // Students should only access their conversations through the startTriage response
  // which includes the conversation ID for subsequent continue/complete calls

  // ========================================
  // 📬 NOTIFICATION SERVICE: Send real-time alerts to contractors and admins
  // ========================================
  async function sendSmartCaseNotifications(smartCase: any, workflowData: any, aiTriage: any, orgId: string) {
    try {
      console.log(`📬 Sending notifications for case ${smartCase.id} - ${aiTriage.urgency} priority`);
      
      // 1. Notify assigned contractor (if auto-assigned)
      if (workflowData.autoScheduling.contractorAssigned) {
        const contractor = await storage.getVendor(workflowData.autoScheduling.contractorAssigned);
        if (contractor && contractor.userId) {
          await storage.createNotification(
            contractor.userId,
            `🔧 New Maintenance Assignment: ${smartCase.title}`,
            `You've been assigned a ${aiTriage.urgency.toLowerCase()} priority maintenance case at ${smartCase.buildingName || 'MIT Housing'}. ${smartCase.description.substring(0, 100)}...`,
            'urgent'
          );
          console.log(`🔔 Notified assigned contractor: ${contractor.name}`);
        }
      } else {
        // 2. Notify all available contractors in the category
        const availableContractors = await storage.getVendors(orgId);
        const categoryContractors = availableContractors.filter(c => c.isActiveContractor);
        
        for (const contractor of categoryContractors.slice(0, 5)) { // Limit to 5 contractors
          if (contractor.userId) {
            await storage.createNotification(
              contractor.userId,
              `🆕 New Maintenance Request Available: ${smartCase.title}`,
              `A ${aiTriage.urgency.toLowerCase()} priority ${aiTriage.category} maintenance request is available at ${smartCase.buildingName || 'MIT Housing'}. First to accept gets the job!`,
              aiTriage.urgency === 'Critical' ? 'urgent' : 'info'
            );
          }
        }
        console.log(`🔔 Notified ${categoryContractors.length} available contractors`);
      }
      
      // 3. Always notify admins for oversight
      const adminMembers = await storage.getOrganizationMembersByRole(orgId, 'admin');
      for (const admin of adminMembers) {
        await storage.createNotification(
          admin.userId,
          `🎯 New Maintenance Case Created: ${smartCase.title}`,
          `Case #${smartCase.id.substring(0, 8)} - ${aiTriage.urgency} priority ${aiTriage.category} case ${workflowData.autoScheduling.contractorAssigned ? 'auto-assigned' : 'awaiting contractor'}. Building: ${smartCase.buildingName || 'Not specified'}`,
          aiTriage.urgency === 'Critical' ? 'urgent' : 'info'
        );
      }
      console.log(`🔔 Notified ${adminMembers.length} administrators`);
      
      // 4. Emergency notifications for critical cases
      if (aiTriage.urgency === 'Critical' || aiTriage.safetyRisk === 'High') {
        // Create emergency escalation reminder for 15 minutes if no contractor accepts
        await storage.createReminder({
          orgId,
          title: `EMERGENCY: Case ${smartCase.id.substring(0, 8)} Unassigned`,
          type: 'Maintenance', 
          dueAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
          leadDays: 0,
          channels: ['inapp'],
          payloadJson: { caseId: smartCase.id, escalationType: 'emergency_unassigned' }
        });
        console.log(`🚨 Emergency escalation reminder set for 15 minutes`);
      }
      
      console.log(`✅ Notifications sent successfully for case ${smartCase.id}`);
    } catch (error) {
      console.error(`❌ Failed to send notifications for case ${smartCase.id}:`, error);
      // Don't throw - notification failures shouldn't block case creation
    }
  }

  // ========================================
  // 📬 HELPER FUNCTIONS: Case acceptance and decline notifications
  // ========================================
  async function notifyOfCaseAcceptance(smartCase: any, contractor: any, estimatedArrival: string, orgId: string) {
    try {
      // Notify admins that case was accepted
      const adminMembers = await storage.getOrganizationMembersByRole(orgId, 'admin');
      for (const admin of adminMembers) {
        await storage.createNotification(
          admin.userId,
          `✅ Case Accepted: ${smartCase.title}`,
          `${contractor.name} has accepted case #${smartCase.id.substring(0, 8)}. ${estimatedArrival ? `Estimated arrival: ${estimatedArrival}` : 'Starting work soon.'}`,
          'success'
        );
      }
      
      console.log(`✅ Notifications sent for case acceptance by ${contractor.name}`);
    } catch (error) {
      console.error('Failed to send case acceptance notifications:', error);
    }
  }

  async function handleCaseDecline(smartCase: any, contractor: any, reason: string, notes?: string) {
    try {
      // Log the decline
      console.log(`❌ Case ${smartCase.id} declined by ${contractor.name}: ${reason}`);
      
      // Check if this was a critical case and needs immediate escalation
      if (smartCase.priority === 'Critical') {
        // Notify admins immediately for critical cases
        const adminMembers = await storage.getOrganizationMembersByRole(smartCase.orgId, 'admin');
        for (const admin of adminMembers) {
          await storage.createNotification(
            admin.userId,
            `🚨 URGENT: Critical Case Declined`,
            `${contractor.name} declined critical case #${smartCase.id.substring(0, 8)}. Reason: ${reason}. Immediate reassignment needed!`,
            'urgent'
          );
        }
        
        // Find backup contractors and notify them
        const backupContractors = await storage.getVendors(smartCase.orgId);
        const activeBackups = backupContractors.filter(c => 
          c.isActiveContractor && c.id !== contractor.id
        ).slice(0, 3); // Top 3 backup contractors

        for (const backup of activeBackups) {
          if (backup.userId) {
            await storage.createNotification(
              backup.userId,
              `🚨 URGENT: Critical Case Needs Immediate Attention`,
              `Critical ${smartCase.category} maintenance case at ${smartCase.buildingName || 'MIT Housing'} was declined by another contractor. URGENT response needed!`,
              'urgent'
            );
          }
        }
      } else {
        // For non-critical cases, just notify admins for tracking
        const adminMembers = await storage.getOrganizationMembersByRole(smartCase.orgId, 'admin');
        for (const admin of adminMembers) {
          await storage.createNotification(
            admin.userId,
            `↩️ Case Declined: ${smartCase.title}`,
            `${contractor.name} declined case #${smartCase.id.substring(0, 8)}. Reason: ${reason}. Case returned to available pool.`,
            'info'
          );
        }
      }
      
    } catch (error) {
      console.error('Failed to handle case decline:', error);
    }
  }

  // Public student maintenance request endpoint (no authentication required)
  app.post('/api/cases/public', publicRateLimit, async (req: any, res) => {
    try {
      // Add basic request size/content validation for security
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ 
          message: "Invalid request body"
        });
      }

      // Validate input first with Zod
      const validatedInput = publicStudentRequestSchema.parse(req.body);
      
      // Limit field lengths for security (prevent abuse)
      if (validatedInput.title.length > 200) {
        return res.status(400).json({ 
          message: "Title is too long (maximum 200 characters)"
        });
      }
      
      if (validatedInput.description.length > 2000) {
        return res.status(400).json({ 
          message: "Description is too long (maximum 2000 characters)"
        });
      }
      
      // SECURITY: Validate photo uploads to prevent DoS attacks
      if (validatedInput.photos && validatedInput.photos.length > 0) {
        for (let i = 0; i < validatedInput.photos.length; i++) {
          const photo = validatedInput.photos[i];
          
          // Check if it's a valid base64 string
          if (!/^data:image\/(jpeg|jpg|png|gif|webp);base64,/.test(photo)) {
            return res.status(400).json({
              message: "Invalid photo format. Only JPEG, PNG, GIF, and WebP images are allowed."
            });
          }
          
          // Check file size (2MB limit per photo)
          const base64Data = photo.split(',')[1];
          if (base64Data && base64Data.length > 2.8 * 1024 * 1024) { // ~2MB in base64
            return res.status(413).json({
              message: `Photo ${i + 1} is too large. Maximum size is 2MB per photo.`
            });
          }
        }
      }
      
      // Get MIT organization (race-condition safe)
      const mitOrg = await getMITOrganization();
      
      // Run AI triage analysis on the maintenance request
      console.log(`🤖 Running AI triage analysis for: ${validatedInput.title}${validatedInput.photos ? ` (with ${validatedInput.photos.length} photos)` : ''}`);
      const aiTriage = await aiTriageService.analyzeMaintenanceRequest({
        title: validatedInput.title,
        description: validatedInput.description,
        category: validatedInput.category,
        priority: validatedInput.priority,
        building: validatedInput.building,
        room: validatedInput.room,
        photos: validatedInput.photos, // Pass photos for AI vision analysis
        orgId: mitOrg.id, // SECURITY: Always use MIT org for public requests
        studentContact: {
          name: validatedInput.studentName,
          email: validatedInput.studentEmail,
          phone: validatedInput.studentPhone,
          building: validatedInput.building,
          room: validatedInput.room
        }
      });
      
      console.log(`🎯 AI Analysis complete - Category: ${aiTriage.category}, Urgency: ${aiTriage.urgency}, Contractor: ${aiTriage.contractorType}`);
      
      // 🔍 AI DUPLICATE DETECTION - Phase 2 Enhancement
      console.log(`🔍 Running AI duplicate detection for: ${validatedInput.title}`);
      let duplicateAnalysis = null;
      let isDuplicate = false;
      let similarCases = [];
      
      try {
        // Get existing cases for duplicate analysis
        const existingCases = await storage.getSmartCases(mitOrg.id);
        
        // Run AI duplicate detection
        duplicateAnalysis = await aiDuplicateDetectionService.analyzeDuplicates(
          {
            title: validatedInput.title,
            description: validatedInput.description,
            category: aiTriage.category,
            buildingName: validatedInput.building,
            roomNumber: validatedInput.room
          },
          existingCases
        );
        
        isDuplicate = !duplicateAnalysis.isUnique;
        similarCases = duplicateAnalysis.similarCases;
        
        if (isDuplicate) {
          console.log(`🚨 DUPLICATE DETECTED: ${duplicateAnalysis.analysisReason} (Confidence: ${(duplicateAnalysis.confidenceScore * 100).toFixed(1)}%)`);
        } else {
          console.log(`✅ UNIQUE REQUEST: ${duplicateAnalysis.analysisReason} (Confidence: ${(duplicateAnalysis.confidenceScore * 100).toFixed(1)}%)`);
        }
        
      } catch (duplicateError) {
        console.error('🚨 Duplicate detection failed, proceeding as unique:', duplicateError);
        duplicateAnalysis = {
          isUnique: true,
          similarCases: [],
          analysisReason: "Duplicate detection failed - treated as unique",
          confidenceScore: 0.5
        };
      }
      
      // Create case description with student contact info
      const studentInfo = `\n\n--- Student Information ---\nName: ${validatedInput.studentName}\nEmail: ${validatedInput.studentEmail}${validatedInput.studentPhone ? `\nPhone: ${validatedInput.studentPhone}` : ''}\nBuilding: ${validatedInput.building}\nRoom: ${validatedInput.room}`;
      
      // Map AI urgency to schema-compatible priority enum
      const urgencyToPriorityMap: Record<string, "Low" | "Medium" | "High" | "Critical"> = {
        "Low": "Low",
        "Medium": "Medium", 
        "High": "High",
        "Critical": "Critical" // Keep AI "Critical" as "Critical"
      };
      
      const finalPriority = urgencyToPriorityMap[aiTriage.urgency] || "Medium";
      
      // AI-Powered Contractor Coordination (Phase 3)
      let assignedContractor = null;
      let routingNotes = "";
      let escalationFlag = false;
      let contractorRecommendations: any[] = [];
      
      try {
        // Get available contractors from database
        const availableVendors = await storage.getVendors(mitOrg.id);
        const activeContractors = availableVendors.filter(v => v.isActiveContractor);
        
        if (activeContractors.length > 0) {
          // Use AI coordinator to find optimal contractor match
          const coordinationRequest = {
            caseData: {
              id: 'temp-id', // Will be replaced with actual case ID
              category: aiTriage.category,
              priority: finalPriority,
              description: validatedInput.description,
              location: `${validatedInput.building} ${validatedInput.room}`,
              urgency: aiTriage.urgency,
              estimatedDuration: aiTriage.estimatedDuration,
              safetyRisk: aiTriage.safetyRisk,
              contractorType: aiTriage.contractorType
            },
            availableContractors: activeContractors.map(c => ({
              id: c.id,
              name: c.name,
              category: c.category,
              specializations: c.specializations || [],
              availabilityPattern: c.availabilityPattern,
              responseTimeHours: c.responseTimeHours,
              estimatedHourlyRate: Number(c.estimatedHourlyRate) || 75,
              rating: c.rating,
              maxJobsPerDay: c.maxJobsPerDay,
              currentWorkload: 0, // TODO: Calculate from current cases
              emergencyAvailable: c.emergencyAvailable,
              isActiveContractor: c.isActiveContractor
            }))
          };
          
          contractorRecommendations = await aiCoordinatorService.findOptimalContractor(coordinationRequest);
          
          if (contractorRecommendations.length > 0) {
            const bestMatch = contractorRecommendations[0];
            assignedContractor = bestMatch.contractorId;
            routingNotes = `AI Coordinator assigned to ${bestMatch.contractorName} (Score: ${bestMatch.matchScore}%) - ${bestMatch.reasoning}`;
            
            // Auto-escalate based on AI coordinator recommendations
            if (bestMatch.riskFactors && bestMatch.riskFactors.length > 0) {
              escalationFlag = true;
              routingNotes += ` | ESCALATED: ${bestMatch.riskFactors.join(', ')}`;
            }
            
            // Escalate for safety risks or critical issues
            if (aiTriage.safetyRisk === "High" || aiTriage.urgency === "Critical") {
              escalationFlag = true;
              routingNotes += " | HIGH PRIORITY: Safety risk or critical issue detected";
            }
          }
        }
      } catch (coordinationError) {
        console.error('AI coordination failed, falling back to basic routing:', coordinationError);
        
        // Fallback to basic routing
        if (aiTriage.contractorType && aiTriage.urgency !== "Low") {
          assignedContractor = aiTriage.contractorType;
          routingNotes = `Fallback routing to ${aiTriage.contractorType} based on AI triage. Estimated duration: ${aiTriage.estimatedDuration}`;
          
          if (aiTriage.safetyRisk === "High" || aiTriage.urgency === "Critical") {
            escalationFlag = true;
            routingNotes += " | ESCALATED: High priority or safety risk detected";
          }
        }
      }
      
      // Map student request to smart case format with AI triage results
      const smartCaseData = {
        orgId: mitOrg.id,
        title: validatedInput.title,
        description: validatedInput.description + studentInfo,
        category: aiTriage.category, // Use AI-determined category
        priority: finalPriority, // Use schema-compatible priority 
        status: "New" as const,
        // Omit unitId and propertyId (undefined, not null)
        aiTriageJson: {
          // Original student submission
          studentContact: {
            name: validatedInput.studentName,
            email: validatedInput.studentEmail,
            phone: validatedInput.studentPhone,
            building: validatedInput.building,
            room: validatedInput.room
          },
          submissionSource: "public_student_portal",
          submittedAt: new Date().toISOString(),
          // AI Triage Analysis Results with Routing
          aiAnalysis: {
            ...aiTriage,
            analysisCompletedAt: new Date().toISOString(),
            version: "1.0"
          },
          // AI Duplicate Detection Results
          duplicateAnalysis: {
            isUnique: duplicateAnalysis?.isUnique || true,
            duplicateOfId: duplicateAnalysis?.duplicateOfId || null,
            similarCases: duplicateAnalysis?.similarCases || [],
            analysisReason: duplicateAnalysis?.analysisReason || "No duplicate analysis performed",
            confidenceScore: duplicateAnalysis?.confidenceScore || 1.0,
            analysisCompletedAt: new Date().toISOString()
          },
          // Intelligent routing results
          routing: {
            assignedContractor,
            routingNotes,
            escalationFlag,
            autoRouted: true,
            routingCompletedAt: new Date().toISOString()
          },
          // Original student submission preserved
          originalSubmission: {
            title: validatedInput.title,
            description: validatedInput.description,
            category: validatedInput.category,
            priority: validatedInput.priority,
            submittedAt: new Date().toISOString()
          }
        }
      };
      
      // Validate final case data against schema
      const validatedCaseData = insertSmartCaseSchema.parse(smartCaseData);
      const smartCase = await storage.createSmartCase(validatedCaseData);
      
      // Store photos in caseMedia table if provided (enforce max 5)
      if (validatedInput.photos && validatedInput.photos.length > 0) {
        const photosToStore = validatedInput.photos.slice(0, 5); // Enforce max 5 photos server-side
        for (const photoUrl of photosToStore) {
          if (typeof photoUrl === 'string' && photoUrl.length > 0) {
            try {
              await storage.createCaseMedia({
                caseId: smartCase.id,
                url: photoUrl,
                type: 'image'
              });
            } catch (error) {
              console.error('Failed to store photo for case:', smartCase.id, error);
              // Continue processing - don't fail the entire request for photo storage issues
            }
          }
        }
        console.log(`📷 Stored ${photosToStore.length} photos for case ${smartCase.id}`);
      }
      
      // 🚀 ENHANCED: Initialize smart case workflow with automation
      console.log(`🔄 Initializing smart case workflow for: ${smartCase.id}`);
      const workflowData = await aiTriageService.createSmartCaseWorkflow(
        smartCase.id,
        aiTriage,
        contractorRecommendations
      );
      
      // Create audit trail events for the smart case
      const caseEvents = await aiTriageService.createCaseEvents(
        smartCase.id,
        aiTriage,
        workflowData
      );
      
      // 🚨 NEW: Send real-time notifications to contractors and admins
      await sendSmartCaseNotifications(smartCase, workflowData, aiTriage, org.id);
      
      // 🔄 PERSISTENCE: Update case status and contractor assignment
      const updateData: any = {};
      
      if (workflowData.status !== smartCase.status) {
        updateData.status = workflowData.status;
        console.log(`📊 Updating case status from ${smartCase.status} to ${workflowData.status}`);
      }
      
      // Save contractor assignment if auto-assigned
      if (workflowData.autoScheduling.contractorAssigned) {
        // TODO: Add contractorId field to smartCases schema for persistence
        updateData.contractorId = workflowData.autoScheduling.contractorAssigned;
        console.log(`👷 Auto-assigned contractor: ${workflowData.autoScheduling.contractorAssigned}`);
      }
      
      // Update the smart case with workflow results
      if (Object.keys(updateData).length > 0) {
        await storage.updateSmartCase(smartCase.id, updateData);
        console.log(`💾 Smart case updated with workflow data`);
      }
      
      // Log workflow initialization success
      console.log(`✅ Smart case workflow initialized: ${workflowData.workflowSteps.length} steps, auto-scheduling: ${workflowData.autoScheduling.enabled}`);
      
      // 🚀 PERSISTENCE: Create appointment for auto-scheduled cases
      let appointmentId = null;
      if (workflowData.autoScheduling.enabled && workflowData.autoScheduling.contractorAssigned) {
        try {
          // Calculate initial scheduling time based on urgency
          const scheduledAt = new Date();
          if (triageResult.urgency === 'Critical') {
            scheduledAt.setHours(scheduledAt.getHours() + 1); // 1 hour for critical
          } else if (triageResult.urgency === 'High') {
            scheduledAt.setHours(scheduledAt.getHours() + 4); // 4 hours for high
          } else {
            scheduledAt.setDate(scheduledAt.getDate() + 1); // next day for others
          }
          
          const appointmentData = {
            orgId: mitOrg.id,
            caseId: smartCase.id,
            contractorId: workflowData.autoScheduling.contractorAssigned,
            type: 'Maintenance' as const,
            scheduledStartAt: scheduledAt,
            scheduledEndAt: new Date(scheduledAt.getTime() + (parseInt(triageResult.estimatedDuration.replace(/\D/g, '')) || 120) * 60000),
            status: 'Scheduled' as const,
            location: `${validatedInput.building} ${validatedInput.room}`,
            notes: `Auto-scheduled ${triageResult.category} maintenance: ${validatedInput.title}`,
            priority: finalPriority
          };
          
          const appointment = await storage.createAppointment(appointmentData);
          appointmentId = appointment.id;
          console.log(`📅 Auto-created appointment: ${appointmentId} at ${scheduledAt.toISOString()}`);
        } catch (appointmentError) {
          console.error('❌ Failed to create auto-appointment:', appointmentError);
          // Continue without failing the request
        }
      }
      
      // Return 201 Created with enhanced response including AI insights and workflow automation
      res.status(201).json({ 
        id: smartCase.id,
        status: workflowData.status || "submitted",
        message: "Your maintenance request has been submitted and analyzed by our AI system",
        aiInsights: {
          category: aiTriage.category,
          urgency: aiTriage.urgency,
          priority: finalPriority,
          estimatedDuration: aiTriage.estimatedDuration,
          preliminaryDiagnosis: aiTriage.preliminaryDiagnosis,
          troubleshootingSteps: aiTriage.troubleshootingSteps,
          recommendedContractor: aiTriage.contractorType,
          complexity: aiTriage.estimatedComplexity,
          safetyRisk: aiTriage.safetyRisk,
          safetyNote: aiTriage.safetyRisk !== "None" ? 
            "⚠️ Safety risk identified. Please contact MIT Housing immediately if you feel unsafe." : null,
          routing: {
            assignedTo: assignedContractor,
            notes: routingNotes,
            escalated: escalationFlag
          }
        },
        // 🚀 ENHANCED: Smart case workflow automation details
        workflowAutomation: {
          workflowInitialized: true,
          workflowStatus: workflowData.status,
          totalSteps: workflowData.workflowSteps.length,
          workflowSteps: workflowData.workflowSteps,
          autoScheduling: {
            ...workflowData.autoScheduling,
            appointmentId: appointmentId,
            appointmentCreated: !!appointmentId
          },
          caseEvents: caseEvents,
          nextActions: workflowData.autoScheduling.enabled ? [
            "Your case is being automatically processed",
            workflowData.autoScheduling.contractorAssigned ? 
              `Contractor assigned: ${workflowData.autoScheduling.contractorAssigned}` : 
              "Awaiting contractor assignment",
            "You will receive updates on case progress",
            "MIT Housing staff will contact you if needed"
          ] : [
            "Your case has been received and is under review",
            "MIT Housing staff will assess and assign a contractor",
            "You will receive updates on case progress",
            "Expected response within 24-48 hours"
          ]
        }
      });
      
      // Log success with AI analysis details
      console.log(`📋 AI-triaged maintenance request created: ${smartCase.id} - ${validatedInput.title} (${validatedInput.building} ${validatedInput.room}) | Category: ${aiTriage.category} | Urgency: ${aiTriage.urgency} | Contractor: ${aiTriage.contractorType}`);
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Return structured validation errors as 400 Bad Request
        return res.status(400).json({ 
          message: "Validation failed",
          errors: error.errors.map((err: any) => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
      } else {
        // Log error for debugging but don't expose details to client
        console.error("Error creating public maintenance case:", error);
        return res.status(500).json({ 
          message: "Failed to submit maintenance request. Please try again."
        });
      }
    }
  });

  // Data audit routes (Phase 2 security implementation)
  app.get('/api/audit/appointments', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user!;
      
      // Run comprehensive data audit
      const auditResult = await dataAuditService.auditAppointmentData();
      
      // Generate detailed report
      const report = dataAuditService.generateAuditReport(auditResult);
      
      console.log("📊 Data audit completed for org:", user.orgId);
      console.log(report);
      
      res.json({
        success: true,
        audit: auditResult,
        report: report,
        timestamp: new Date().toISOString(),
        auditor: user.email,
      });
    } catch (error) {
      console.error("❌ Data audit failed:", error);
      res.status(500).json({
        success: false,
        error: "Data audit failed",
        details: error instanceof Error ? error.message : "Unknown error",
      });
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

  // Appointment routes with Phase 1 application-level security guards
  app.get('/api/appointments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const appointments = await storage.getAppointments(org.id);
      res.json(appointments);
    } catch (error) {
      console.error("Error fetching appointments:", error);
      res.status(500).json({ message: "Failed to fetch appointments" });
    }
  });

  app.get('/api/appointments/contractor/:contractorId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const { contractorId } = req.params;
      const appointments = await storage.getContractorAppointments(contractorId, org.id);
      res.json(appointments);
    } catch (error) {
      console.error("Error fetching contractor appointments:", error);
      res.status(500).json({ message: "Failed to fetch contractor appointments" });
    }
  });

  app.post('/api/appointments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // Validate appointment data with orgId
      const validatedData = insertAppointmentSchema.parse({
        ...req.body,
        orgId: org.id,
      });

      // Phase 1 Security Guard: Check org consistency
      const isOrgConsistent = await storage.checkAppointmentOrgConsistency(
        validatedData.caseId, 
        validatedData.contractorId, 
        org.id
      );
      
      if (!isOrgConsistent) {
        return res.status(409).json({ 
          message: "Case and contractor must belong to the same organization",
          error: "org_mismatch"
        });
      }

      // Phase 1 Security Guard: Check appointment overlap
      const hasOverlap = await storage.checkAppointmentOverlap(
        validatedData.contractorId,
        validatedData.scheduledStartAt,
        validatedData.scheduledEndAt
      );
      
      if (hasOverlap) {
        return res.status(409).json({ 
          message: "Contractor has a conflicting appointment during this time period",
          error: "time_conflict"
        });
      }

      const appointment = await storage.createAppointment(validatedData);
      
      // 🔔 APPOINTMENT RELAY SYSTEM - Mailla notifies student automatically
      try {
        const { maillaAIService } = await import('./maillaAIService');
        await maillaAIService.relayAppointmentToStudent(appointment);
        console.log(`✅ Appointment relay sent to student for appointment ${appointment.id}`);
      } catch (relayError) {
        console.error('❌ Failed to relay appointment to student:', relayError);
        // Don't fail the appointment creation if relay fails
      }
      
      res.status(201).json(appointment);
    } catch (error) {
      console.error("Error creating appointment:", error);
      res.status(500).json({ message: "Failed to create appointment" });
    }
  });

  app.put('/api/appointments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const { id } = req.params;
      
      // Check if appointment exists and belongs to the organization
      const existingAppointment = await storage.getAppointment(id);
      if (!existingAppointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      
      if (existingAppointment.orgId !== org.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Validate update data (no orgId override for updates)
      const validatedData = insertAppointmentSchema.omit({ orgId: true }).parse(req.body);

      // If updating case or contractor, check org consistency
      if (validatedData.caseId || validatedData.contractorId) {
        const caseId = validatedData.caseId || existingAppointment.caseId;
        const contractorId = validatedData.contractorId || existingAppointment.contractorId;
        
        const isOrgConsistent = await storage.checkAppointmentOrgConsistency(
          caseId, 
          contractorId, 
          org.id
        );
        
        if (!isOrgConsistent) {
          return res.status(409).json({ 
            message: "Case and contractor must belong to the same organization",
            error: "org_mismatch"
          });
        }
      }

      // If updating times, check for overlaps (excluding current appointment)
      if (validatedData.scheduledStartAt || validatedData.scheduledEndAt) {
        const contractorId = validatedData.contractorId || existingAppointment.contractorId;
        const startTime = validatedData.scheduledStartAt || existingAppointment.scheduledStartAt;
        const endTime = validatedData.scheduledEndAt || existingAppointment.scheduledEndAt;
        
        const hasOverlap = await storage.checkAppointmentOverlap(
          contractorId,
          startTime,
          endTime,
          id // Exclude current appointment from overlap check
        );
        
        if (hasOverlap) {
          return res.status(409).json({ 
            message: "Contractor has a conflicting appointment during this time period",
            error: "time_conflict"
          });
        }
      }

      const updatedAppointment = await storage.updateAppointment(id, validatedData);
      res.json(updatedAppointment);
    } catch (error) {
      console.error("Error updating appointment:", error);
      res.status(500).json({ message: "Failed to update appointment" });
    }
  });

  app.delete('/api/appointments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const { id } = req.params;
      
      // Check if appointment exists and belongs to the organization
      const appointment = await storage.getAppointment(id);
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      
      if (appointment.orgId !== org.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      await storage.deleteAppointment(id);
      res.json({ message: "Appointment deleted successfully" });
    } catch (error) {
      console.error("Error deleting appointment:", error);
      res.status(500).json({ message: "Failed to delete appointment" });
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
            cases: aiData.maintenanceCases?.slice(0, 5) || [],
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

  // =================== PHASE 3: AI AGENT-CONTRACTOR COORDINATION ENDPOINTS ===================
  
  // Get contractors for a case assignment
  app.get('/api/contractors/recommendations/:caseId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const caseId = req.params.caseId;
      const smartCase = await storage.getSmartCase(caseId);
      if (!smartCase) return res.status(404).json({ message: "Case not found" });
      
      // Get AI coordinator recommendations from stored data
      const aiData = smartCase.aiTriageJson as any;
      const recommendations = aiData?.routing?.contractorRecommendations || [];
      
      res.json({
        caseId,
        recommendations,
        aiCoordinatorUsed: recommendations.length > 0
      });
    } catch (error) {
      console.error("Error fetching contractor recommendations:", error);
      res.status(500).json({ message: "Failed to fetch contractor recommendations" });
    }
  });
  
  // Manual contractor assignment (override AI)
  app.post('/api/contractors/assign', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const { caseId, contractorId, notes } = req.body;
      
      const smartCase = await storage.getSmartCase(caseId);
      if (!smartCase) return res.status(404).json({ message: "Case not found" });
      
      const contractor = await storage.getVendor(contractorId);
      if (!contractor) return res.status(404).json({ message: "Contractor not found" });
      
      // Update case with manual assignment
      const updatedAiData = {
        ...(smartCase.aiTriageJson as any),
        routing: {
          ...(smartCase.aiTriageJson as any)?.routing,
          assignedContractor: contractorId,
          routingNotes: `Manual assignment to ${contractor.name}: ${notes}`,
          manualOverride: true,
          overrideBy: userId,
          overrideAt: new Date().toISOString()
        }
      };
      
      await storage.updateSmartCase(caseId, {
        aiTriageJson: updatedAiData,
        status: 'Scheduled'
      });
      
      // Generate contractor notification
      const notification = await aiCoordinatorService.generateContractorNotification(
        smartCase, contractor, {
          contractorId: contractor.id,
          contractorName: contractor.name,
          matchScore: 100, // Manual assignment = perfect match
          reasoning: `Manual assignment: ${notes}`,
          estimatedResponseTime: `${contractor.responseTimeHours} hours`,
          availability: {
            contractorId: contractor.id,
            isAvailable: true,
            currentWorkload: 0,
            maxCapacity: contractor.maxJobsPerDay,
            availabilityReason: contractor.availabilityPattern
          }
        }
      );
      
      res.json({
        success: true,
        assignedContractor: {
          id: contractor.id,
          name: contractor.name,
          category: contractor.category,
          responseTime: contractor.responseTimeHours
        },
        notification,
        caseStatus: 'Scheduled'
      });
    } catch (error) {
      console.error("Error assigning contractor:", error);
      res.status(500).json({ message: "Failed to assign contractor" });
    }
  });
  
  // Contractor availability update endpoint
  app.post('/api/contractors/:contractorId/availability', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const contractorId = req.params.contractorId;
      const { available, notes, emergencyAvailable } = req.body;
      
      const contractor = await storage.getVendor(contractorId);
      if (!contractor) return res.status(404).json({ message: "Contractor not found" });
      
      // Update contractor availability
      await storage.updateVendor(contractorId, {
        isActiveContractor: available,
        emergencyAvailable: emergencyAvailable !== undefined ? emergencyAvailable : contractor.emergencyAvailable,
        notes: notes ? `${contractor.notes || ''}\n[${new Date().toISOString()}] Availability update: ${notes}` : contractor.notes
      });
      
      res.json({
        success: true,
        contractorId,
        availability: {
          available,
          emergencyAvailable: emergencyAvailable !== undefined ? emergencyAvailable : contractor.emergencyAvailable,
          updatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error("Error updating contractor availability:", error);
      res.status(500).json({ message: "Failed to update contractor availability" });
    }
  });
  
  // Get contractor workload and assignments
  app.get('/api/contractors/:contractorId/workload', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const contractorId = req.params.contractorId;
      const contractor = await storage.getVendor(contractorId);
      if (!contractor) return res.status(404).json({ message: "Contractor not found" });
      
      // Get all active cases for this contractor
      const allCases = await storage.getSmartCases(org.id);
      const contractorCases = allCases.filter(c => {
        const aiData = c.aiTriageJson as any;
        return aiData?.routing?.assignedContractor === contractorId && 
               ['New', 'In Review', 'Scheduled', 'In Progress'].includes(c.status);
      });
      
      const workload = {
        contractorId,
        contractorName: contractor.name,
        maxJobsPerDay: contractor.maxJobsPerDay,
        currentAssignments: contractorCases.length,
        availableCapacity: contractor.maxJobsPerDay - contractorCases.length,
        utilizationPercentage: Math.round((contractorCases.length / contractor.maxJobsPerDay) * 100),
        activeCases: contractorCases.map(c => ({
          id: c.id,
          title: c.title,
          priority: c.priority,
          status: c.status,
          category: c.category,
          createdAt: c.createdAt
        }))
      };
      
      res.json(workload);
    } catch (error) {
      console.error("Error fetching contractor workload:", error);
      res.status(500).json({ message: "Failed to fetch contractor workload" });
    }
  });

  // Contractor-specific API routes
  app.get('/api/contractor/cases', isAuthenticated, requireVendor, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // Find contractor by user ID (preferred) with fallback to email
      const allVendors = await storage.getVendors(org.id);
      const contractor = allVendors.find(v => 
        // Primary: match by user ID if available
        v.userId === userId ||
        // Fallback: match by email only if userId is not set
        (!v.userId && v.email === req.user.claims.email)
      );
      
      if (!contractor) {
        return res.json([]); // Return empty array if not a contractor
      }
      
      // Get all smart cases assigned to this contractor
      const allCases = await storage.getSmartCases(org.id);
      const contractorCases = allCases.filter(c => {
        // Check both contractorId field and AI routing assignment
        if (c.contractorId === contractor.id) return true;
        
        // 🎯 Include "New" unassigned cases that contractors can accept
        if (c.status === 'New' && !c.contractorId) return true;
        
        // Fallback to AI triage routing data
        const aiData = c.aiTriageJson as any;
        return aiData?.routing?.assignedContractor === contractor.id;
      });
      
      res.json(contractorCases);
    } catch (error) {
      console.error("Error fetching contractor cases:", error);
      res.status(500).json({ message: "Failed to fetch contractor cases" });
    }
  });

  // 🎯 Accept Case with Scheduling Endpoint
  app.post('/api/contractor/accept-case', isAuthenticated, requireVendor, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // 🎯 ZOD VALIDATION as per project guidelines
      const acceptCaseSchema = z.object({
        caseId: z.string().min(1, "Case ID is required"),
        scheduledDateTime: z.string().datetime("Invalid date/time format"),
        notes: z.string().optional(),
        estimatedDurationMinutes: z.number().int().min(15).max(480).optional().default(120), // 15 min to 8 hours
        durationSource: z.enum(['ai', 'manual']).optional().default('manual')
      });

      const parseResult = acceptCaseSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data",
          errors: parseResult.error.errors
        });
      }

      const { caseId, scheduledDateTime, notes, estimatedDurationMinutes, durationSource } = parseResult.data;

      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      // Find contractor
      const allVendors = await storage.getVendors(org.id);
      const contractor = allVendors.find(v => 
        v.userId === userId || (!v.userId && v.email === req.user.claims.email)
      );

      if (!contractor) {
        return res.status(403).json({ message: "Contractor profile not found" });
      }

      // Get the case to validate it's assigned to this contractor
      const allCases = await storage.getSmartCases(org.id);
      const smartCase = allCases.find(c => c.id === caseId);
      if (!smartCase) {
        return res.status(404).json({ message: "Case not found" });
      }

      // 🎯 Allow self-assignment for unassigned New cases OR verify existing assignment
      const isUnassignedNewCase = !smartCase.contractorId && 
        !(smartCase.aiTriageJson as any)?.routing?.assignedContractor && 
        smartCase.status === "New";
      
      const isAssignedToContractor = smartCase.contractorId === contractor.id || 
        (smartCase.aiTriageJson as any)?.routing?.assignedContractor === contractor.id;

      if (!isUnassignedNewCase && !isAssignedToContractor) {
        return res.status(403).json({ message: "Case not assigned to this contractor" });
      }

      // Verify case is in acceptable status for accepting
      if (!["New", "Assigned"].includes(smartCase.status || "")) {
        return res.status(409).json({ 
          message: `Cannot accept case with status "${smartCase.status}". Only New or Assigned cases can be accepted.` 
        });
      }

      // Validate scheduled date/time is in future
      const scheduledDate = new Date(scheduledDateTime);
      if (scheduledDate <= new Date()) {
        return res.status(400).json({ 
          message: "Scheduled date/time must be in the future." 
        });
      }

      // 📅 CONFLICT PREVENTION: Check contractor availability
      const appointmentEndTime = new Date(scheduledDate.getTime() + estimatedDurationMinutes * 60 * 1000);
      const isAvailable = await storage.checkContractorAvailability(contractor.id, scheduledDate, appointmentEndTime);
      
      if (!isAvailable) {
        return res.status(409).json({ 
          message: `Contractor ${contractor.name} is not available at ${scheduledDate.toLocaleString()}. Please choose a different time slot.`,
          error: "SCHEDULE_CONFLICT"
        });
      }

      // Update case status to "Scheduled"
      const updatedCase = await storage.updateSmartCase(caseId, {
        status: "Scheduled",
        reviewedBy: userId,
        reviewedAt: new Date(),
        contractorId: contractor.id // Ensure contractor ID is set
      });

      // 🎯 CREATE THE ACTUAL APPOINTMENT RECORD using contractor-selected duration
      const appointment = await storage.createAppointment({
        caseId,
        contractorId: contractor.id,
        orgId: org.id, // 🎯 FIXED: Add missing orgId
        title: `Maintenance Visit - ${smartCase.title}`,
        description: `Scheduled maintenance visit for: ${smartCase.description}`,
        scheduledStartAt: scheduledDate,
        scheduledEndAt: appointmentEndTime,
        priority: smartCase.priority || 'Medium',
        locationDetails: smartCase.buildingName && smartCase.roomNumber ? 
          `${smartCase.buildingName} - Room ${smartCase.roomNumber}` : 
          smartCase.locationText || 'Location TBD',
        isEmergency: smartCase.priority === 'Urgent',
        requiresTenantAccess: true,
        status: 'Confirmed'
      });

      // Create case event for appointment scheduling
      await storage.createTicketEvent({
        caseId,
        eventType: "appointment_scheduled",
        message: `Appointment scheduled for ${new Date(scheduledDateTime).toLocaleString()} by ${contractor.name} (${estimatedDurationMinutes} min ${durationSource === 'ai' ? 'AI suggested' : 'manual'})${notes ? ` - Notes: ${notes}` : ''}`,
        metadata: {
          scheduledBy: contractor.id,
          scheduledDateTime,
          contractorName: contractor.name,
          notes,
          // 🎯 Track duration selection for analytics
          estimatedDurationMinutes,
          durationSource,
          appointmentEndTime: appointmentEndTime.toISOString()
        }
      });

      // 🔔 Send WebSocket notification (SCOPED BY ORG for security)
      if (global.wss) {
        const notificationData = {
          type: 'case_accepted',
          orgId: org.id, // 🚨 CRITICAL: Include orgId for filtering
          caseId,
          caseNumber: smartCase.caseNumber,
          title: smartCase.title,
          contractor: contractor.name,
          scheduledDateTime,
          status: 'Scheduled'
        };
        
        // 🚨 SECURITY FIX: Only send to clients in the same organization
        global.wss.clients.forEach((client: any) => {
          if (client.readyState === 1 && client.orgId === org.id) { // WebSocket.OPEN + same org
            client.send(JSON.stringify(notificationData));
          }
        });
      }

      res.json({ 
        success: true, 
        case: updatedCase,
        appointment: appointment, // 🎯 Include created appointment data
        orgId: org.id, // Include orgId for client filtering
        message: `Case accepted and scheduled for ${new Date(scheduledDateTime).toLocaleString()}`
      });

    } catch (error) {
      console.error("Error accepting case:", error);
      
      // 🚨 CRITICAL: Rollback case status if appointment creation fails
      // Only rollback if the case status was changed to "Scheduled" but appointment creation failed
      try {
        const rollbackCase = await storage.getSmartCase(caseId);
        if (rollbackCase && rollbackCase.status === "Scheduled") {
          await storage.updateSmartCase(caseId, {
            status: "New", // Reset to original status for contractor choice
            contractorId: null, // Clear contractor assignment
            reviewedBy: null,
            reviewedAt: null
          });
          console.log(`🔄 Rolled back case ${caseId} status from "Scheduled" to "New" due to appointment creation failure`);
        }
      } catch (rollbackError) {
        console.error("Error during case status rollback:", rollbackError);
      }
      
      // 🎯 Handle scheduling conflicts with helpful message
      if ((error as any).constraint === 'exclude_contractor_time_overlap') {
        return res.status(409).json({ 
          message: "Scheduling conflict: You already have an appointment at this time. Please choose a different time slot." 
        });
      }
      
      // 🎯 Handle other known constraints
      if ((error as any).code === '23P01' || (error as any).message?.includes('exclude_contractor_time_overlap')) {
        return res.status(409).json({ 
          message: "Scheduling conflict: You already have an appointment at this time. Please choose a different time slot." 
        });
      }
      
      res.status(500).json({ message: "Failed to accept case" });
    }
  });

  app.get('/api/contractor/appointments', isAuthenticated, requireVendor, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // Find contractor by user ID (preferred) with fallback to email
      const allVendors = await storage.getVendors(org.id);
      const contractor = allVendors.find(v => 
        // Primary: match by user ID if available
        v.userId === userId ||
        // Fallback: match by email only if userId is not set
        (!v.userId && v.email === req.user.claims.email)
      );
      
      if (!contractor) {
        return res.json([]); // Return empty array if not a contractor
      }
      
      // Get appointments for this contractor
      const appointments = await storage.getContractorAppointments(contractor.id, org.id);
      res.json(appointments);
    } catch (error) {
      console.error("Error fetching contractor appointments:", error);
      res.status(500).json({ message: "Failed to fetch contractor appointments" });
    }
  });

  app.get('/api/contractor/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // Find contractor by user ID (preferred) with fallback to email
      const allVendors = await storage.getVendors(org.id);
      const contractor = allVendors.find(v => 
        // Primary: match by user ID if available
        v.userId === userId ||
        // Fallback: match by email only if userId is not set
        (!v.userId && v.email === req.user.claims.email)
      );
      
      if (!contractor) {
        return res.status(404).json({ message: "Contractor profile not found" });
      }
      
      res.json(contractor);
    } catch (error) {
      console.error("Error fetching contractor profile:", error);
      res.status(500).json({ message: "Failed to fetch contractor profile" });
    }
  });

  // Link user to contractor/vendor for secure authentication
  app.post('/api/contractor/link', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // Find unlinked vendor by email
      const allVendors = await storage.getVendors(org.id);
      const vendor = allVendors.find(v => !v.userId && v.email === req.user.claims.email);
      
      if (!vendor) {
        return res.status(404).json({ message: "No matching contractor profile found to link" });
      }
      
      // Link the vendor to the user
      const updatedVendor = await storage.updateVendor(vendor.id, { userId });
      res.json({ message: "Contractor profile linked successfully", vendor: updatedVendor });
    } catch (error) {
      console.error("Error linking contractor profile:", error);
      res.status(500).json({ message: "Failed to link contractor profile" });
    }
  });

  app.put('/api/contractor/availability', isAuthenticated, async (req: any, res) => {
    // Use dedicated contractor availability schema for validation
    let validatedData;
    try {
      validatedData = contractorAvailabilityUpdateSchema.parse(req.body);
    } catch (error) {
      return res.status(400).json({ message: "Invalid request data", errors: error });
    }
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // Find contractor by user ID (preferred) with fallback to email
      const allVendors = await storage.getVendors(org.id);
      const contractor = allVendors.find(v => 
        // Primary: match by user ID if available
        v.userId === userId ||
        // Fallback: match by email only if userId is not set
        (!v.userId && v.email === req.user.claims.email)
      );
      
      if (!contractor) {
        return res.status(404).json({ message: "Contractor profile not found" });
      }
      
      // Update contractor availability with validated data
      const updates = {
        availabilityPattern: validatedData.availabilityPattern || contractor.availabilityPattern,
        availableStartTime: validatedData.availableStartTime || contractor.availableStartTime,
        availableEndTime: validatedData.availableEndTime || contractor.availableEndTime,
        availableDays: validatedData.availableDays || contractor.availableDays,
        responseTimeHours: validatedData.responseTimeHours !== undefined ? validatedData.responseTimeHours : contractor.responseTimeHours,
        priorityScheduling: validatedData.priorityScheduling || contractor.priorityScheduling,
        emergencyAvailable: validatedData.emergencyAvailable !== undefined ? validatedData.emergencyAvailable : contractor.emergencyAvailable,
        emergencyPhone: validatedData.emergencyPhone || contractor.emergencyPhone,
        maxJobsPerDay: validatedData.maxJobsPerDay !== undefined ? validatedData.maxJobsPerDay : contractor.maxJobsPerDay,
        estimatedHourlyRate: validatedData.estimatedHourlyRate || contractor.estimatedHourlyRate,
        specializations: validatedData.specializations || contractor.specializations
      };
      
      const updatedContractor = await storage.updateVendor(contractor.id, updates);
      res.json(updatedContractor);
    } catch (error) {
      console.error("Error updating contractor availability:", error);
      res.status(500).json({ message: "Failed to update availability" });
    }
  });

  // PATCH endpoint for contractor case status updates  
  app.patch('/api/cases/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // Find contractor by userId
      const allVendors = await storage.getVendors(org.id);
      const contractor = allVendors.find(v => 
        v.userId === userId ||
        (!v.userId && v.email === req.user.claims.email)
      );
      
      if (!contractor) {
        return res.status(403).json({ message: "Access denied: Not a registered contractor" });
      }
      
      // Get the case and verify contractor assignment
      const caseData = await storage.getSmartCase(req.params.id);
      if (!caseData || caseData.orgId !== org.id) {
        return res.status(404).json({ message: "Case not found" });
      }
      
      // Check if contractor is assigned to this case
      const isAssigned = caseData.contractorId === contractor.id ||
        (caseData.aiTriageJson as any)?.routing?.assignedContractor === contractor.id;
      
      if (!isAssigned) {
        return res.status(403).json({ message: "Access denied: Case not assigned to you" });
      }
      
      // Validate and update case
      const allowedFields = { status: true, notes: true, contractorNotes: true };
      const updateData = Object.keys(req.body)
        .filter(key => allowedFields[key as keyof typeof allowedFields])
        .reduce((obj, key) => ({ ...obj, [key]: req.body[key] }), {});
      
      const updatedCase = await storage.updateSmartCase(req.params.id, updateData);
      
      // 🎯 Send notification to student when status changes
      if (updateData.status && caseData.studentEmail) {
        try {
          const statusMessage = updateData.status === "Resolved" 
            ? "✅ Your maintenance issue has been completed! The contractor has finished the work and everything should be working properly now."
            : updateData.status === "In Progress"
            ? "🔧 Your maintenance case is now in progress. The contractor has started working on your issue."
            : updateData.status === "Scheduled"
            ? "📅 Your maintenance case has been scheduled. You'll receive details about the appointment soon."
            : `📋 Your maintenance case status has been updated to: ${updateData.status}`;
          
          // Send notification via WebSocket and email if available
          const notificationService = (global as any).notificationService;
          if (notificationService) {
            await notificationService.notifyStudent(
              caseData.studentEmail,
              `Case Update: ${caseData.title}`,
              statusMessage,
              org.id
            );
          }
          
          console.log(`📧 Student notification sent for case ${req.params.id}: ${updateData.status}`);
        } catch (notificationError) {
          console.error("Failed to send student notification:", notificationError);
          // Don't fail the case update if notification fails
        }
      }
      
      res.json(updatedCase);
    } catch (error) {
      console.error("Error updating case:", error);
      res.status(500).json({ message: "Failed to update case" });
    }
  });

  // Student request tracking endpoint (public) - requires BOTH requestId AND email for security
  app.get('/api/student/cases', async (req: any, res) => {
    try {
      const { requestId, email } = req.query;
      
      if (!requestId || !email) {
        return res.status(400).json({ message: "Both request ID and email are required" });
      }
      
      // Validate inputs
      if (typeof requestId !== 'string' || typeof email !== 'string') {
        return res.status(400).json({ message: "Invalid request parameters" });
      }
      
      if (!email.includes('@') || email.length > 100) {
        return res.status(400).json({ message: "Invalid email format" });
      }
      
      let cases = [];
      
      // Search by case ID first
      try {
        const caseById = await storage.getSmartCase(requestId.toString());
        if (caseById && caseById.studentEmail && caseById.studentEmail.toLowerCase() === email.toLowerCase()) {
          cases = [caseById];
        }
      } catch (error) {
        console.log("Case not found or email mismatch:", requestId, email);
      }
      
      // Enhance cases with contractor information
      const enhancedCases = await Promise.all(cases.map(async (smartCase) => {
        let contractorName = null;
        
        // Try to get contractor info if assigned
        if (smartCase.contractorId) {
          try {
            const vendors = await storage.getVendors(smartCase.orgId);
            const contractor = vendors.find(v => v.id === smartCase.contractorId);
            if (contractor) {
              contractorName = contractor.name;
            }
          } catch (error) {
            console.log("Error getting contractor info:", error);
          }
        }
        
        // Parse AI triage data for additional info
        let aiData = null;
        try {
          aiData = typeof smartCase.aiTriageJson === 'string' 
            ? JSON.parse(smartCase.aiTriageJson) 
            : smartCase.aiTriageJson;
        } catch (error) {
          console.log("Error parsing AI triage data:", error);
        }
        
        return {
          ...smartCase,
          contractorName,
          estimatedCompletionDate: aiData?.scheduling?.estimatedCompletionDate,
          photos: smartCase.photoUrls || []
        };
      }));
      
      res.json(enhancedCases);
    } catch (error) {
      console.error("Error searching student cases:", error);
      res.status(500).json({ message: "Failed to search requests" });
    }
  });

  // PATCH endpoint for contractor appointment status updates
  app.patch('/api/appointments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      // Find contractor by userId
      const allVendors = await storage.getVendors(org.id);
      const contractor = allVendors.find(v => 
        v.userId === userId ||
        (!v.userId && v.email === req.user.claims.email)
      );
      
      if (!contractor) {
        return res.status(403).json({ message: "Access denied: Not a registered contractor" });
      }
      
      // Get the appointment and verify contractor assignment
      const appointment = await storage.getAppointment(req.params.id);
      if (!appointment || appointment.orgId !== org.id) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      
      // Check if contractor is assigned to this appointment
      if (appointment.contractorId !== contractor.id) {
        return res.status(403).json({ message: "Access denied: Appointment not assigned to you" });
      }
      
      // Validate and update appointment
      const allowedFields = { status: true, notes: true, actualStartAt: true, actualEndAt: true };
      const updateData = Object.keys(req.body)
        .filter(key => allowedFields[key as keyof typeof allowedFields])
        .reduce((obj, key) => ({ ...obj, [key]: req.body[key] }), {});
      
      const updatedAppointment = await storage.updateAppointment(req.params.id, updateData);
      res.json(updatedAppointment);
    } catch (error) {
      console.error("Error updating appointment:", error);
      res.status(500).json({ message: "Failed to update appointment" });
    }
  });

  // =================== PHASE 3: AI SCHEDULING ORCHESTRATOR ===================
  
  app.post('/api/cases/:caseId/schedule', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { caseId } = req.params;
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      // Validate case belongs to organization
      const smartCase = await storage.getSmartCase(caseId);
      if (!smartCase || smartCase.orgId !== org.id) {
        return res.status(404).json({ message: "Case not found" });
      }

      // Import and initialize AI scheduling orchestrator
      const { AISchedulingOrchestrator } = await import("./aiSchedulingOrchestrator.js");
      const scheduler = new AISchedulingOrchestrator(storage);
      
      // Parse and validate request
      const schedulingRequest = {
        caseId,
        contractorId: req.body.contractorId,
        urgency: smartCase.priority || 'Medium',
        estimatedDuration: req.body.estimatedDuration || smartCase.aiTriageJson?.aiAnalysis?.estimatedDuration || '2-4 hours',
        requiresTenantAccess: req.body.requiresTenantAccess || false,
        preferredTimeSlots: req.body.preferredTimeSlots,
        mustCompleteBy: req.body.mustCompleteBy,
        specialRequirements: req.body.specialRequirements
      };

      // Get AI scheduling recommendations
      const schedulingResult = await scheduler.scheduleAppointment(schedulingRequest);
      
      console.log(`🤖 AI Scheduling completed for case ${caseId}:`, {
        success: schedulingResult.success,
        recommendations: schedulingResult.recommendations.length,
        optimizationScore: schedulingResult.optimizationScore
      });

      res.json(schedulingResult);
    } catch (error) {
      console.error('AI Scheduling error:', error);
      res.status(500).json({ 
        success: false,
        message: 'AI scheduling failed',
        recommendations: [],
        reasoning: 'Internal server error during scheduling optimization',
        totalOptions: 0,
        analysisCompletedAt: new Date().toISOString(),
        optimizationScore: 0.0
      });
    }
  });

  // =================== TENANT APPROVAL WORKFLOW ===================

  // Public approval endpoint (no authentication required - uses signed token)
  app.get('/api/approvals/:token', async (req: any, res) => {
    try {
      const { token } = req.params;
      const { action } = req.query;

      if (!token) {
        return res.status(400).json({ message: "Approval token required" });
      }

      // Import approval service
      const { TenantApprovalService } = await import("./tenantApprovalService.js");
      const approvalService = new TenantApprovalService(storage);

      // Verify token and get appointment details
      const payload = await approvalService.verifyApprovalToken(token);
      const appointment = await storage.getAppointment(payload.appointmentId);
      const contractor = appointment?.contractorId ? await storage.getVendor(appointment.contractorId) : null;

      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Handle direct approve/decline actions
      if (action === 'approve' || action === 'decline') {
        const approved = action === 'approve';
        const approvalStatus = await approvalService.processApprovalResponse(token, approved);
        
        // Return success page or redirect
        return res.json({
          success: true,
          message: `Appointment ${approved ? 'approved' : 'declined'} successfully`,
          appointment: {
            id: appointment.id,
            title: appointment.title,
            scheduledStartAt: appointment.scheduledStartAt,
            contractor: contractor ? { name: contractor.name, phone: contractor.phone } : null
          },
          status: approvalStatus
        });
      }

      // Return approval form data for frontend
      res.json({
        valid: true,
        appointment: {
          id: appointment.id,
          title: appointment.title,
          description: appointment.description,
          scheduledStartAt: appointment.scheduledStartAt,
          scheduledEndAt: appointment.scheduledEndAt,
          contractor: contractor ? {
            name: contractor.name,
            phone: contractor.phone,
            email: contractor.email
          } : null
        },
        expiresAt: new Date(payload.expiresAt).toISOString()
      });

    } catch (error) {
      console.error('Approval token verification error:', error);
      res.status(400).json({ 
        valid: false,
        message: error instanceof Error ? error.message : 'Invalid approval token'
      });
    }
  });

  // Approval response endpoint  
  app.post('/api/approvals/:token/respond', async (req: any, res) => {
    try {
      const { token } = req.params;
      const { approved, reason, preferredTimeSlot, contactPreference } = req.body;

      if (typeof approved !== 'boolean') {
        return res.status(400).json({ message: "Approval decision required" });
      }

      // Import approval service
      const { TenantApprovalService } = await import("./tenantApprovalService.js");
      const approvalService = new TenantApprovalService(storage);

      const approvalStatus = await approvalService.processApprovalResponse(token, approved, {
        reason,
        preferredTimeSlot,
        contactPreference
      });

      res.json({
        success: true,
        status: approvalStatus,
        message: `Appointment ${approved ? 'approved' : 'declined'} successfully`
      });

    } catch (error) {
      console.error('Approval response error:', error);
      res.status(400).json({ 
        success: false,
        message: error instanceof Error ? error.message : 'Failed to process approval response'
      });
    }
  });

  // Smart appointment creation from scheduling recommendations
  app.post('/api/appointments/from-recommendation', isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      const {
        caseId,
        contractorId,
        scheduledStartAt,
        scheduledEndAt,
        title,
        description,
        requiresTenantAccess,
        priority = 'Medium'
      } = req.body;

      // Validate inputs
      if (!caseId || !contractorId || !scheduledStartAt || !scheduledEndAt) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Verify case and contractor belong to organization
      const smartCase = await storage.getSmartCase(caseId);
      const contractor = await storage.getVendor(contractorId);
      
      if (!smartCase || smartCase.orgId !== org.id) {
        return res.status(404).json({ message: "Case not found" });
      }
      
      if (!contractor || contractor.orgId !== org.id) {
        return res.status(404).json({ message: "Contractor not found" });
      }

      // Check for appointment overlaps
      const hasOverlap = await storage.checkAppointmentOverlap(
        contractorId,
        new Date(scheduledStartAt),
        new Date(scheduledEndAt)
      );

      if (hasOverlap) {
        return res.status(409).json({ 
          message: "Appointment conflicts with existing contractor schedule" 
        });
      }

      // Generate approval token for tenant access if required
      const appointmentData: any = {
        orgId: org.id,
        caseId,
        contractorId,
        title: title || `${smartCase.category} - ${smartCase.title}`,
        description: description || smartCase.description,
        scheduledStartAt: new Date(scheduledStartAt),
        scheduledEndAt: new Date(scheduledEndAt),
        status: requiresTenantAccess ? "Proposed" : "Confirmed",
        priority,
        requiresTenantAccess,
        proposedBy: "system"
      };

      // Add approval workflow for tenant access
      if (requiresTenantAccess) {
        const { nanoid } = await import("nanoid");
        appointmentData.approvalToken = nanoid(32);
        appointmentData.approvalExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h expiry
      }

      const appointment = await storage.createAppointment(appointmentData);
      
      // Update case with assigned contractor if not already assigned
      if (!smartCase.contractorId) {
        await storage.updateSmartCase(caseId, {
          contractorId,
          status: "In Progress"
        });
      }

      console.log(`📅 Smart appointment created: ${appointment.id}`, {
        contractor: contractor.name,
        scheduledStart: scheduledStartAt,
        requiresApproval: requiresTenantAccess
      });

      res.json({
        appointment,
        contractor: {
          id: contractor.id,
          name: contractor.name,
          phone: contractor.phone,
          email: contractor.email
        }
      });
    } catch (error) {
      console.error('Smart appointment creation error:', error);
      res.status(500).json({ message: 'Failed to create appointment from recommendation' });
    }
  });

  // ✅ Secure Contractor Response API - Accept/Decline Cases
  app.post('/api/cases/:caseId/contractor-response', isAuthenticated, requireRole(['contractor']), async (req: any, res) => {
    try {
      const { caseId } = req.params;
      const { action } = req.body; // Only action - don't trust client-sent contractorId
      const userId = req.user.claims.sub; // Use authenticated user ID
      
      // Validate input with Zod
      const contractorResponseSchema = z.object({
        action: z.enum(['accept', 'decline'])
      });
      
      const validation = contractorResponseSchema.safeParse({ action });
      if (!validation.success) {
        return res.status(400).json({ message: 'Invalid action. Must be accept or decline.' });
      }
      
      // Get the case and verify authorization
      const smartCase = await storage.getSmartCase(caseId);
      if (!smartCase) {
        return res.status(404).json({ message: 'Case not found' });
      }
      
      // Get user's organization for authorization
      const userOrg = await storage.getUserOrganization(userId);
      if (!userOrg) {
        return res.status(403).json({ message: 'User not in organization' });
      }
      
      // Organization scoping: Only allow contractors to act on cases in their organization
      if (smartCase.orgId !== userOrg.id) {
        return res.status(403).json({ 
          message: 'Access denied. Case belongs to different organization.' 
        });
      }
      
      // Security check: Verify this contractor is actually assigned to this case
      // Only allow if the case is unassigned (first assignment) or already assigned to this contractor
      if (smartCase.contractorId && smartCase.contractorId !== userId) {
        return res.status(403).json({ 
          message: 'Access denied. You are not assigned to this case.' 
        });
      }
      
      if (action === 'accept') {
        // Simple assignment for now - atomic updates can be added later
        // Get case again to check for race conditions
        const latestCase = await storage.getSmartCase(caseId);
        if (latestCase?.contractorId && latestCase.contractorId !== userId) {
          return res.status(409).json({ 
            message: 'Case was already assigned to another contractor. Please refresh to see latest cases.' 
          });
        }
        
        await storage.updateSmartCase(caseId, {
          contractorId: userId,
          status: 'In Progress'
        });
        
        console.log(`✅ Contractor ${userId} accepted case ${smartCase.caseNumber}`);
        
        // Notify admins of acceptance
        // TODO: Implement proper admin notification when storage methods are available
        
        res.json({ 
          message: 'Case accepted successfully',
          caseId,
          caseNumber: smartCase.caseNumber,
          status: 'accepted'
        });
      } else {
        // Log the decline (case remains unassigned)
        console.log(`❌ Contractor ${userId} declined case ${smartCase.caseNumber}`);
        
        // If case was assigned to this contractor, remove assignment
        if (smartCase.contractorId === userId) {
          await storage.updateSmartCase(caseId, {
            contractorId: null,
            status: 'New' // Reset to unassigned status
          });
        }
        
        // TODO: Notify admins about decline and suggest reassignment
        res.json({ 
          message: 'Case declined',
          caseId,
          caseNumber: smartCase.caseNumber,
          status: 'declined'
        });
      }
    } catch (error) {
      console.error('Contractor response error:', error);
      res.status(500).json({ message: 'Failed to process contractor response' });
    }
  });

  const httpServer = createServer(app);

  // ✅ Secure WebSocket Server for Real-time Notifications
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws'
  });
  
  wss.on('connection', async (ws: WebSocket, req: any) => {
    try {
      console.log('🔌 WebSocket connection attempt');
      
      // For now, skip authentication and use a fallback approach
      // TODO: Implement proper WebSocket authentication with session validation
      ws.send('{"type": "connection", "status": "connected"}');
      console.log('🔗 WebSocket connected for live notifications');
      
      ws.on('close', () => {
        console.log('🔌 WebSocket disconnected');
      });
      
      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
      });
      
    } catch (error) {
      console.error('❌ WebSocket authentication failed:', error);
      ws.close(1011, 'Authentication failed');
    }
  });

  return httpServer;
}
