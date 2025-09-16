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
import { eq, and, or, desc, asc, sql, gte, lte, count, like } from "drizzle-orm";

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
  getEntityPropertyCount(entityId: string, orgId: string): Promise<{ count: number; properties: Array<{id: string, name: string}> }>;
  getTenantRelationshipCount(tenantId: string, orgId: string): Promise<{ count: number; relationships: Array<{type: string, description: string}> }>;
  
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
  updateTenantGroup(id: string, updates: Partial<InsertTenantGroup>): Promise<TenantGroup>;
  updateTenant(id: string, updates: Partial<InsertTenant>): Promise<Tenant>;
  archiveTenantGroup(id: string): Promise<TenantGroup>;
  unarchiveTenantGroup(id: string): Promise<TenantGroup>;
  deleteTenant(id: string): Promise<void>;
  deleteTenantGroup(id: string): Promise<void>;
  getTenantsInGroup(groupId: string): Promise<Tenant[]>;
  archiveTenant(id: string): Promise<Tenant>;
  unarchiveTenant(id: string): Promise<Tenant>;
  permanentDeleteTenant(id: string): Promise<void>;
  
  // Lease operations
  getLeases(orgId: string): Promise<Lease[]>;
  getLease(id: string): Promise<Lease | undefined>;
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
  getTransactionById(id: string): Promise<Transaction | undefined>;
  getTransactionsByEntity(entityId: string): Promise<Transaction[]>;
  getTransactionsByProperty(propertyId: string): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: string, transaction: Partial<InsertTransaction>): Promise<Transaction>;
  deleteTransaction(id: string): Promise<void>;
  deleteRecurringTransaction(id: string, mode: "future" | "all"): Promise<void>;
  updateRecurringTransaction(id: string, transaction: Partial<InsertTransaction>, mode: "future" | "all"): Promise<void>;
  updateTransactionPaymentStatus(id: string, paymentStatus: string): Promise<void>;
  createExpense(expense: InsertExpense): Promise<Transaction>;
  getTransactionLineItems(transactionId: string): Promise<TransactionLineItem[]>;
  
  // Reminder operations
  getReminders(orgId: string): Promise<Reminder[]>;
  getDueReminders(): Promise<Reminder[]>;
  createReminder(reminder: InsertReminder): Promise<Reminder>;
  updateReminder(id: string, reminder: Partial<InsertReminder>): Promise<Reminder>;
  deleteReminder(id: string): Promise<void>;
  deleteRecurringReminder(id: string, mode: "future" | "all"): Promise<void>;
  updateRecurringReminder(id: string, data: Partial<InsertReminder>, mode: "future" | "all"): Promise<Reminder>;
  
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
    // CASCADE DELETE: Clean up all related data to prevent FK violations
    
    // 1. Delete property ownerships for this entity
    await db.delete(propertyOwnerships).where(eq(propertyOwnerships.entityId, id));
    
    // 2. Delete transactions related to this entity
    await db.delete(transactions).where(eq(transactions.entityId, id));
    
    // 3. Delete reminders scoped to this entity
    await db.delete(reminders).where(and(eq(reminders.scope, "entity"), eq(reminders.scopeId, id)));
    
    // 4. Finally delete the entity itself
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
        propertyValue: properties.propertyValue,
        autoAppreciation: properties.autoAppreciation,
        appreciationRate: properties.appreciationRate,
        valueEntryDate: properties.valueEntryDate,
      })
      .from(properties)
      .innerJoin(propertyOwnerships, eq(properties.id, propertyOwnerships.propertyId))
      .where(and(
        eq(propertyOwnerships.entityId, entityId),
        eq(properties.orgId, orgId)
      ))
      .orderBy(asc(properties.name));

    // Calculate metrics using actual property values with auto-appreciation
    const totalProperties = propertiesResult.length;
    
    let totalValue = 0;
    let totalOwnershipValue = 0;
    
    const propertiesWithValues = propertiesResult.map(property => {
      let currentPropertyValue = 0;
      let hasCustomValue = false;
      
      // Only use properties with actual values set (no fallback defaults)
      if (property.propertyValue && Number(property.propertyValue) > 0) {
        currentPropertyValue = Number(property.propertyValue);
        hasCustomValue = true;
        
        // Apply auto-appreciation if enabled
        if (property.autoAppreciation && property.appreciationRate && property.valueEntryDate) {
          const entryDate = new Date(property.valueEntryDate);
          const currentDate = new Date();
          const yearsElapsed = Math.floor((currentDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24 * 365));
          
          if (yearsElapsed > 0) {
            const appreciationRate = Number(property.appreciationRate) / 100; // Convert percentage to decimal
            currentPropertyValue = currentPropertyValue * Math.pow(1 + appreciationRate, yearsElapsed);
          }
        }
        
        const ownershipPercent = Number(property.ownershipPercent);
        const ownershipValue = currentPropertyValue * (ownershipPercent / 100);
        
        totalValue += currentPropertyValue;
        totalOwnershipValue += ownershipValue;
      }
      
      return {
        ...property,
        currentValue: Math.round(currentPropertyValue),
        hasCustomValue,
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

  async getEntityPropertyCount(entityId: string, orgId: string): Promise<{ count: number; properties: Array<{id: string, name: string}> }> {
    // Get properties owned by this entity
    const propertiesResult = await db
      .select({
        id: properties.id,
        name: properties.name,
      })
      .from(properties)
      .innerJoin(propertyOwnerships, eq(properties.id, propertyOwnerships.propertyId))
      .where(and(
        eq(propertyOwnerships.entityId, entityId),
        eq(properties.orgId, orgId)
      ))
      .orderBy(asc(properties.name));

    return {
      count: propertiesResult.length,
      properties: propertiesResult
    };
  }

  async getTenantRelationshipCount(tenantId: string, orgId: string): Promise<{ 
    count: number; 
    relationships: Array<{type: string, description: string}>
  }> {
    const relationships: Array<{type: string, description: string}> = [];

    // Check for active leases through tenant group
    const tenant = await db
      .select({ groupId: tenants.groupId })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    
    if (tenant[0]?.groupId) {
      const leasesResult = await db
        .select({
          id: leases.id,
          rent: leases.rent,
          startDate: leases.startDate,
          endDate: leases.endDate,
          status: leases.status
        })
        .from(leases)
        .where(eq(leases.tenantGroupId, tenant[0].groupId));

      leasesResult.forEach(lease => {
        relationships.push({
          type: 'lease',
          description: `${lease.status} lease: $${lease.rent}/month (${lease.startDate?.toLocaleDateString()} - ${lease.endDate?.toLocaleDateString()})`
        });
      });
    }

    // Check for transactions related to the tenant (through tenant scope or description)
    const transactionsResult = await db
      .select({
        id: transactions.id,
        type: transactions.type,
        amount: transactions.amount,
        description: transactions.description,
        date: transactions.date
      })
      .from(transactions)
      .where(and(
        eq(transactions.orgId, orgId),
        // Check if transaction mentions this tenant ID in scope or description
        or(
          like(transactions.scope, `%${tenantId}%`),
          like(transactions.description, `%${tenantId}%`)
        )
      ));

    transactionsResult.forEach(transaction => {
      relationships.push({
        type: 'transaction',
        description: `${transaction.type}: $${transaction.amount} - ${transaction.description}`
      });
    });

    return {
      count: relationships.length,
      relationships: relationships
    };
  }

  async getPropertyPerformance(propertyId: string, orgId: string): Promise<any> {
    // Get the property
    const [property] = await db
      .select()
      .from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.orgId, orgId)));
    
    if (!property) {
      return null;
    }

    // Get ownership entities for this property
    const entitiesResult = await db
      .select({
        id: ownershipEntities.id,
        name: ownershipEntities.name,
        type: ownershipEntities.type,
        ownershipPercent: propertyOwnerships.percent,
      })
      .from(ownershipEntities)
      .innerJoin(propertyOwnerships, eq(ownershipEntities.id, propertyOwnerships.entityId))
      .where(and(
        eq(propertyOwnerships.propertyId, propertyId),
        eq(ownershipEntities.orgId, orgId)
      ))
      .orderBy(asc(ownershipEntities.name));

    // Get units for this property
    const unitsResult = await db
      .select({
        id: units.id,
        label: units.label,
        bedrooms: units.bedrooms,
        bathrooms: units.bathrooms,
        sqft: units.sqft,
        rentAmount: units.rentAmount,
      })
      .from(units)
      .where(eq(units.propertyId, propertyId))
      .orderBy(asc(units.label));

    // Calculate current property value with auto-appreciation
    let currentValue = 0;
    const estimatedValue = property.propertyValue ? Number(property.propertyValue) : 0;
    
    if (estimatedValue > 0) {
      currentValue = estimatedValue;
      
      // Apply auto-appreciation if enabled
      if (property.autoAppreciation && property.appreciationRate && property.valueEntryDate) {
        const entryDate = new Date(property.valueEntryDate);
        const currentDate = new Date();
        const yearsElapsed = Math.floor((currentDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24 * 365));
        
        if (yearsElapsed > 0) {
          const appreciationRate = Number(property.appreciationRate) / 100;
          currentValue = currentValue * Math.pow(1 + appreciationRate, yearsElapsed);
        }
      }
    }

    // Get actual revenue transactions for this property
    const currentDate = new Date();
    const currentMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const currentMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    // Get current month's revenue transactions with payment status
    const revenueTransactions = await db
      .select({
        amount: transactions.amount,
        date: transactions.date,
        paymentStatus: transactions.paymentStatus,
        isRecurring: transactions.isRecurring,
      })
      .from(transactions)
      .where(and(
        eq(transactions.orgId, orgId),
        eq(transactions.propertyId, propertyId),
        eq(transactions.type, "Income"),
        gte(transactions.date, currentMonthStart),
        lte(transactions.date, currentMonthEnd)
      ));

    // Calculate financial metrics
    const totalUnits = unitsResult.length;
    
    // Calculate expected monthly revenue from recurring revenue transactions
    const expectedMonthlyRevenue = revenueTransactions
      .filter(transaction => transaction.isRecurring)
      .reduce((sum, transaction) => {
        return sum + Number(transaction.amount);
      }, 0);
    
    // Calculate actual collected revenue (only Paid and Partial transactions)
    const actualMonthlyRevenue = revenueTransactions
      .filter(transaction => 
        transaction.paymentStatus === 'Paid' || 
        transaction.paymentStatus === 'Partial'
      )
      .reduce((sum, transaction) => {
        return sum + Number(transaction.amount);
      }, 0);
    
    // Calculate collection rate
    const collectionRate = expectedMonthlyRevenue > 0 
      ? Math.round((actualMonthlyRevenue / expectedMonthlyRevenue) * 100)
      : 0;

    // For backwards compatibility, use actual if available, otherwise expected
    const monthlyRevenue = actualMonthlyRevenue > 0 ? actualMonthlyRevenue : expectedMonthlyRevenue;
    
    // Simplified expense calculation (could be enhanced with actual expense data)
    const monthlyExpenses = Math.round(currentValue * 0.02 / 12); // 2% of property value annually
    const netCashFlow = monthlyRevenue - monthlyExpenses;
    const appreciationGain = currentValue - estimatedValue;

    return {
      property,
      entities: entitiesResult,
      units: unitsResult,
      metrics: {
        totalUnits,
        estimatedValue: Math.round(estimatedValue),
        currentValue: Math.round(currentValue),
        monthlyRevenue: Math.round(monthlyRevenue),
        expectedMonthlyRevenue: Math.round(expectedMonthlyRevenue),
        actualMonthlyRevenue: Math.round(actualMonthlyRevenue),
        collectionRate,
        monthlyExpenses,
        netCashFlow: Math.round(netCashFlow),
        appreciationGain: Math.round(appreciationGain),
        totalOwners: entitiesResult.length,
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
        // Property value fields
        propertyValue: properties.propertyValue,
        autoAppreciation: properties.autoAppreciation,
        appreciationRate: properties.appreciationRate,
        valueEntryDate: properties.valueEntryDate,
        // Mortgage fields
        monthlyMortgage: properties.monthlyMortgage,
        interestRate: properties.interestRate,
        mortgageStartDate: properties.mortgageStartDate,
        monthlyMortgage2: properties.monthlyMortgage2,
        interestRate2: properties.interestRate2,
        mortgageStartDate2: properties.mortgageStartDate2,
        purchasePrice: properties.purchasePrice,
        downPayment: properties.downPayment,
        acquisitionDate: properties.acquisitionDate,
        saleDate: properties.saleDate,
        salePrice: properties.salePrice,
        status: properties.status,
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
          // Property value fields - ensure proper mapping
          propertyValue: row.propertyValue ? Number(row.propertyValue) : undefined,
          autoAppreciation: row.autoAppreciation || false,
          appreciationRate: row.appreciationRate ? Number(row.appreciationRate) : undefined,
          valueEntryDate: row.valueEntryDate,
          // Mortgage fields - these were missing from the properties list!
          monthlyMortgage: row.monthlyMortgage ? Number(row.monthlyMortgage) : undefined,
          interestRate: row.interestRate ? Number(row.interestRate) : undefined,
          mortgageStartDate: row.mortgageStartDate,
          monthlyMortgage2: row.monthlyMortgage2 ? Number(row.monthlyMortgage2) : undefined,
          interestRate2: row.interestRate2 ? Number(row.interestRate2) : undefined,
          mortgageStartDate2: row.mortgageStartDate2,
          purchasePrice: row.purchasePrice ? Number(row.purchasePrice) : undefined,
          downPayment: row.downPayment ? Number(row.downPayment) : undefined,
          acquisitionDate: row.acquisitionDate,
          saleDate: row.saleDate,
          salePrice: row.salePrice ? Number(row.salePrice) : undefined,
          status: row.status || "Active", // Add status field for archive functionality
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
    // Set valueEntryDate automatically if property value is provided
    const propertyData = { ...property };
    if (propertyData.propertyValue && Number(propertyData.propertyValue) > 0 && !propertyData.valueEntryDate) {
      propertyData.valueEntryDate = new Date();
    }
    
    const [newProperty] = await db.insert(properties).values(propertyData).returning();
    
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
        bathrooms: defaultUnit.bathrooms,
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

  // Create property with multiple units (for buildings)
  async createPropertyWithOwnershipsAndUnits(
    property: InsertProperty, 
    ownerships: Array<{entityId: string, percent: number}>,
    units: any[]
  ): Promise<{property: Property, units: Unit[]}> {
    // First create the property with ownerships
    const newProperty = await this.createPropertyWithOwnerships(property, ownerships);
    
    const createdUnits: Unit[] = [];
    
    // Create each unit
    for (const unitData of units) {
      const unitInsertData: InsertUnit = {
        propertyId: newProperty.id,
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
      
      const newUnit = await this.createUnit(unitInsertData);
      createdUnits.push(newUnit);
      
      // Handle custom appliances for this unit
      if (unitData.appliances && unitData.appliances.length > 0) {
        for (const appliance of unitData.appliances) {
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
    
    return { property: newProperty, units: createdUnits };
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
    // Get current property to check if value is being set for the first time
    const [currentProperty] = await db
      .select({ propertyValue: properties.propertyValue, valueEntryDate: properties.valueEntryDate })
      .from(properties)
      .where(eq(properties.id, id));
    
    // Set valueEntryDate automatically if property value is being set for the first time
    const propertyData = { ...property };
    if (propertyData.propertyValue && Number(propertyData.propertyValue) > 0) {
      // Only set valueEntryDate if it's not already set or if the current property doesn't have a value
      if (!currentProperty?.valueEntryDate || !currentProperty?.propertyValue || Number(currentProperty.propertyValue) <= 0) {
        propertyData.valueEntryDate = new Date();
      }
    }
    
    // Update the property
    const [updated] = await db
      .update(properties)
      .set(propertyData)
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
    // CASCADE DELETE: Clean up all related data to prevent FK violations
    
    // 1. Delete property ownerships
    await db.delete(propertyOwnerships).where(eq(propertyOwnerships.propertyId, id));
    
    // 2. Get units for this property and delete them with their dependencies
    const propertyUnits = await db.select({ id: units.id }).from(units).where(eq(units.propertyId, id));
    
    for (const unit of propertyUnits) {
      // Delete unit appliances
      await db.delete(unitAppliances).where(eq(unitAppliances.unitId, unit.id));
      
      // Delete leases for this unit
      await db.delete(leases).where(eq(leases.unitId, unit.id));
    }
    
    // 3. Delete all units for this property
    await db.delete(units).where(eq(units.propertyId, id));
    
    // 4. Delete transactions related to this property
    await db.delete(transactions).where(eq(transactions.propertyId, id));
    
    // 5. Delete reminders scoped to this property
    await db.delete(reminders).where(and(eq(reminders.scope, "property"), eq(reminders.scopeId, id)));
    
    // 6. Delete assets related to this property
    await db.delete(assets).where(eq(assets.propertyId, id));
    
    // 7. Finally delete the property itself
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
    const insertData = {
      ...unit,
      bathrooms: typeof unit.bathrooms === 'number' ? String(unit.bathrooms) : unit.bathrooms,
    };
    const [newUnit] = await db.insert(units).values(insertData).returning();
    return newUnit;
  }

  async updateUnit(id: string, unit: Partial<InsertUnit>): Promise<Unit> {
    const updateData = {
      ...unit,
      bathrooms: typeof unit.bathrooms === 'number' ? String(unit.bathrooms) : unit.bathrooms,
    };
    const [updated] = await db
      .update(units)
      .set(updateData)
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

  async updateTenantGroup(id: string, updates: Partial<InsertTenantGroup>): Promise<TenantGroup> {
    const [updated] = await db
      .update(tenantGroups)
      .set(updates)
      .where(eq(tenantGroups.id, id))
      .returning();
    return updated;
  }

  async updateTenant(id: string, updates: Partial<InsertTenant>): Promise<Tenant> {
    const [updated] = await db
      .update(tenants)
      .set(updates)
      .where(eq(tenants.id, id))
      .returning();
    return updated;
  }

  async archiveTenantGroup(id: string): Promise<TenantGroup> {
    // Archive the tenant group
    const [updated] = await db
      .update(tenantGroups)
      .set({ status: "Archived" })
      .where(eq(tenantGroups.id, id))
      .returning();
    
    // Automatically terminate associated leases
    await this.terminateLeasesByTenantGroup(id);
    
    return updated;
  }

  async deleteTenant(id: string): Promise<void> {
    await db.delete(tenants).where(eq(tenants.id, id));
  }

  async deleteTenantGroup(id: string): Promise<void> {
    // First delete all tenants in the group
    await db.delete(tenants).where(eq(tenants.groupId, id));
    // Then delete the group itself
    await db.delete(tenantGroups).where(eq(tenantGroups.id, id));
  }

  async getTenantsInGroup(groupId: string): Promise<Tenant[]> {
    return await db
      .select()
      .from(tenants)
      .where(eq(tenants.groupId, groupId));
  }

  async archiveTenant(id: string): Promise<Tenant> {
    // Archive the individual tenant
    const [updated] = await db
      .update(tenants)
      .set({ status: "Archived" })
      .where(eq(tenants.id, id))
      .returning();
    
    // Check if all tenants in the group are now archived (only if groupId exists)
    if (updated.groupId) {
      const allTenantsInGroup = await this.getTenantsInGroup(updated.groupId);
      const allArchived = allTenantsInGroup.every(tenant => tenant.status === "Archived");
      
      // If all tenants in the group are archived, terminate the leases
      if (allArchived) {
        await this.terminateLeasesByTenantGroup(updated.groupId);
      }
    }
    
    return updated;
  }

  async unarchiveTenant(id: string): Promise<Tenant> {
    // Unarchive the individual tenant
    const [updated] = await db
      .update(tenants)
      .set({ status: "Active" })
      .where(eq(tenants.id, id))
      .returning();
    
    // Note: We don't automatically reactivate leases when unarchiving tenants
    // This is intentional - reactivating leases requires more complex logic
    // and business rules that should be handled manually or through a separate workflow
    
    return updated;
  }

  // Add unarchive function for tenant groups  
  async unarchiveTenantGroup(id: string): Promise<TenantGroup> {
    // Unarchive the tenant group
    const [updated] = await db
      .update(tenantGroups)
      .set({ status: "Active" })
      .where(eq(tenantGroups.id, id))
      .returning();
    
    // Note: We don't automatically reactivate leases when unarchiving tenant groups
    // This is intentional - lease reactivation requires manual review of dates, rent, etc.
    
    return updated;
  }

  async permanentDeleteTenant(id: string): Promise<void> {
    await db.delete(tenants).where(eq(tenants.id, id));
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
        // New renewal and reminder fields
        autoRenewEnabled: leases.autoRenewEnabled,
        expirationReminderMonths: leases.expirationReminderMonths,
        renewalReminderEnabled: leases.renewalReminderEnabled,
      })
      .from(leases)
      .leftJoin(units, eq(leases.unitId, units.id))
      .leftJoin(properties, eq(units.propertyId, properties.id))
      .where(eq(properties.orgId, orgId))
      .orderBy(desc(leases.startDate));
    return result;
  }

  async getLease(id: string): Promise<Lease | undefined> {
    const [lease] = await db.select().from(leases).where(eq(leases.id, id));
    return lease;
  }

  async getLeasesByTenantGroup(tenantGroupId: string): Promise<Lease[]> {
    return await db
      .select()
      .from(leases)
      .where(eq(leases.tenantGroupId, tenantGroupId))
      .orderBy(desc(leases.startDate));
  }

  // Helper function to cancel recurring rent revenue for a specific lease
  async cancelLeaseRecurringRevenue(leaseId: string): Promise<void> {
    try {
      // Get the lease details to identify related transactions
      const lease = await this.getLease(leaseId);
      if (!lease) {
        console.warn(`⚠️ Lease ${leaseId} not found when trying to cancel recurring revenue`);
        return;
      }

      // Find recurring rent transactions for this lease (by unitId and type)
      // Rent revenue transactions are created with:
      // - type: "Income", category: "Rental Income", unitId: lease.unitId
      // - isRecurring: true, notes containing lease ID
      const recurringRentTransactions = await db
        .select()
        .from(transactions)
        .where(and(
          eq(transactions.unitId, lease.unitId),
          eq(transactions.type, "Income"),
          eq(transactions.category, "Rental Income"),
          eq(transactions.isRecurring, true),
          like(transactions.notes, `%lease ${leaseId}%`)
        ));

      if (recurringRentTransactions.length === 0) {
        console.log(`📊 No recurring rent revenue found for lease ${leaseId}`);
        return;
      }

      const currentDate = new Date();
      let canceledCount = 0;

      for (const transaction of recurringRentTransactions) {
        // End the recurring transaction by setting recurringEndDate to yesterday
        // This prevents future instances from being generated
        const endDate = new Date(currentDate.getTime() - 24 * 60 * 60 * 1000);
        
        await db
          .update(transactions)
          .set({ 
            recurringEndDate: endDate,
            notes: `${transaction.notes || ""} [TERMINATED: Lease ended on ${currentDate.toDateString()}]`
          })
          .where(eq(transactions.id, transaction.id));

        // Cancel future pending rent payments (transactions with dates >= today)
        await db
          .delete(transactions)
          .where(and(
            eq(transactions.parentRecurringId, transaction.id),
            gte(transactions.date, currentDate),
            eq(transactions.paymentStatus, "Unpaid")
          ));

        canceledCount++;
        console.log(`💰 Canceled recurring rent revenue for lease ${leaseId}: $${transaction.amount}/month`);
      }

      console.log(`✅ Successfully canceled ${canceledCount} recurring rent revenue stream(s) for lease ${leaseId}`);
      
    } catch (error) {
      console.error(`❌ Error canceling recurring revenue for lease ${leaseId}:`, error);
    }
  }

  // Helper function to cancel lease-related reminders
  async cancelLeaseReminders(leaseId: string): Promise<void> {
    try {
      // Find all reminders scoped to this lease
      const leaseReminders = await db
        .select()
        .from(reminders)
        .where(and(
          eq(reminders.scope, "lease"),
          eq(reminders.scopeId, leaseId),
          eq(reminders.status, "Pending") // Only cancel pending reminders
        ));

      if (leaseReminders.length === 0) {
        console.log(`🔔 No pending reminders found for lease ${leaseId}`);
        return;
      }

      // Cancel all pending lease reminders
      await db
        .update(reminders)
        .set({ 
          status: "Completed",
          completedAt: new Date()
        })
        .where(and(
          eq(reminders.scope, "lease"),
          eq(reminders.scopeId, leaseId),
          eq(reminders.status, "Pending")
        ));

      console.log(`✅ Canceled ${leaseReminders.length} pending reminder(s) for lease ${leaseId}`);
      
    } catch (error) {
      console.error(`❌ Error canceling reminders for lease ${leaseId}:`, error);
    }
  }

  // Terminate all leases associated with a tenant group with comprehensive financial cleanup
  async terminateLeasesByTenantGroup(tenantGroupId: string): Promise<void> {
    // Get all active leases for this tenant group
    const activeLeases = await db
      .select()
      .from(leases)
      .where(and(
        eq(leases.tenantGroupId, tenantGroupId),
        eq(leases.status, "Active")
      ));

    // Terminate each active lease with full financial cleanup
    if (activeLeases.length > 0) {
      console.log(`🏠 Automatically terminating ${activeLeases.length} lease(s) for archived tenant group ${tenantGroupId}`);
      
      const terminationDate = new Date();
      
      for (const lease of activeLeases) {
        console.log(`🔄 Processing lease termination: ${lease.id}`);
        
        // 1. Cancel recurring rent revenue
        await this.cancelLeaseRecurringRevenue(lease.id);
        
        // 2. Cancel lease reminders
        await this.cancelLeaseReminders(lease.id);
        
        // 3. Update lease status and set proper end date
        await db
          .update(leases)
          .set({ 
            status: "Terminated",
            // Set end date to current date if lease was supposed to run longer
            endDate: terminationDate < new Date(lease.endDate) ? terminationDate : new Date(lease.endDate)
          })
          .where(eq(leases.id, lease.id));
        
        console.log(`✅ Lease ${lease.id} fully terminated with financial cleanup`);
      }
      
      console.log(`🎯 Successfully terminated ${activeLeases.length} lease(s) with complete financial side-effects cleanup`);
    } else {
      console.log(`ℹ️ No active leases found for tenant group ${tenantGroupId}`);
    }
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

  async getTransactionById(id: string): Promise<Transaction | undefined> {
    const result = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);
    
    return result[0];
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

  async deleteTransaction(id: string): Promise<void> {
    // First delete any line items associated with this transaction
    await db.delete(transactionLineItems).where(eq(transactionLineItems.transactionId, id));
    
    // Then delete the transaction itself
    await db.delete(transactions).where(eq(transactions.id, id));
  }

  async deleteRecurringTransaction(id: string, mode: "future" | "all"): Promise<void> {
    // Get the transaction to determine its recurring relationship
    const transaction = await this.getTransactionById(id);
    if (!transaction) {
      throw new Error("Transaction not found");
    }

    // If this is not a recurring transaction, just delete it normally
    if (!transaction.isRecurring && !transaction.parentRecurringId) {
      await this.deleteTransaction(id);
      return;
    }

    const currentDate = new Date(transaction.date);

    if (transaction.isRecurring && !transaction.parentRecurringId) {
      // Case 1: This is the original recurring transaction (parent)
      if (mode === "all") {
        // Delete the parent and all children
        
        // First, delete line items for the parent
        await db.delete(transactionLineItems).where(eq(transactionLineItems.transactionId, id));
        
        // Delete line items for all child transactions
        const childTransactionIds = await db
          .select({ id: transactions.id })
          .from(transactions)
          .where(eq(transactions.parentRecurringId, id));
        
        if (childTransactionIds.length > 0) {
          await db.delete(transactionLineItems).where(
            or(...childTransactionIds.map(child => eq(transactionLineItems.transactionId, child.id)))
          );
        }
        
        // Delete all child transactions
        await db.delete(transactions).where(eq(transactions.parentRecurringId, id));
        
        // Delete the parent transaction itself
        await db.delete(transactions).where(eq(transactions.id, id));
      } else {
        // mode === "future": Delete the parent and all children from current date onwards
        
        // First, delete line items for the parent
        await db.delete(transactionLineItems).where(eq(transactionLineItems.transactionId, id));
        
        // Delete line items for future child transactions only
        const futureChildTransactionIds = await db
          .select({ id: transactions.id })
          .from(transactions)
          .where(and(
            eq(transactions.parentRecurringId, id),
            gte(transactions.date, currentDate)
          ));
        
        if (futureChildTransactionIds.length > 0) {
          await db.delete(transactionLineItems).where(
            or(...futureChildTransactionIds.map(child => eq(transactionLineItems.transactionId, child.id)))
          );
        }
        
        // Delete future child transactions only
        await db.delete(transactions).where(and(
          eq(transactions.parentRecurringId, id),
          gte(transactions.date, currentDate)
        ));
        
        // Delete the parent transaction itself
        await db.delete(transactions).where(eq(transactions.id, id));
      }
      
    } else if (transaction.parentRecurringId) {
      // Case 2: This is a child recurring transaction
      const parentRecurringId = transaction.parentRecurringId;
      
      if (mode === "all") {
        // Delete all instances (parent and all children)
        
        // Delete line items for parent
        await db.delete(transactionLineItems).where(eq(transactionLineItems.transactionId, parentRecurringId));
        
        // Delete line items for all child transactions
        const allChildTransactionIds = await db
          .select({ id: transactions.id })
          .from(transactions)
          .where(eq(transactions.parentRecurringId, parentRecurringId));
        
        if (allChildTransactionIds.length > 0) {
          await db.delete(transactionLineItems).where(
            or(...allChildTransactionIds.map(t => eq(transactionLineItems.transactionId, t.id)))
          );
        }
        
        // Delete all child transactions
        await db.delete(transactions).where(eq(transactions.parentRecurringId, parentRecurringId));
        
        // Delete the parent transaction
        await db.delete(transactions).where(eq(transactions.id, parentRecurringId));
      } else {
        // mode === "future": Delete this child and all future children, update parent's end date
        
        // Delete line items for this transaction and all future ones
        const futureTransactionIds = await db
          .select({ id: transactions.id })
          .from(transactions)
          .where(
            and(
              eq(transactions.parentRecurringId, parentRecurringId),
              gte(transactions.date, currentDate)
            )
          );
        
        if (futureTransactionIds.length > 0) {
          await db.delete(transactionLineItems).where(
            or(...futureTransactionIds.map(t => eq(transactionLineItems.transactionId, t.id)))
          );
        }
        
        // Delete this transaction and all future recurring instances
        await db.delete(transactions).where(
          and(
            eq(transactions.parentRecurringId, parentRecurringId),
            gte(transactions.date, currentDate)
          )
        );
        
        // Update the parent's recurring end date to the day before this transaction
        const previousDay = new Date(currentDate.getTime() - 24 * 60 * 60 * 1000);
        await db
          .update(transactions)
          .set({ 
            recurringEndDate: previousDay
          })
          .where(eq(transactions.id, parentRecurringId));
      }
    }
  }

  async updateRecurringTransaction(id: string, updateData: Partial<InsertTransaction>, mode: "future" | "all"): Promise<void> {
    // Get the transaction to determine its recurring relationship
    const transaction = await this.getTransactionById(id);
    if (!transaction) {
      throw new Error("Transaction not found");
    }

    // If this is not a recurring transaction, just update it normally
    if (!transaction.isRecurring && !transaction.parentRecurringId) {
      await this.updateTransaction(id, updateData);
      return;
    }

    const currentDate = new Date(transaction.date);

    if (transaction.isRecurring && !transaction.parentRecurringId) {
      // Case 1: This is the original recurring transaction (parent)
      if (mode === "all") {
        // Update the parent and all children
        await db
          .update(transactions)
          .set(updateData)
          .where(eq(transactions.id, id));
        
        await db
          .update(transactions)
          .set(updateData)
          .where(eq(transactions.parentRecurringId, id));
      } else {
        // mode === "future": Update the parent and all future children
        
        // Update the parent transaction
        await db
          .update(transactions)
          .set(updateData)
          .where(eq(transactions.id, id));
        
        // Update all future child transactions (from current date onwards)
        await db
          .update(transactions)
          .set(updateData)
          .where(
            and(
              eq(transactions.parentRecurringId, id),
              gte(transactions.date, currentDate)
            )
          );
      }
      
    } else if (transaction.parentRecurringId) {
      // Case 2: This is a child recurring transaction
      const parentRecurringId = transaction.parentRecurringId;
      
      if (mode === "all") {
        // Update the parent and all children
        await db
          .update(transactions)
          .set(updateData)
          .where(eq(transactions.id, parentRecurringId));
        
        await db
          .update(transactions)
          .set(updateData)
          .where(eq(transactions.parentRecurringId, parentRecurringId));
      } else {
        // mode === "future": Update this child and all future children
        
        // Update this transaction and all future recurring instances
        await db
          .update(transactions)
          .set(updateData)
          .where(
            and(
              eq(transactions.parentRecurringId, parentRecurringId),
              gte(transactions.date, currentDate)
            )
          );
      }
    }
  }

  async updateTransactionPaymentStatus(id: string, paymentStatus: string, paidAmount?: number): Promise<void> {
    const updateData: any = { paymentStatus };
    if (paidAmount !== undefined) {
      updateData.paidAmount = paidAmount;
    }
    
    await db
      .update(transactions)
      .set(updateData)
      .where(eq(transactions.id, id));
  }

  async createExpense(expense: InsertExpense): Promise<Transaction> {
    const [newExpense] = await db.insert(transactions).values({
      ...expense,
      recurringEndDate: expense.recurringEndDate ? (typeof expense.recurringEndDate === 'string' ? new Date(expense.recurringEndDate) : expense.recurringEndDate) : null,
    }).returning();
    
    // If this is a recurring expense, create future instances
    if (expense.isRecurring && expense.recurringFrequency) {
      await this.createRecurringTransactions(newExpense);
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

  async createRevenue(revenue: InsertTransaction): Promise<Transaction> {
    const [newRevenue] = await db.insert(transactions).values({
      ...revenue,
      recurringEndDate: revenue.recurringEndDate ? (typeof revenue.recurringEndDate === 'string' ? new Date(revenue.recurringEndDate) : revenue.recurringEndDate) : null,
    }).returning();
    
    // If this is a recurring revenue, create future instances
    if (revenue.isRecurring && revenue.recurringFrequency) {
      await this.createRecurringTransactions(newRevenue);
    }

    return newRevenue;
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

  private async createRecurringTransactions(originalTransaction: Transaction): Promise<void> {
    if (!originalTransaction.isRecurring || !originalTransaction.recurringFrequency) return;

    const frequency = originalTransaction.recurringFrequency;
    const interval = originalTransaction.recurringInterval || 1;
    const startDate = new Date(originalTransaction.date);
    const endDate = originalTransaction.recurringEndDate ? new Date(originalTransaction.recurringEndDate) : null;
    
    // Calculate how many instances to create (limit to 24 months for safety)
    const maxInstances = 24;
    let currentDate = new Date(startDate);
    const instances: Array<any> = [];

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

      // Generate clear month/year description for rent transactions  
      let instanceDescription = originalTransaction.description;
      if (originalTransaction.category === "Rental Income" && originalTransaction.description.includes(" Rent")) {
        const monthNames = ["January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"];
        const instanceMonth = monthNames[currentDate.getMonth()];
        const instanceYear = currentDate.getFullYear();
        instanceDescription = `${instanceMonth} ${instanceYear} Rent`;
      }

      instances.push({
        orgId: originalTransaction.orgId,
        propertyId: originalTransaction.propertyId || undefined,
        unitId: originalTransaction.unitId || undefined,
        entityId: originalTransaction.entityId || undefined,
        vendorId: originalTransaction.vendorId || undefined,
        type: originalTransaction.type, // Use the original transaction type (Expense or Income)
        scope: (originalTransaction.scope as "property" | "operational") || "property",
        amount: originalTransaction.amount,
        description: instanceDescription,
        category: originalTransaction.category || undefined,
        date: new Date(currentDate),
        receiptUrl: originalTransaction.receiptUrl || undefined,
        notes: originalTransaction.notes || undefined,
        isRecurring: false, // Future instances are not recurring themselves
        recurringFrequency: undefined,
        recurringInterval: 1,
        recurringEndDate: null,
        taxDeductible: originalTransaction.taxDeductible || true,
        parentRecurringId: originalTransaction.id,
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
    const [newReminder] = await db.insert(reminders).values({
      ...reminder,
      recurringEndDate: reminder.recurringEndDate ? (typeof reminder.recurringEndDate === 'string' ? new Date(reminder.recurringEndDate) : reminder.recurringEndDate) : null,
    }).returning();
    
    // If this is a recurring reminder, create future instances
    if (reminder.isRecurring && reminder.recurringFrequency) {
      await this.createRecurringReminders(newReminder);
    }
    
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

  async deleteReminder(id: string): Promise<void> {
    await db.delete(reminders).where(eq(reminders.id, id));
  }

  async deleteRecurringReminder(id: string, mode: "future" | "all"): Promise<void> {
    // Get the reminder to determine its recurring relationship
    const [reminder] = await db.select().from(reminders).where(eq(reminders.id, id));
    if (!reminder) {
      throw new Error("Reminder not found");
    }

    // If this is not a recurring reminder, just delete it normally
    if (!reminder.isRecurring && !reminder.parentRecurringId) {
      await this.deleteReminder(id);
      return;
    }

    const currentDate = new Date(reminder.dueAt);

    if (reminder.isRecurring && !reminder.parentRecurringId) {
      // Case 1: This is the original recurring reminder (parent)
      if (mode === "all") {
        // Delete the parent and all children
        await db.delete(reminders).where(eq(reminders.parentRecurringId, id));
        await db.delete(reminders).where(eq(reminders.id, id));
      } else {
        // mode === "future": Delete from current date onwards
        await db.delete(reminders).where(
          and(
            eq(reminders.parentRecurringId, id),
            gte(reminders.dueAt, currentDate)
          )
        );
        // Update the parent's recurring end date to the day before this reminder
        const previousDay = new Date(currentDate.getTime() - 24 * 60 * 60 * 1000);
        await db
          .update(reminders)
          .set({ recurringEndDate: previousDay })
          .where(eq(reminders.id, id));
      }
    } else if (reminder.parentRecurringId) {
      // Case 2: This is a child recurring reminder
      const parentRecurringId = reminder.parentRecurringId;
      
      if (mode === "all") {
        // Delete the entire series (parent and all children)
        await db.delete(reminders).where(eq(reminders.parentRecurringId, parentRecurringId));
        await db.delete(reminders).where(eq(reminders.id, parentRecurringId));
      } else {
        // mode === "future": Delete this reminder and all future recurring instances
        await db.delete(reminders).where(
          and(
            eq(reminders.parentRecurringId, parentRecurringId),
            gte(reminders.dueAt, currentDate)
          )
        );
        // Update the parent's recurring end date to the day before this reminder
        const previousDay = new Date(currentDate.getTime() - 24 * 60 * 60 * 1000);
        await db
          .update(reminders)
          .set({ recurringEndDate: previousDay })
          .where(eq(reminders.id, parentRecurringId));
      }
    }
  }

  async updateRecurringReminder(id: string, data: Partial<InsertReminder>, mode: "future" | "all"): Promise<Reminder> {
    // Get the reminder to determine its recurring relationship
    const [reminder] = await db.select().from(reminders).where(eq(reminders.id, id));
    if (!reminder) {
      throw new Error("Reminder not found");
    }

    // If this is not a recurring reminder, just update it normally
    if (!reminder.isRecurring && !reminder.parentRecurringId) {
      return await this.updateReminder(id, data);
    }

    const currentDate = new Date(reminder.dueAt);
    let updatedReminder: Reminder;

    if (reminder.isRecurring && !reminder.parentRecurringId) {
      // Case 1: This is the original recurring reminder (parent)
      if (mode === "all") {
        // Update the parent and all children
        const [updated] = await db
          .update(reminders)
          .set(data)
          .where(eq(reminders.id, id))
          .returning();
        updatedReminder = updated;
        
        await db
          .update(reminders)
          .set(data)
          .where(eq(reminders.parentRecurringId, id));
      } else {
        // mode === "future": Update the parent and all future children
        const [updated] = await db
          .update(reminders)
          .set(data)
          .where(eq(reminders.id, id))
          .returning();
        updatedReminder = updated;
        
        await db
          .update(reminders)
          .set(data)
          .where(
            and(
              eq(reminders.parentRecurringId, id),
              gte(reminders.dueAt, currentDate)
            )
          );
      }
    } else if (reminder.parentRecurringId) {
      // Case 2: This is a child recurring reminder
      const parentRecurringId = reminder.parentRecurringId;
      
      if (mode === "all") {
        // Update the entire series (parent and all children)
        await db
          .update(reminders)
          .set(data)
          .where(eq(reminders.id, parentRecurringId));
          
        const [updated] = await db
          .update(reminders)
          .set(data)
          .where(eq(reminders.parentRecurringId, parentRecurringId))
          .returning();
        updatedReminder = Array.isArray(updated) && updated.length > 0 ? updated[0] : reminder;
      } else {
        // mode === "future": Update this reminder and all future recurring instances
        const [updated] = await db
          .update(reminders)
          .set(data)
          .where(
            and(
              eq(reminders.parentRecurringId, parentRecurringId),
              gte(reminders.dueAt, currentDate)
            )
          )
          .returning();
        updatedReminder = Array.isArray(updated) && updated.length > 0 ? updated[0] : reminder;
      }
    } else {
      updatedReminder = reminder;
    }

    return updatedReminder;
  }

  private async createRecurringReminders(originalReminder: Reminder): Promise<void> {
    if (!originalReminder.isRecurring || !originalReminder.recurringFrequency) return;

    const frequency = originalReminder.recurringFrequency;
    const interval = originalReminder.recurringInterval || 1;
    const startDate = new Date(originalReminder.dueAt);
    const endDate = originalReminder.recurringEndDate ? new Date(originalReminder.recurringEndDate) : null;
    
    // Calculate how many instances to create (limit to 24 months for safety)
    const maxInstances = 24;
    let currentDate = new Date(startDate);
    const instances: Array<any> = [];

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
        orgId: originalReminder.orgId,
        scope: originalReminder.scope,
        scopeId: originalReminder.scopeId || undefined,
        entityId: originalReminder.entityId || undefined,
        title: originalReminder.title,
        type: originalReminder.type,
        dueAt: new Date(currentDate),
        leadDays: originalReminder.leadDays || 0,
        channels: originalReminder.channels || ["inapp"],
        payloadJson: originalReminder.payloadJson || undefined,
        status: "Pending" as const,
        isRecurring: false, // Future instances are not recurring themselves
        recurringFrequency: undefined,
        recurringInterval: 1,
        recurringEndDate: null,
        parentRecurringId: originalReminder.id,
        isBulkEntry: false,
      });
    }

    // Insert all future instances
    if (instances.length > 0) {
      await db.insert(reminders).values(instances);
    }
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
              isRecurring: false,
              recurringInterval: 1,
              isBulkEntry: false,
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

  // Generate missing recurring transactions
  async generateRecurringTransactions(): Promise<void> {
    console.log("Generating missing recurring transactions...");
    
    // Find ALL recurring transactions (both Income and Expense)
    const recurringTransactions = await db
      .select()
      .from(transactions)
      .where(eq(transactions.isRecurring, true));

    console.log(`Found ${recurringTransactions.length} recurring transactions to process`);

    for (const recurringTransaction of recurringTransactions) {
      try {
        console.log(`Processing recurring ${recurringTransaction.type}: ${recurringTransaction.description} (${recurringTransaction.category})`);
        await this.generateMissingTransactionsForRecurring(recurringTransaction);
      } catch (error) {
        console.error(`Error generating recurring transactions for ${recurringTransaction.id}:`, error);
      }
    }
  }

  private async generateMissingTransactionsForRecurring(recurringTransaction: any): Promise<void> {
    const startDate = new Date(recurringTransaction.date);
    const now = new Date();
    const frequency = recurringTransaction.recurringFrequency;
    const interval = recurringTransaction.recurringInterval || 1;
    
    console.log(`  → Transaction: ${recurringTransaction.description}, Frequency: ${frequency}, Interval: ${interval}`);
    
    // Validate frequency to prevent infinite loops
    const validFrequencies = ["monthly", "quarterly", "annually", "weeks", "days", "months"];
    if (!validFrequencies.includes(frequency)) {
      console.log(`  → Skipping transaction with invalid frequency: ${frequency}`);
      return;
    }
    
    // Get end date if specified, otherwise use current date + 2 years max
    const maxEndDate = new Date(now);
    maxEndDate.setFullYear(maxEndDate.getFullYear() + 2); // Safety limit: 2 years max
    
    const endDate = recurringTransaction.recurringEndDate 
      ? new Date(recurringTransaction.recurringEndDate)
      : maxEndDate;

    // Generate expected transactions with safety limit
    const expectedDates: Date[] = [];
    let currentDate = new Date(startDate);
    let iterations = 0;
    const MAX_ITERATIONS = 100; // Safety limit to prevent infinite loops
    
    while (currentDate <= endDate && currentDate <= now && iterations < MAX_ITERATIONS) {
      expectedDates.push(new Date(currentDate));
      iterations++;
      
      const previousDate = new Date(currentDate);
      
      // Calculate next occurrence based on frequency
      if (frequency === "monthly" || frequency === "months") {
        currentDate.setMonth(currentDate.getMonth() + interval);
      } else if (frequency === "quarterly") {
        currentDate.setMonth(currentDate.getMonth() + (3 * interval));
      } else if (frequency === "annually") {
        currentDate.setFullYear(currentDate.getFullYear() + interval);
      } else if (frequency === "weeks") {
        currentDate.setDate(currentDate.getDate() + (7 * interval));
      } else if (frequency === "days") {
        currentDate.setDate(currentDate.getDate() + interval);
      }
      
      // Safety check: ensure date actually advanced
      if (currentDate.getTime() <= previousDate.getTime()) {
        console.error(`  → Date not advancing! Breaking loop to prevent infinite generation.`);
        break;
      }
    }
    
    if (iterations >= MAX_ITERATIONS) {
      console.warn(`  → Hit safety limit of ${MAX_ITERATIONS} iterations for ${recurringTransaction.description}`);
    }
    
    console.log(`  → Generated ${expectedDates.length} expected dates for processing`);

    // Check which transactions already exist
    const existingTransactions = await db
      .select({ date: transactions.date })
      .from(transactions)
      .where(
        and(
          eq(transactions.orgId, recurringTransaction.orgId),
          eq(transactions.propertyId, recurringTransaction.propertyId),
          eq(transactions.type, recurringTransaction.type), // Use actual type (Income or Expense)
          eq(transactions.category, recurringTransaction.category),
          eq(transactions.amount, recurringTransaction.amount),
          or(
            eq(transactions.parentRecurringId, recurringTransaction.id),
            eq(transactions.id, recurringTransaction.id) // Include the original transaction
          )
        )
      );

    const existingDateStrings = existingTransactions.map(t => 
      t.date.toISOString().split('T')[0]
    );

    // Create missing transactions
    for (const expectedDate of expectedDates) {
      const expectedDateString = expectedDate.toISOString().split('T')[0];
      
      if (!existingDateStrings.includes(expectedDateString)) {
        // Create missing transaction with appropriate defaults
        const isExpense = recurringTransaction.type === "Expense";
        
        await db.insert(transactions).values({
          orgId: recurringTransaction.orgId,
          propertyId: recurringTransaction.propertyId,
          unitId: recurringTransaction.unitId,
          entityId: recurringTransaction.entityId,
          type: recurringTransaction.type, // Use actual type (Income or Expense)
          scope: recurringTransaction.scope,
          amount: recurringTransaction.amount,
          description: `${recurringTransaction.description} (Auto-generated)`,
          category: recurringTransaction.category,
          date: expectedDate,
          notes: `Auto-generated from recurring ${recurringTransaction.type.toLowerCase()} rule`,
          taxDeductible: recurringTransaction.taxDeductible,
          parentRecurringId: recurringTransaction.id,
          paymentStatus: isExpense ? "Unpaid" : "Paid", // Expenses default to Unpaid, Income to Paid
        });

        console.log(`Generated missing ${recurringTransaction.type} for ${expectedDate.toISOString().split('T')[0]}: ${recurringTransaction.description}`);
      }
    }
  }
}

export const storage = new DatabaseStorage();
