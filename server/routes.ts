import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
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
import { startCronJobs } from "./cronJobs";

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
  app.get('/api/properties', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const properties = await storage.getProperties(org.id);
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
      
      const { ownerships, ...propertyData } = req.body;
      
      const validatedData = insertPropertySchema.parse({
        ...propertyData,
        orgId: org.id,
      });
      
      const property = await storage.createPropertyWithOwnerships(validatedData, ownerships);
      res.json(property);
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
      
      const { ownerships, ...propertyData } = req.body;
      
      // Validate the property data (excluding required fields for updates)
      const updatePropertySchema = insertPropertySchema.partial().omit({ orgId: true });
      const validatedData = updatePropertySchema.parse(propertyData);
      
      const property = await storage.updatePropertyWithOwnerships(req.params.id, validatedData, ownerships);
      res.json(property);
    } catch (error) {
      console.error("Error updating property:", error);
      res.status(500).json({ message: "Failed to update property" });
    }
  });

  // Unit routes
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

  app.post('/api/tenants', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const org = await storage.getUserOrganization(userId);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      
      const { tenantGroup, tenants } = req.body;
      
      const validatedGroup = insertTenantGroupSchema.parse({
        ...tenantGroup,
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
      
      res.json(group);
    } catch (error) {
      console.error("Error creating tenant:", error);
      res.status(500).json({ message: "Failed to create tenant" });
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
      const validatedData = insertLeaseSchema.parse(req.body);
      const lease = await storage.createLease(validatedData);
      res.json(lease);
    } catch (error) {
      console.error("Error creating lease:", error);
      res.status(500).json({ message: "Failed to create lease" });
    }
  });

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
      
      const validatedData = insertExpenseSchema.parse({
        ...req.body,
        orgId: org.id,
      });
      
      const expense = await storage.createExpense(validatedData);
      res.json(expense);
    } catch (error) {
      console.error("Error creating expense:", error);
      res.status(500).json({ message: "Failed to create expense" });
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

  const httpServer = createServer(app);
  return httpServer;
}
