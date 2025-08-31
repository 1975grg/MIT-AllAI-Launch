import {
  users,
  organizations,
  organizationMembers,
  ownershipEntities,
  properties,
  propertyOwnerships,
  units,
  unitAppliances,
  tenantGroups,
  tenants,
  leases,
  assets,
  smartCases,
  caseMedia,
  caseEvents,
  vendors,
  camCategories,
  transactions,
  transactionLineItems,
  camEntries,
  reminders,
  regulatoryRules,
  notifications,
  threads,
  messages,
  type User,
  type UpsertUser,
  type Organization,
  type InsertOrganization,
  type OwnershipEntity,
  type InsertOwnershipEntity,
  type Property,
  type InsertProperty,
  type Unit,
  type InsertUnit,
  type TenantGroup,
  type InsertTenantGroup,
  type Tenant,
  type InsertTenant,
  type Lease,
  type InsertLease,
  type Asset,
  type InsertAsset,
  type SmartCase,
  type InsertSmartCase,
  type Vendor,
  type InsertVendor,
  type Transaction,
  type TransactionLineItem,
  type InsertTransaction,
  type InsertTransactionLineItem,
  type InsertExpense,
  type Reminder,
  type InsertReminder,
  type Notification,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, sql, gte, lte, count } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Organization operations
  getUserOrganization(userId: string): Promise<Organization | undefined>;
  createOrganization(org: InsertOrganization): Promise<Organization>;
  
  // Ownership entity operations
  getOwnershipEntities(orgId: string): Promise<OwnershipEntity[]>;
  createOwnershipEntity(entity: InsertOwnershipEntity): Promise<OwnershipEntity>;
  updateOwnershipEntity(id: string, entity: Partial<InsertOwnershipEntity>): Promise<OwnershipEntity>;
  deleteOwnershipEntity(id: string): Promise<void>;
  getEntityPerformance(entityId: string, orgId: string): Promise<any>;
  
  // Property operations
  getProperties(orgId: string): Promise<Property[]>;
  getProperty(id: string): Promise<Property | undefined>;
  createProperty(property: InsertProperty): Promise<Property>;
  createPropertyWithOwnerships(property: InsertProperty, ownerships: Array<{entityId: string, percent: number}>): Promise<Property>;
  updateProperty(id: string, property: Partial<InsertProperty>): Promise<Property>;
  updatePropertyWithOwnerships(id: string, property: Partial<InsertProperty>, ownerships: Array<{entityId: string, percent: number}>): Promise<Property>;
  deleteProperty(id: string): Promise<void>;
  
  // Unit operations
  getUnits(propertyId: string): Promise<Unit[]>;
  getUnit(id: string): Promise<Unit | undefined>;
  createUnit(unit: InsertUnit): Promise<Unit>;
  updateUnit(id: string, unit: Partial<InsertUnit>): Promise<Unit>;
  deleteUnit(id: string): Promise<void>;
  
  // Tenant operations
  getTenantGroups(orgId: string): Promise<TenantGroup[]>;
  getTenantGroup(id: string): Promise<TenantGroup | undefined>;
  createTenantGroup(group: InsertTenantGroup): Promise<TenantGroup>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  
  // Lease operations
  getLeases(orgId: string): Promise<Lease[]>;
  getActiveLease(unitId: string): Promise<Lease | undefined>;
  createLease(lease: InsertLease): Promise<Lease>;
  updateLease(id: string, lease: Partial<InsertLease>): Promise<Lease>;
  
  // Smart Case operations
  getSmartCases(orgId: string): Promise<SmartCase[]>;
  getSmartCase(id: string): Promise<SmartCase | undefined>;
  createSmartCase(smartCase: InsertSmartCase): Promise<SmartCase>;
  updateSmartCase(id: string, smartCase: Partial<InsertSmartCase>): Promise<SmartCase>;
  
  // Asset operations
  getAssets(propertyId?: string, unitId?: string): Promise<Asset[]>;
  createAsset(asset: InsertAsset): Promise<Asset>;
  
  // Vendor operations
  getVendors(orgId: string): Promise<Vendor[]>;
  createVendor(vendor: InsertVendor): Promise<Vendor>;
  
  // Transaction operations
  getTransactions(orgId: string, type?: "Income" | "Expense"): Promise<Transaction[]>;
  getTransactionsByEntity(entityId: string): Promise<Transaction[]>;
  getTransactionsByProperty(propertyId: string): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: string, transaction: Partial<InsertTransaction>): Promise<Transaction>;
  createExpense(expense: InsertExpense): Promise<Transaction>;
  getTransactionLineItems(transactionId: string): Promise<TransactionLineItem[]>;
  
  // Reminder operations
  getReminders(orgId: string): Promise<Reminder[]>;
  getDueReminders(): Promise<Reminder[]>;
  createReminder(reminder: InsertReminder): Promise<Reminder>;
  updateReminder(id: string, reminder: Partial<InsertReminder>): Promise<Reminder>;
  
  // Notification operations
  getUserNotifications(userId: string): Promise<Notification[]>;
  createNotification(userId: string, title: string, message: string, type?: string): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<void>;
  
  // Dashboard operations
  getDashboardStats(orgId: string): Promise<{
    totalProperties: number;
    monthlyRevenue: number;
    openCases: number;
    dueReminders: number;
  }>;
  
  getRentCollectionStatus(orgId: string): Promise<{
    collected: number;
    total: number;
    percentage: number;
    items: Array<{
      id: string;
      property: string;
      tenant: string;
      amount: number;
      status: "paid" | "due" | "overdue";
      dueDate: Date;
    }>;
  }>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Organization operations
  async getUserOrganization(userId: string): Promise<Organization | undefined> {
    const [org] = await db
      .select()
      .from(organizations)
      .leftJoin(organizationMembers, eq(organizations.id, organizationMembers.orgId))
      .where(eq(organizationMembers.userId, userId))
      .limit(1);
    
    return org?.organizations;
  }

  async createOrganization(orgData: InsertOrganization): Promise<Organization> {
    const [org] = await db.insert(organizations).values(orgData).returning();
    
    // Add the owner as an admin member
    await db.insert(organizationMembers).values({
      orgId: org.id,
      userId: org.ownerId,
      role: "admin",
    });
    
    return org;
  }

  // Ownership entity operations
  async getOwnershipEntities(orgId: string): Promise<OwnershipEntity[]> {
    return await db
      .select()
      .from(ownershipEntities)
      .where(eq(ownershipEntities.orgId, orgId))
      .orderBy(asc(ownershipEntities.name));
  }

  async createOwnershipEntity(entity: InsertOwnershipEntity): Promise<OwnershipEntity> {
    const [newEntity] = await db.insert(ownershipEntities).values(entity).returning();
    return newEntity;
  }

  async updateOwnershipEntity(id: string, entity: Partial<InsertOwnershipEntity>): Promise<OwnershipEntity> {
    const [updated] = await db
      .update(ownershipEntities)
      .set(entity)
      .where(eq(ownershipEntities.id, id))
      .returning();
    return updated;
  }

  async deleteOwnershipEntity(id: string): Promise<void> {
    await db.delete(ownershipEntities).where(eq(ownershipEntities.id, id));
  }

  async getEntityPerformance(entityId: string, orgId: string): Promise<any> {
    // Get the entity
    const [entity] = await db
      .select()
      .from(ownershipEntities)
      .where(and(eq(ownershipEntities.id, entityId), eq(ownershipEntities.orgId, orgId)));
    
    if (!entity) {
      return null;
    }

    // Get properties owned by this entity
    const propertiesResult = await db
      .select({
        id: properties.id,
        name: properties.name,
        type: properties.type,
        street: properties.street,
        city: properties.city,
        state: properties.state,
        ownershipPercent: propertyOwnerships.percent,
      })
      .from(properties)
      .innerJoin(propertyOwnerships, eq(properties.id, propertyOwnerships.propertyId))
      .where(and(
        eq(propertyOwnerships.entityId, entityId),
        eq(properties.orgId, orgId)
      ))
      .orderBy(asc(properties.name));

    // Calculate metrics (simplified for now - in a real app you'd have actual financial data)
    const totalProperties = propertiesResult.length;
    const estimatedPropertyValue = 250000; // Default estimated value per property
    
    let totalValue = 0;
    let totalOwnershipValue = 0;
    
    const propertiesWithValues = propertiesResult.map(property => {
      const propertyValue = estimatedPropertyValue;
      const ownershipPercent = Number(property.ownershipPercent);
      const ownershipValue = propertyValue * (ownershipPercent / 100);
      
      totalValue += propertyValue;
      totalOwnershipValue += ownershipValue;
      
      return {
        ...property,
        estimatedValue: propertyValue,
      };
    });

    // Simplified financial metrics (in a real app, these would come from actual lease/expense data)
    const avgOwnershipPercent = totalProperties > 0 ? 
      propertiesResult.reduce((sum, p) => sum + Number(p.ownershipPercent), 0) / totalProperties : 0;
    const monthlyRevenue = totalProperties * 2000 * (avgOwnershipPercent / 100);
    const monthlyExpenses = totalProperties * 500 * (avgOwnershipPercent / 100);
    const netCashFlow = monthlyRevenue - monthlyExpenses;

    return {
      entity,
      properties: propertiesWithValues,
      metrics: {
        totalProperties,
        totalValue,
        monthlyRevenue: Math.round(monthlyRevenue),
        monthlyExpenses: Math.round(monthlyExpenses),
        netCashFlow: Math.round(netCashFlow),
        totalOwnershipValue: Math.round(totalOwnershipValue),
      },
    };
  }

  // Property operations
  async getProperties(orgId: string): Promise<Property[]> {
    const result = await db
      .select({
        id: properties.id,
        orgId: properties.orgId,
        name: properties.name,
        type: properties.type,
        street: properties.street,
        city: properties.city,
        state: properties.state,
        zipCode: properties.zipCode,
        country: properties.country,
        yearBuilt: properties.yearBuilt,
        sqft: properties.sqft,
        hoaName: properties.hoaName,
        hoaContact: properties.hoaContact,
        notes: properties.notes,
        createdAt: properties.createdAt,
        // Include ownership information
        ownershipEntityId: propertyOwnerships.entityId,
        ownershipPercent: propertyOwnerships.percent,
        entityName: ownershipEntities.name,
        entityType: ownershipEntities.type,
      })
      .from(properties)
      .leftJoin(propertyOwnerships, eq(properties.id, propertyOwnerships.propertyId))
      .leftJoin(ownershipEntities, eq(propertyOwnerships.entityId, ownershipEntities.id))
      .where(eq(properties.orgId, orgId))
      .orderBy(asc(properties.name));
    
    // Group by property and aggregate ownership information
    const propertiesMap = new Map();
    
    for (const row of result) {
      if (!propertiesMap.has(row.id)) {
        propertiesMap.set(row.id, {
          id: row.id,
          orgId: row.orgId,
          name: row.name,
          type: row.type,
          street: row.street,
          city: row.city,
          state: row.state,
          zipCode: row.zipCode,
          country: row.country,
          yearBuilt: row.yearBuilt,
          sqft: row.sqft,
          hoaName: row.hoaName,
          hoaContact: row.hoaContact,
          notes: row.notes,
          createdAt: row.createdAt,
          ownerships: []
        });
      }
      
      if (row.ownershipEntityId) {
        propertiesMap.get(row.id).ownerships.push({
          entityId: row.ownershipEntityId,
          percent: parseFloat(row.ownershipPercent || "0"),
          entityName: row.entityName,
          entityType: row.entityType,
        });
      }
    }
    
    return Array.from(propertiesMap.values());
  }

  async getProperty(id: string): Promise<Property | undefined> {
    const [property] = await db.select().from(properties).where(eq(properties.id, id));
    return property;
  }

  async createProperty(property: InsertProperty): Promise<Property> {
    const [newProperty] = await db.insert(properties).values(property).returning();
    return newProperty;
  }

  async createPropertyWithOwnerships(property: InsertProperty, ownerships: Array<{entityId: string, percent: number}>): Promise<Property> {
    const [newProperty] = await db.insert(properties).values(property).returning();
    
    // Create ownership records
    if (ownerships && ownerships.length > 0) {
      const ownershipRecords = ownerships.map(ownership => ({
        propertyId: newProperty.id,
        entityId: ownership.entityId,
        percent: ownership.percent.toString(),
      }));
      
      await db.insert(propertyOwnerships).values(ownershipRecords);
    }
    
    return newProperty;
  }

  async createPropertyWithOwnershipsAndUnit(
    property: InsertProperty, 
    ownerships: Array<{entityId: string, percent: number}>,
    defaultUnit?: {
      label: string;
      bedrooms?: number;
      bathrooms?: number;
      sqft?: number;
      rentAmount?: string;
      deposit?: string;
      notes?: string;
      hvacBrand?: string;
      hvacModel?: string;
      hvacYear?: number;
      hvacLifetime?: number;
      hvacReminder?: boolean;
      waterHeaterBrand?: string;
      waterHeaterModel?: string;
      waterHeaterYear?: number;
      waterHeaterLifetime?: number;
      waterHeaterReminder?: boolean;
      applianceNotes?: string;
      appliances?: Array<any>;
    }
  ): Promise<{property: Property, unit?: Unit}> {
    // First create the property with ownerships
    const newProperty = await this.createPropertyWithOwnerships(property, ownerships);
    
    let newUnit = undefined;
    if (defaultUnit) {
      // Create the default unit with appliance data
      const unitData: InsertUnit = {
        propertyId: newProperty.id,
        label: defaultUnit.label,
        bedrooms: defaultUnit.bedrooms,
        bathrooms: defaultUnit.bathrooms ? defaultUnit.bathrooms.toString() : undefined,
        sqft: defaultUnit.sqft,
        rentAmount: defaultUnit.rentAmount ? defaultUnit.rentAmount : undefined,
        deposit: defaultUnit.deposit ? defaultUnit.deposit : undefined,
        notes: defaultUnit.notes,
        hvacBrand: defaultUnit.hvacBrand,
        hvacModel: defaultUnit.hvacModel,
        hvacYear: defaultUnit.hvacYear,
        hvacLifetime: defaultUnit.hvacLifetime,
        hvacReminder: defaultUnit.hvacReminder,
        waterHeaterBrand: defaultUnit.waterHeaterBrand,
        waterHeaterModel: defaultUnit.waterHeaterModel,
        waterHeaterYear: defaultUnit.waterHeaterYear,
        waterHeaterLifetime: defaultUnit.waterHeaterLifetime,
        waterHeaterReminder: defaultUnit.waterHeaterReminder,
        applianceNotes: defaultUnit.applianceNotes,
      };
      
      newUnit = await this.createUnit(unitData);
      
      // Handle custom appliances
      if (defaultUnit.appliances && defaultUnit.appliances.length > 0) {
        for (const appliance of defaultUnit.appliances) {
          await this.createUnitAppliance({
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
    
    return { property: newProperty, unit: newUnit };
  }

  async updateProperty(id: string, property: Partial<InsertProperty>): Promise<Property> {
    const [updated] = await db
      .update(properties)
      .set(property)
      .where(eq(properties.id, id))
      .returning();
    return updated;
  }

  async updatePropertyWithOwnerships(id: string, property: Partial<InsertProperty>, ownerships: Array<{entityId: string, percent: number}>): Promise<Property> {
    // Update the property
    const [updated] = await db
      .update(properties)
      .set(property)
      .where(eq(properties.id, id))
      .returning();
    
    // Delete existing ownerships
    await db.delete(propertyOwnerships).where(eq(propertyOwnerships.propertyId, id));
    
    // Create new ownership records
    if (ownerships && ownerships.length > 0) {
      const ownershipRecords = ownerships.map(ownership => ({
        propertyId: id,
        entityId: ownership.entityId,
        percent: ownership.percent.toString(),
      }));
      
      await db.insert(propertyOwnerships).values(ownershipRecords);
    }
    
    return updated;
  }

  async deleteProperty(id: string): Promise<void> {
    await db.delete(properties).where(eq(properties.id, id));
  }

  // Unit operations
  async getAllUnits(orgId: string): Promise<Unit[]> {
    return await db
      .select({
        id: units.id,
        propertyId: units.propertyId,
        label: units.label,
        bedrooms: units.bedrooms,
        bathrooms: units.bathrooms,
        sqft: units.sqft,
        floor: units.floor,
        rentAmount: units.rentAmount,
        deposit: units.deposit,
        notes: units.notes,
        hvacBrand: units.hvacBrand,
        hvacModel: units.hvacModel,
        hvacYear: units.hvacYear,
        hvacLifetime: units.hvacLifetime,
        hvacReminder: units.hvacReminder,
        waterHeaterBrand: units.waterHeaterBrand,
        waterHeaterModel: units.waterHeaterModel,
        waterHeaterYear: units.waterHeaterYear,
        waterHeaterLifetime: units.waterHeaterLifetime,
        waterHeaterReminder: units.waterHeaterReminder,
        applianceNotes: units.applianceNotes,
        createdAt: units.createdAt,
      })
      .from(units)
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(eq(properties.orgId, orgId))
      .orderBy(asc(units.label));
  }

  async getUnits(propertyId: string): Promise<Unit[]> {
    return await db
      .select()
      .from(units)
      .where(eq(units.propertyId, propertyId))
      .orderBy(asc(units.label));
  }

  async getUnit(id: string): Promise<Unit | undefined> {
    const [unit] = await db.select().from(units).where(eq(units.id, id));
    return unit;
  }

  async createUnit(unit: InsertUnit): Promise<Unit> {
    const [newUnit] = await db.insert(units).values(unit).returning();
    return newUnit;
  }

  async updateUnit(id: string, unit: Partial<InsertUnit>): Promise<Unit> {
    const [updated] = await db
      .update(units)
      .set(unit)
      .where(eq(units.id, id))
      .returning();
    return updated;
  }

  async deleteUnit(id: string): Promise<void> {
    await db.delete(units).where(eq(units.id, id));
  }


  // Unit appliance operations
  async createUnitAppliance(appliance: {
    unitId: string;
    name: string;
    manufacturer?: string;
    model?: string;
    year?: number;
    expectedLifetime?: number;
    alertBeforeExpiry?: number;
    notes?: string;
  }): Promise<any> {
    const [newAppliance] = await db.insert(unitAppliances).values(appliance).returning();
    return newAppliance;
  }

  async getUnitAppliances(unitId: string): Promise<any[]> {
    return await db.select().from(unitAppliances).where(eq(unitAppliances.unitId, unitId));
  }

  async deleteUnitAppliances(unitId: string): Promise<void> {
    await db.delete(unitAppliances).where(eq(unitAppliances.unitId, unitId));
  }

  // Tenant operations
  async getTenantGroups(orgId: string): Promise<TenantGroup[]> {
    return await db
      .select()
      .from(tenantGroups)
      .where(eq(tenantGroups.orgId, orgId))
      .orderBy(desc(tenantGroups.createdAt));
  }

  async getTenantGroup(id: string): Promise<TenantGroup | undefined> {
    const [group] = await db.select().from(tenantGroups).where(eq(tenantGroups.id, id));
    return group;
  }

  async createTenantGroup(group: InsertTenantGroup): Promise<TenantGroup> {
    const [newGroup] = await db.insert(tenantGroups).values(group).returning();
    return newGroup;
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const [newTenant] = await db.insert(tenants).values(tenant).returning();
    return newTenant;
  }

  // Lease operations
  async getLeases(orgId: string): Promise<Lease[]> {
    const result = await db
      .select({
        id: leases.id,
        unitId: leases.unitId,
        tenantGroupId: leases.tenantGroupId,
        startDate: leases.startDate,
        endDate: leases.endDate,
        rent: leases.rent,
        deposit: leases.deposit,
        dueDay: leases.dueDay,
        lateFeeRuleJson: leases.lateFeeRuleJson,
        status: leases.status,
        createdAt: leases.createdAt,
      })
      .from(leases)
      .leftJoin(units, eq(leases.unitId, units.id))
      .leftJoin(properties, eq(units.propertyId, properties.id))
      .where(eq(properties.orgId, orgId))
      .orderBy(desc(leases.startDate));
    return result;
  }

  async getActiveLease(unitId: string): Promise<Lease | undefined> {
    const [lease] = await db
      .select()
      .from(leases)
      .where(and(eq(leases.unitId, unitId), eq(leases.status, "Active")))
      .limit(1);
    return lease;
  }

  async createLease(lease: InsertLease): Promise<Lease> {
    const [newLease] = await db.insert(leases).values(lease).returning();
    return newLease;
  }

  async updateLease(id: string, lease: Partial<InsertLease>): Promise<Lease> {
    const [updated] = await db
      .update(leases)
      .set(lease)
      .where(eq(leases.id, id))
      .returning();
    return updated;
  }

  // Smart Case operations
  async getSmartCases(orgId: string): Promise<SmartCase[]> {
    return await db
      .select()
      .from(smartCases)
      .where(eq(smartCases.orgId, orgId))
      .orderBy(desc(smartCases.createdAt));
  }

  async getSmartCase(id: string): Promise<SmartCase | undefined> {
    const [smartCase] = await db.select().from(smartCases).where(eq(smartCases.id, id));
    return smartCase;
  }

  async createSmartCase(smartCase: InsertSmartCase): Promise<SmartCase> {
    const [newCase] = await db.insert(smartCases).values(smartCase).returning();
    return newCase;
  }

  async updateSmartCase(id: string, smartCase: Partial<InsertSmartCase>): Promise<SmartCase> {
    const [updated] = await db
      .update(smartCases)
      .set({ ...smartCase, updatedAt: new Date() })
      .where(eq(smartCases.id, id))
      .returning();
    return updated;
  }

  // Asset operations
  async getAssets(propertyId?: string, unitId?: string): Promise<Asset[]> {
    const baseQuery = db.select().from(assets);
    
    if (propertyId && unitId) {
      return await baseQuery
        .where(and(eq(assets.propertyId, propertyId), eq(assets.unitId, unitId)))
        .orderBy(asc(assets.category));
    } else if (propertyId) {
      return await baseQuery
        .where(eq(assets.propertyId, propertyId))
        .orderBy(asc(assets.category));
    } else if (unitId) {
      return await baseQuery
        .where(eq(assets.unitId, unitId))
        .orderBy(asc(assets.category));
    }
    
    return await baseQuery.orderBy(asc(assets.category));
  }

  async createAsset(asset: InsertAsset): Promise<Asset> {
    const [newAsset] = await db.insert(assets).values(asset).returning();
    return newAsset;
  }

  // Vendor operations
  async getVendors(orgId: string): Promise<Vendor[]> {
    return await db
      .select()
      .from(vendors)
      .where(eq(vendors.orgId, orgId))
      .orderBy(asc(vendors.name));
  }

  async createVendor(vendor: InsertVendor): Promise<Vendor> {
    const [newVendor] = await db.insert(vendors).values(vendor).returning();
    return newVendor;
  }

  // Transaction operations
  async getTransactions(orgId: string, type?: "Income" | "Expense"): Promise<Transaction[]> {
    if (type) {
      return await db
        .select()
        .from(transactions)
        .where(and(eq(transactions.orgId, orgId), eq(transactions.type, type)))
        .orderBy(desc(transactions.date));
    }
    
    return await db
      .select()
      .from(transactions)
      .where(eq(transactions.orgId, orgId))
      .orderBy(desc(transactions.date));
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [newTransaction] = await db.insert(transactions).values(transaction).returning();
    return newTransaction;
  }

  async updateTransaction(id: string, transaction: Partial<InsertTransaction>): Promise<Transaction> {
    const [updated] = await db
      .update(transactions)
      .set(transaction)
      .where(eq(transactions.id, id))
      .returning();
    return updated;
  }

  async createExpense(expense: InsertExpense): Promise<Transaction> {
    const [newExpense] = await db.insert(transactions).values({
      ...expense,
      recurringEndDate: expense.recurringEndDate ? (typeof expense.recurringEndDate === 'string' ? new Date(expense.recurringEndDate) : expense.recurringEndDate) : null,
    }).returning();
    
    // If this is a recurring expense, create future instances
    if (expense.isRecurring && expense.recurringFrequency) {
      await this.createRecurringExpenses(newExpense);
    }
    
    // Create line items if provided
    if (expense.lineItems && expense.lineItems.length > 0) {
      const lineItems = expense.lineItems.map(item => ({
        ...item,
        transactionId: newExpense.id,
      }));
      await db.insert(transactionLineItems).values(lineItems);
    }

    return newExpense;
  }

  async getTransactionsByEntity(entityId: string): Promise<Transaction[]> {
    return await db
      .select()
      .from(transactions)
      .where(eq(transactions.entityId, entityId))
      .orderBy(desc(transactions.date));
  }

  async getTransactionsByProperty(propertyId: string): Promise<Transaction[]> {
    return await db
      .select()
      .from(transactions)
      .where(eq(transactions.propertyId, propertyId))
      .orderBy(desc(transactions.date));
  }

  async getTransactionLineItems(transactionId: string): Promise<TransactionLineItem[]> {
    return await db
      .select()
      .from(transactionLineItems)
      .where(eq(transactionLineItems.transactionId, transactionId));
  }

  private async createRecurringExpenses(originalExpense: Transaction): Promise<void> {
    if (!originalExpense.isRecurring || !originalExpense.recurringFrequency) return;

    const frequency = originalExpense.recurringFrequency;
    const interval = originalExpense.recurringInterval || 1;
    const startDate = new Date(originalExpense.date);
    const endDate = originalExpense.recurringEndDate ? new Date(originalExpense.recurringEndDate) : null;
    
    // Calculate how many instances to create (limit to 24 months for safety)
    const maxInstances = 24;
    let currentDate = new Date(startDate);
    const instances: Array<InsertExpense> = [];

    for (let i = 0; i < maxInstances; i++) {
      // Calculate next occurrence based on frequency and interval
      switch (frequency) {
        case "days":
          currentDate.setDate(currentDate.getDate() + interval);
          break;
        case "weeks":
          currentDate.setDate(currentDate.getDate() + (interval * 7));
          break;
        case "months":
          currentDate.setMonth(currentDate.getMonth() + interval);
          break;
        case "years":
          currentDate.setFullYear(currentDate.getFullYear() + interval);
          break;
        // Legacy support for old format
        case "monthly":
          currentDate.setMonth(currentDate.getMonth() + 1);
          break;
        case "quarterly":
          currentDate.setMonth(currentDate.getMonth() + 3);
          break;
        case "biannually":
          currentDate.setMonth(currentDate.getMonth() + 6);
          break;
        case "annually":
          currentDate.setFullYear(currentDate.getFullYear() + 1);
          break;
      }

      // Stop if we've reached the end date
      if (endDate && currentDate > endDate) break;

      // Stop if we're more than 2 years out
      if (currentDate > new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000)) break;

      instances.push({
        orgId: originalExpense.orgId,
        propertyId: originalExpense.propertyId || undefined,
        unitId: originalExpense.unitId || undefined,
        entityId: originalExpense.entityId || undefined,
        vendorId: originalExpense.vendorId || undefined,
        type: "Expense" as const,
        scope: (originalExpense.scope as "property" | "operational") || "property",
        amount: originalExpense.amount,
        description: originalExpense.description,
        category: originalExpense.category || undefined,
        date: new Date(currentDate),
        receiptUrl: originalExpense.receiptUrl || undefined,
        notes: originalExpense.notes || undefined,
        isRecurring: false, // Future instances are not recurring themselves
        recurringFrequency: undefined,
        recurringInterval: 1,
        recurringEndDate: null,
        taxDeductible: originalExpense.taxDeductible || true,
        parentRecurringId: originalExpense.id,
        isBulkEntry: false,
      });
    }

    // Insert all future instances
    if (instances.length > 0) {
      await db.insert(transactions).values(instances);
    }
  }

  // Reminder operations
  async getReminders(orgId: string): Promise<Reminder[]> {
    return await db
      .select()
      .from(reminders)
      .where(eq(reminders.orgId, orgId))
      .orderBy(asc(reminders.dueAt));
  }

  async getDueReminders(): Promise<Reminder[]> {
    const now = new Date();
    return await db
      .select()
      .from(reminders)
      .where(
        and(
          lte(reminders.dueAt, now),
          eq(reminders.status, "Pending")
        )
      );
  }

  async createReminder(reminder: InsertReminder): Promise<Reminder> {
    const [newReminder] = await db.insert(reminders).values(reminder).returning();
    return newReminder;
  }

  async updateReminder(id: string, reminder: Partial<InsertReminder>): Promise<Reminder> {
    const [updated] = await db
      .update(reminders)
      .set(reminder)
      .where(eq(reminders.id, id))
      .returning();
    return updated;
  }

  // Create lease end reminders (similar to entity renewal reminders)
  async createLeaseEndReminders(): Promise<void> {
    const now = new Date();
    const reminderIntervals = [120, 90, 60, 30]; // Days before lease end
    
    // Get all active leases
    const activeLeases = await db
      .select({
        id: leases.id,
        endDate: leases.endDate,
        rent: leases.rent,
        unitId: leases.unitId,
        tenantGroupId: leases.tenantGroupId,
        unitLabel: units.label,
        propertyName: properties.name,
        propertyId: properties.id,
        orgId: properties.orgId,
        tenantGroupName: tenantGroups.name,
      })
      .from(leases)
      .leftJoin(units, eq(leases.unitId, units.id))
      .leftJoin(properties, eq(units.propertyId, properties.id))
      .leftJoin(tenantGroups, eq(leases.tenantGroupId, tenantGroups.id))
      .where(eq(leases.status, "Active"));

    for (const lease of activeLeases) {
      if (!lease.endDate || !lease.orgId) continue;

      const endDate = new Date(lease.endDate);
      const daysUntilEnd = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Create reminders for each interval if lease ends within that timeframe
      for (const intervalDays of reminderIntervals) {
        if (daysUntilEnd <= intervalDays && daysUntilEnd > 0) {
          // Check if reminder already exists
          const existingReminder = await db
            .select()
            .from(reminders)
            .where(
              and(
                eq(reminders.orgId, lease.orgId),
                eq(reminders.scope, "lease"),
                eq(reminders.scopeId, lease.id),
                eq(reminders.type, "lease"),
                eq(reminders.leadDays, intervalDays)
              )
            )
            .limit(1);

          if (existingReminder.length === 0) {
            // Calculate reminder due date
            const reminderDate = new Date(endDate);
            reminderDate.setDate(reminderDate.getDate() - intervalDays);

            const reminderData = {
              orgId: lease.orgId,
              scope: "lease" as const,
              scopeId: lease.id,
              title: `Lease Expiring - ${lease.propertyName} ${lease.unitLabel ? `(${lease.unitLabel})` : ''}`,
              type: "lease" as const,
              dueAt: reminderDate,
              leadDays: intervalDays,
              channel: "inapp" as const,
              status: "Pending" as const,
              payloadJson: {
                leaseId: lease.id,
                tenantGroup: lease.tenantGroupName,
                property: lease.propertyName,
                unit: lease.unitLabel,
                endDate: lease.endDate,
                rent: lease.rent,
              },
            };

            await this.createReminder(reminderData);
            console.log(`Created lease end reminder (${intervalDays} days) for: ${lease.propertyName} ${lease.unitLabel || ''}`);
          }
        }
      }
    }
  }

  // Notification operations
  async getUserNotifications(userId: string): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }

  async createNotification(userId: string, title: string, message: string, type = "info"): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values({ userId, title, message, type })
      .returning();
    return notification;
  }

  async markNotificationAsRead(id: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id));
  }

  // Dashboard operations
  async getDashboardStats(orgId: string): Promise<{
    totalProperties: number;
    monthlyRevenue: number;
    openCases: number;
    dueReminders: number;
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Total properties
    const [propertyCount] = await db
      .select({ count: count() })
      .from(properties)
      .where(eq(properties.orgId, orgId));

    // Monthly revenue (rent income for current month)
    const [monthlyRevenue] = await db
      .select({ 
        total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` 
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.orgId, orgId),
          eq(transactions.type, "Income"),
          gte(transactions.date, startOfMonth),
          lte(transactions.date, endOfMonth)
        )
      );

    // Open cases
    const [openCases] = await db
      .select({ count: count() })
      .from(smartCases)
      .where(
        and(
          eq(smartCases.orgId, orgId),
          sql`${smartCases.status} NOT IN ('Resolved', 'Closed')`
        )
      );

    // Due reminders
    const [dueReminders] = await db
      .select({ count: count() })
      .from(reminders)
      .where(
        and(
          eq(reminders.orgId, orgId),
          eq(reminders.status, "Pending"),
          lte(reminders.dueAt, now)
        )
      );

    return {
      totalProperties: propertyCount.count,
      monthlyRevenue: monthlyRevenue.total || 0,
      openCases: openCases.count,
      dueReminders: dueReminders.count,
    };
  }

  async getRentCollectionStatus(orgId: string): Promise<{
    collected: number;
    total: number;
    percentage: number;
    items: Array<{
      id: string;
      property: string;
      tenant: string;
      amount: number;
      status: "paid" | "due" | "overdue";
      dueDate: Date;
    }>;
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get all active leases with property and tenant info
    const activeLeases = await db
      .select({
        leaseId: leases.id,
        rent: leases.rent,
        dueDay: leases.dueDay,
        propertyName: properties.name,
        unitLabel: units.label,
        tenantGroupId: leases.tenantGroupId,
      })
      .from(leases)
      .leftJoin(units, eq(leases.unitId, units.id))
      .leftJoin(properties, eq(units.propertyId, properties.id))
      .leftJoin(tenantGroups, eq(leases.tenantGroupId, tenantGroups.id))
      .where(
        and(
          eq(properties.orgId, orgId),
          eq(leases.status, "Active")
        )
      );

    // Calculate totals and status
    let totalRent = 0;
    let collectedRent = 0;
    const items: Array<{
      id: string;
      property: string;
      tenant: string;
      amount: number;
      status: "paid" | "due" | "overdue";
      dueDate: Date;
    }> = [];

    for (const lease of activeLeases) {
      totalRent += Number(lease.rent);
      
      const dueDate = new Date(now.getFullYear(), now.getMonth(), lease.dueDay || 1);
      const daysPastDue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Check if rent has been paid this month
      const [payment] = await db
        .select({ total: sql<number>`SUM(${transactions.amount})` })
        .from(transactions)
        .where(
          and(
            eq(transactions.orgId, orgId),
            eq(transactions.type, "Income"),
            sql`${transactions.description} LIKE '%rent%'`,
            gte(transactions.date, startOfMonth),
            lte(transactions.date, endOfMonth)
          )
        );

      const isPaid = payment && Number(payment.total) >= Number(lease.rent);
      
      if (isPaid) {
        collectedRent += Number(lease.rent);
      }

      let status: "paid" | "due" | "overdue" = "due";
      if (isPaid) {
        status = "paid";
      } else if (daysPastDue > 0) {
        status = "overdue";
      }

      items.push({
        id: lease.leaseId,
        property: `${lease.propertyName} - ${lease.unitLabel}`,
        tenant: lease.tenantGroupId ? "Tenant Group" : "No Tenant",
        amount: Number(lease.rent),
        status,
        dueDate,
      });
    }

    const percentage = totalRent > 0 ? Math.round((collectedRent / totalRent) * 100) : 0;

    return {
      collected: collectedRent,
      total: totalRent,
      percentage,
      items,
    };
  }
}

export const storage = new DatabaseStorage();
