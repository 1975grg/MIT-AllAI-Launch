import { z } from "zod";
import { addDays, format, isAfter, isBefore, isWeekend, startOfDay } from "date-fns";
import type { DatabaseStorage } from "./storage.js";

// ========================================
// PHASE 3: AI SCHEDULING ORCHESTRATOR
// ========================================

/**
 * Intelligent scheduling system that optimizes contractor appointments
 * using AI-powered availability matching and constraint satisfaction
 */

// Scheduling request validation schema
const SchedulingRequest = z.object({
  caseId: z.string(),
  contractorId: z.string().optional(), // If not provided, AI will recommend best contractor
  urgency: z.enum(['Low', 'Medium', 'High', 'Critical']),
  estimatedDuration: z.string(), // "2-4 hours", "4-6 hours", etc.
  requiresTenantAccess: z.boolean().default(false),
  preferredTimeSlots: z.array(z.object({
    start: z.string(), // ISO string
    end: z.string()    // ISO string
  })).optional(),
  mustCompleteBy: z.string().optional(), // ISO string deadline
  specialRequirements: z.array(z.string()).optional() // ["ladder", "special_tools", etc.]
});

type SchedulingRequestType = z.infer<typeof SchedulingRequest>;

// Scheduling result with AI reasoning
interface SchedulingResult {
  success: boolean;
  recommendations: AppointmentRecommendation[];
  reasoning: string;
  totalOptions: number;
  analysisCompletedAt: string;
  optimizationScore: number; // 0.0-1.0 how optimal the scheduling is
}

interface AppointmentRecommendation {
  contractorId: string;
  contractorName: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  confidence: number; // 0.0-1.0
  reasoning: string;
  priority: 'primary' | 'alternative';
  estimatedCost?: number;
  travelTime?: string;
  workload: 'light' | 'moderate' | 'heavy'; // Contractor's current workload
  approvalRequired: boolean;
  approvalDeadline?: string; // When tenant approval is needed by
}

interface ContractorAvailabilitySlot {
  contractorId: string;
  contractorName: string;
  startTime: Date;
  endTime: Date;
  isAvailable: boolean;
  conflictingAppointments: number;
  workloadScore: number; // 0.0-1.0, higher = more loaded
  responseTimeHours: number;
  hourlyRate?: number;
}

export class AISchedulingOrchestrator {
  constructor(private storage: DatabaseStorage) {}

  /**
   * Main orchestration method - finds optimal scheduling solutions
   */
  async scheduleAppointment(request: SchedulingRequestType): Promise<SchedulingResult> {
    try {
      const validatedRequest = SchedulingRequest.parse(request);
      console.log(`🤖 AI Scheduling: Processing request for case ${validatedRequest.caseId}`);

      // 1. Get case details and AI analysis
      const caseDetails = await this.storage.getSmartCase(validatedRequest.caseId);
      if (!caseDetails) {
        throw new Error("Case not found");
      }

      // 2. Find suitable contractors (or use specified one)
      const contractors = validatedRequest.contractorId
        ? [await this.storage.getVendor(validatedRequest.contractorId)]
        : await this.findSuitableContractors(caseDetails, validatedRequest);

      const validContractors = contractors.filter(c => c !== null);
      if (validContractors.length === 0) {
        return {
          success: false,
          recommendations: [],
          reasoning: "No suitable contractors found for this maintenance request",
          totalOptions: 0,
          analysisCompletedAt: new Date().toISOString(),
          optimizationScore: 0.0
        };
      }

      // 3. Get availability windows for all contractors
      const availabilityWindows = await this.getAvailabilityWindows(
        validContractors.map(c => c!.id),
        validatedRequest
      );

      // 4. AI-powered optimization and ranking
      const recommendations = await this.optimizeScheduling(
        availabilityWindows,
        caseDetails,
        validatedRequest
      );

      // 5. Calculate optimization score
      const optimizationScore = this.calculateOptimizationScore(recommendations, validatedRequest);

      console.log(`✅ AI Scheduling: Generated ${recommendations.length} recommendations`);

      return {
        success: recommendations.length > 0,
        recommendations: recommendations.slice(0, 5), // Top 5 recommendations
        reasoning: this.generateSchedulingReasoning(recommendations, validatedRequest),
        totalOptions: availabilityWindows.length,
        analysisCompletedAt: new Date().toISOString(),
        optimizationScore
      };

    } catch (error) {
      console.error("🚨 AI Scheduling Error:", error);
      return {
        success: false,
        recommendations: [],
        reasoning: "Scheduling optimization failed - please try manual scheduling",
        totalOptions: 0,
        analysisCompletedAt: new Date().toISOString(),
        optimizationScore: 0.0
      };
    }
  }

  /**
   * Find contractors suitable for the maintenance case
   */
  private async findSuitableContractors(caseDetails: any, request: SchedulingRequestType) {
    const allContractors = await this.storage.getVendors(caseDetails.orgId);
    
    // Filter by category/specialty matching
    const category = caseDetails.category || caseDetails.aiCategory;
    const suitable = allContractors.filter(contractor => {
      // Must be active
      if (!contractor.isActiveContractor) return false;
      
      // Category matching
      if (category && contractor.category) {
        const categoryMatch = contractor.category.toLowerCase().includes(category.toLowerCase()) ||
                            category.toLowerCase().includes(contractor.category.toLowerCase());
        if (!categoryMatch) return false;
      }

      // Emergency availability for critical cases
      if (request.urgency === 'Critical' && !contractor.emergencyAvailable) {
        return false;
      }

      return true;
    });

    // Sort by preference and rating
    return suitable
      .sort((a, b) => {
        // Preferred contractors first
        if (a.isPreferred !== b.isPreferred) {
          return b.isPreferred ? 1 : -1;
        }
        // Then by rating
        return (b.rating || 0) - (a.rating || 0);
      })
      .slice(0, 10); // Top 10 contractors max
  }

  /**
   * Get available time slots for contractors in the coming weeks
   */
  private async getAvailabilityWindows(
    contractorIds: string[],
    request: SchedulingRequestType
  ): Promise<ContractorAvailabilitySlot[]> {
    const windows: ContractorAvailabilitySlot[] = [];
    
    // Check availability for next 2 weeks (or until deadline)
    const endDate = request.mustCompleteBy 
      ? new Date(request.mustCompleteBy)
      : addDays(new Date(), 14);

    for (const contractorId of contractorIds) {
      const contractor = await this.storage.getVendor(contractorId);
      if (!contractor) continue;

      // Get contractor's regular availability pattern
      const availability = await this.storage.getContractorAvailability(contractorId);
      
      // Get existing appointments and blackouts
      const existingAppointments = await this.storage.getContractorAppointments(contractorId, new Date(), endDate);
      const blackouts = await this.storage.getContractorBlackouts(contractorId);

      // Generate time slots for each day
      for (let date = new Date(); date <= endDate; date = addDays(date, 1)) {
        const daySlots = this.generateDaySlots(
          date,
          contractor,
          availability,
          existingAppointments,
          blackouts,
          request
        );
        windows.push(...daySlots);
      }
    }

    return windows.filter(slot => slot.isAvailable);
  }

  /**
   * Generate availability slots for a specific day
   */
  private generateDaySlots(
    date: Date,
    contractor: any,
    availability: any[],
    appointments: any[],
    blackouts: any[],
    request: SchedulingRequestType
  ): ContractorAvailabilitySlot[] {
    const slots: ContractorAvailabilitySlot[] = [];
    const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, etc.

    // Check if contractor is available this day of week
    const dayAvailability = availability.find(a => a.dayOfWeek === dayOfWeek && a.isActive);
    if (!dayAvailability) return slots;

    // Check for blackouts
    const isBlackedOut = blackouts.some(blackout => {
      const startDate = new Date(blackout.startDate);
      const endDate = new Date(blackout.endDate);
      return date >= startOfDay(startDate) && date <= startOfDay(endDate);
    });
    
    if (isBlackedOut) return slots;

    // Parse availability times with minute precision
    const [startHour, startMinute] = dayAvailability.startTime.split(':').map(Number);
    const [endHour, endMinute] = dayAvailability.endTime.split(':').map(Number);

    // Parse duration estimate (e.g., "2-4 hours" -> 3 hours average)
    const estimatedHours = this.parseDurationEstimate(request.estimatedDuration);
    const estimatedMinutes = estimatedHours * 60;
    const bufferMinutes = 15; // 15-minute buffer between appointments

    // Generate 30-minute slots within availability window
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    const slotInterval = 30; // 30-minute intervals

    for (let minute = startMinutes; minute <= endMinutes - estimatedMinutes - bufferMinutes; minute += slotInterval) {
      const slotStart = new Date(date);
      slotStart.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
      
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + estimatedMinutes);

      // Check for conflicts with existing appointments
      const conflicts = appointments.filter(apt => {
        const aptStart = new Date(apt.scheduledStartAt);
        const aptEnd = new Date(apt.scheduledEndAt);
        return (slotStart < aptEnd && slotEnd > aptStart);
      }).length;

      // Calculate workload for this day
      const dailyAppointments = appointments.filter(apt => {
        const aptDate = new Date(apt.scheduledStartAt);
        return aptDate.toDateString() === date.toDateString();
      }).length;

      const workloadScore = Math.min(dailyAppointments / (contractor.maxJobsPerDay || 3), 1.0);

      slots.push({
        contractorId: contractor.id,
        contractorName: contractor.name,
        startTime: slotStart,
        endTime: slotEnd,
        isAvailable: conflicts === 0 && dailyAppointments < (contractor.maxJobsPerDay || 3),
        conflictingAppointments: conflicts,
        workloadScore,
        responseTimeHours: contractor.responseTimeHours || 24,
        hourlyRate: contractor.estimatedHourlyRate || undefined
      });
    }

    return slots;
  }

  /**
   * AI-powered optimization and ranking of scheduling options
   */
  private async optimizeScheduling(
    availableSlots: ContractorAvailabilitySlot[],
    caseDetails: any,
    request: SchedulingRequestType
  ): Promise<AppointmentRecommendation[]> {
    const recommendations: AppointmentRecommendation[] = [];

    for (const slot of availableSlots) {
      if (!slot.isAvailable) continue;

      // Calculate confidence score based on multiple factors
      let confidence = 1.0;

      // Factor 1: Urgency matching
      if (request.urgency === 'Critical') {
        // Prefer immediate availability (within 4 hours)
        const hoursUntilSlot = (slot.startTime.getTime() - new Date().getTime()) / (1000 * 60 * 60);
        confidence *= hoursUntilSlot <= 4 ? 1.0 : Math.max(0.3, 1 - (hoursUntilSlot - 4) / 24);
      } else if (request.urgency === 'High') {
        // Prefer within 24 hours
        const hoursUntilSlot = (slot.startTime.getTime() - new Date().getTime()) / (1000 * 60 * 60);
        confidence *= hoursUntilSlot <= 24 ? 1.0 : Math.max(0.5, 1 - (hoursUntilSlot - 24) / 48);
      }

      // Factor 2: Workload optimization (prefer less loaded contractors)
      confidence *= 1.0 - (slot.workloadScore * 0.3);

      // Factor 3: Response time
      confidence *= Math.max(0.3, 1.0 - (slot.responseTimeHours - 1) / 48);

      // Factor 3.5: Travel time penalty (default 15 minutes between jobs)
      const defaultTravelMinutes = 15;
      if (slot.conflictingAppointments === 0) {
        confidence *= 1.1; // Bonus for no conflicts
      } else {
        confidence *= Math.max(0.7, 1.0 - (slot.conflictingAppointments * 0.1));
      }

      // Factor 4: Preferred time slots
      if (request.preferredTimeSlots) {
        const matchesPreferred = request.preferredTimeSlots.some(preferred => {
          const prefStart = new Date(preferred.start);
          const prefEnd = new Date(preferred.end);
          return slot.startTime >= prefStart && slot.endTime <= prefEnd;
        });
        if (matchesPreferred) confidence *= 1.2;
      }

      // Factor 5: Business hours preference (9 AM - 5 PM gets bonus)
      const slotHour = slot.startTime.getHours();
      if (slotHour >= 9 && slotHour <= 17) {
        confidence = confidence * 1.1;
      }

      const recommendation: AppointmentRecommendation = {
        contractorId: slot.contractorId,
        contractorName: slot.contractorName,
        scheduledStartAt: slot.startTime.toISOString(),
        scheduledEndAt: slot.endTime.toISOString(),
        confidence: Math.min(confidence, 1.0),
        reasoning: this.generateRecommendationReasoning(slot, request, confidence),
        priority: recommendations.length === 0 ? 'primary' : 'alternative',
        estimatedCost: slot.hourlyRate ? slot.hourlyRate * this.parseDurationEstimate(request.estimatedDuration) : undefined,
        workload: slot.workloadScore < 0.3 ? 'light' : slot.workloadScore < 0.7 ? 'moderate' : 'heavy',
        approvalRequired: request.requiresTenantAccess,
        approvalDeadline: request.requiresTenantAccess 
          ? new Date(slot.startTime.getTime() - 24 * 60 * 60 * 1000).toISOString() // 24h before
          : undefined
      };

      recommendations.push(recommendation);
    }

    // Sort by confidence score (highest first)
    return recommendations
      .sort((a, b) => b.confidence - a.confidence)
      .map((rec, index) => ({
        ...rec,
        priority: index === 0 ? 'primary' : 'alternative'
      }));
  }

  /**
   * Calculate overall optimization score for the scheduling solution
   */
  private calculateOptimizationScore(
    recommendations: AppointmentRecommendation[],
    request: SchedulingRequestType
  ): number {
    if (recommendations.length === 0) return 0.0;

    const primaryRec = recommendations.find(r => r.priority === 'primary');
    if (!primaryRec) return 0.0;

    let score = primaryRec.confidence * 0.6; // 60% from primary recommendation confidence

    // Add variety bonus (more alternatives = better)
    score += Math.min(recommendations.length / 5, 1.0) * 0.2; // 20% from variety

    // Add urgency match bonus
    if (request.urgency === 'Critical') {
      const hoursUntilPrimary = (new Date(primaryRec.scheduledStartAt).getTime() - new Date().getTime()) / (1000 * 60 * 60);
      score += (hoursUntilPrimary <= 4 ? 0.2 : 0.0); // 20% bonus for immediate critical scheduling
    }

    return Math.min(score, 1.0);
  }

  /**
   * Generate human-readable reasoning for scheduling decisions
   */
  private generateSchedulingReasoning(
    recommendations: AppointmentRecommendation[],
    request: SchedulingRequestType
  ): string {
    if (recommendations.length === 0) {
      return "No available contractors found matching the requirements and timeline.";
    }

    const primary = recommendations[0];
    const urgencyText = request.urgency === 'Critical' ? 'emergency' : 
                      request.urgency === 'High' ? 'urgent' : 'routine';
    
    const timeText = format(new Date(primary.scheduledStartAt), 'EEEE, MMMM do \'at\' h:mm a');
    
    return `AI scheduled this ${urgencyText} maintenance with ${primary.contractorName} on ${timeText}. ` +
           `Selected based on ${Math.round(primary.confidence * 100)}% optimization score considering ` +
           `contractor availability, workload (${primary.workload}), and urgency requirements. ` +
           `${recommendations.length > 1 ? `${recommendations.length - 1} alternative time slots available.` : ''}`;
  }

  /**
   * Generate reasoning for individual recommendations
   */
  private generateRecommendationReasoning(
    slot: ContractorAvailabilitySlot,
    request: SchedulingRequestType,
    confidence: number
  ): string {
    const reasons = [];
    
    if (slot.workloadScore < 0.3) {
      reasons.push("contractor has light workload");
    } else if (slot.workloadScore > 0.7) {
      reasons.push("contractor has heavy workload");
    }
    
    if (slot.responseTimeHours <= 2) {
      reasons.push("very fast response time");
    }
    
    const slotHour = slot.startTime.getHours();
    if (slotHour >= 9 && slotHour <= 17) {
      reasons.push("during business hours");
    }
    
    if (request.urgency === 'Critical') {
      const hoursUntil = (slot.startTime.getTime() - new Date().getTime()) / (1000 * 60 * 60);
      if (hoursUntil <= 4) {
        reasons.push("immediate availability for emergency");
      }
    }
    
    return reasons.length > 0 
      ? `Recommended due to: ${reasons.join(", ")}`
      : `Available slot with ${Math.round(confidence * 100)}% confidence`;
  }

  /**
   * Parse duration estimates like "2-4 hours" to average hours
   */
  private parseDurationEstimate(duration: string): number {
    const match = duration.match(/(\d+)(?:-(\d+))?\s*hours?/i);
    if (match) {
      const min = parseInt(match[1]);
      const max = match[2] ? parseInt(match[2]) : min;
      return (min + max) / 2;
    }
    return 2; // Default to 2 hours if parsing fails
  }
}