import OpenAI from 'openai';
import { z } from 'zod';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Types for contractor coordination
export interface ContractorAssignment {
  contractorId: string;
  caseId: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  estimatedHours: number;
  requiredSkills: string[];
  location: string;
  preferredTimeWindow?: string;
  specialInstructions?: string;
}

export interface ContractorAvailability {
  contractorId: string;
  isAvailable: boolean;
  nextAvailableSlot?: string;
  currentWorkload: number;
  maxCapacity: number;
  availabilityReason?: string;
}

export interface AssignmentRecommendation {
  contractorId: string;
  contractorName: string;
  matchScore: number; // 0-100
  reasoning: string;
  estimatedResponseTime: string;
  availability: ContractorAvailability;
  riskFactors?: string[];
}

// AI-powered contractor coordination schema
const ContractorMatchRequest = z.object({
  caseData: z.object({
    id: z.string(),
    category: z.string(),
    priority: z.enum(['Low', 'Medium', 'High', 'Critical']),
    description: z.string(),
    location: z.string().optional(),
    urgency: z.enum(['Low', 'Medium', 'High', 'Critical']),
    estimatedDuration: z.string(),
    safetyRisk: z.enum(['None', 'Low', 'Medium', 'High']),
    contractorType: z.string().optional()
  }),
  availableContractors: z.array(z.object({
    id: z.string(),
    name: z.string(),
    category: z.string().optional(),
    specializations: z.array(z.string()).optional(),
    availabilityPattern: z.string(),
    responseTimeHours: z.number(),
    estimatedHourlyRate: z.number().optional(),
    rating: z.number().optional(),
    maxJobsPerDay: z.number(),
    currentWorkload: z.number().default(0),
    emergencyAvailable: z.boolean().default(false),
    isActiveContractor: z.boolean()
  }))
});

const AssignmentResponse = z.object({
  recommendedContractor: z.object({
    contractorId: z.string(),
    matchScore: z.number().min(0).max(100),
    reasoning: z.string(),
    estimatedResponseTime: z.string(),
    riskFactors: z.array(z.string()).optional()
  }),
  alternativeContractors: z.array(z.object({
    contractorId: z.string(),
    matchScore: z.number().min(0).max(100),
    reasoning: z.string()
  })).optional(),
  coordinationNotes: z.string(),
  communicationTemplate: z.object({
    subject: z.string(),
    message: z.string(),
    urgencyLevel: z.enum(['normal', 'high', 'urgent', 'emergency'])
  })
});

export class AICoordinatorService {
  private readonly AI_COORDINATION_TIMEOUT = 12000; // 12 seconds for coordination

  async findOptimalContractor(request: z.infer<typeof ContractorMatchRequest>): Promise<AssignmentRecommendation[]> {
    try {
      const validatedRequest = ContractorMatchRequest.parse(request);
      
      // Build AI prompt for contractor matching
      const prompt = this.buildCoordinationPrompt(validatedRequest);
      
      const response = await Promise.race([
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are an expert contractor coordination AI for MIT Housing. Your job is to intelligently match maintenance cases to the best available contractors based on skills, availability, workload, and efficiency. Optimize for response time, cost-effectiveness, and successful completion."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          response_format: { type: "json_object" }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("AI coordination timeout")), this.AI_COORDINATION_TIMEOUT)
        )
      ]) as any;

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("No content received from AI coordination");
      }

      const coordinationResult = JSON.parse(content);
      const validatedResult = AssignmentResponse.parse(coordinationResult);
      
      return this.convertToRecommendations(validatedResult, validatedRequest.availableContractors);

    } catch (error) {
      console.error('AI coordination failed:', error);
      // Fallback to rule-based matching
      return this.getFallbackMatching(request);
    }
  }

  private buildCoordinationPrompt(request: z.infer<typeof ContractorMatchRequest>): string {
    const { caseData, availableContractors } = request;
    
    return `Analyze this maintenance case and available contractors to find the optimal assignment:

CASE DETAILS:
- ID: ${caseData.id}
- Category: ${caseData.category}
- Priority: ${caseData.priority}
- Description: ${caseData.description}
- Location: ${caseData.location || 'MIT Campus'}
- Urgency: ${caseData.urgency}
- Estimated Duration: ${caseData.estimatedDuration}
- Safety Risk: ${caseData.safetyRisk}
- Preferred Contractor Type: ${caseData.contractorType || 'Any qualified'}

AVAILABLE CONTRACTORS:
${availableContractors.map(c => `
- ${c.name} (ID: ${c.id})
  * Category: ${c.category || 'General'}
  * Specializations: ${c.specializations?.join(', ') || 'General maintenance'}
  * Response Time: ${c.responseTimeHours} hours
  * Availability: ${c.availabilityPattern}
  * Current Workload: ${c.currentWorkload}/${c.maxJobsPerDay} jobs
  * Emergency Available: ${c.emergencyAvailable ? 'Yes' : 'No'}
  * Rating: ${c.rating || 'Not rated'}
  * Hourly Rate: $${c.estimatedHourlyRate || 'TBD'}
  * Active: ${c.isActiveContractor ? 'Yes' : 'No'}
`).join('')}

COORDINATION REQUIREMENTS:
1. Match contractor specialization to case category
2. Consider contractor availability and current workload
3. Prioritize faster response times for urgent cases
4. Factor in safety requirements and emergency availability
5. Optimize for cost-effectiveness while maintaining quality
6. Provide clear reasoning for recommendations
7. Generate appropriate communication template

Respond with JSON in exactly this format:
{
  "recommendedContractor": {
    "contractorId": "string (exact ID from available contractors)",
    "matchScore": number (0-100),
    "reasoning": "string (detailed explanation of why this contractor is best)",
    "estimatedResponseTime": "string (e.g., '2 hours', '4 hours')", 
    "riskFactors": ["string array of potential risks or concerns"]
  },
  "alternativeContractors": [
    {
      "contractorId": "string (exact ID)",
      "matchScore": number (0-100),
      "reasoning": "string (why this is backup option)"
    },
    {
      "contractorId": "string (exact ID)",
      "matchScore": number (0-100), 
      "reasoning": "string (why this is backup option)"
    }
  ],
  "coordinationNotes": "string (summary of assignment logic)",
  "communicationTemplate": {
    "subject": "string (email subject for contractor)",
    "message": "string (email body for contractor)",
    "urgencyLevel": "normal" | "high" | "urgent" | "emergency"
  }
}

Score contractors on: skill match (30%), availability (25%), response time (20%), workload (15%), cost (10%)`;
  }

  private convertToRecommendations(
    aiResult: z.infer<typeof AssignmentResponse>, 
    contractors: z.infer<typeof ContractorMatchRequest>['availableContractors']
  ): AssignmentRecommendation[] {
    const recommendations: AssignmentRecommendation[] = [];
    
    // Main recommendation
    const primaryContractor = contractors.find(c => c.id === aiResult.recommendedContractor.contractorId);
    if (primaryContractor) {
      recommendations.push({
        contractorId: aiResult.recommendedContractor.contractorId,
        contractorName: primaryContractor.name,
        matchScore: aiResult.recommendedContractor.matchScore,
        reasoning: aiResult.recommendedContractor.reasoning,
        estimatedResponseTime: aiResult.recommendedContractor.estimatedResponseTime,
        riskFactors: aiResult.recommendedContractor.riskFactors,
        availability: {
          contractorId: primaryContractor.id,
          isAvailable: primaryContractor.currentWorkload < primaryContractor.maxJobsPerDay,
          currentWorkload: primaryContractor.currentWorkload,
          maxCapacity: primaryContractor.maxJobsPerDay,
          availabilityReason: primaryContractor.availabilityPattern
        }
      });
    }
    
    // Alternative recommendations
    aiResult.alternativeContractors?.forEach(alt => {
      const contractor = contractors.find(c => c.id === alt.contractorId);
      if (contractor) {
        recommendations.push({
          contractorId: alt.contractorId,
          contractorName: contractor.name,
          matchScore: alt.matchScore,
          reasoning: alt.reasoning,
          estimatedResponseTime: `${contractor.responseTimeHours} hours`,
          availability: {
            contractorId: contractor.id,
            isAvailable: contractor.currentWorkload < contractor.maxJobsPerDay,
            currentWorkload: contractor.currentWorkload,
            maxCapacity: contractor.maxJobsPerDay,
            availabilityReason: contractor.availabilityPattern
          }
        });
      }
    });
    
    return recommendations.sort((a, b) => b.matchScore - a.matchScore);
  }

  private getFallbackMatching(request: z.infer<typeof ContractorMatchRequest>): AssignmentRecommendation[] {
    const { caseData, availableContractors } = request;
    
    // Rule-based fallback matching
    const activeContractors = availableContractors.filter(c => 
      c.isActiveContractor && c.currentWorkload < c.maxJobsPerDay
    );
    
    if (activeContractors.length === 0) {
      // ✅ NO CONTRACTORS AVAILABLE - SUGGEST ADMIN INTERVENTION
      console.log(`🚨 No contractors available for ${caseData.category} case "${caseData.description}"`);
      
      // Return special admin intervention recommendation
      return [{
        contractorId: 'admin-intervention-required',
        contractorName: '⚡ Admin Intervention Needed',
        matchScore: 0,
        reasoning: `No ${caseData.category} contractors available. Suggested actions: 1) Flag general maintenance contractor, 2) Contact external emergency service, 3) Reassign to available contractor with different specialization`,
        estimatedResponseTime: 'Immediate admin action required',
        riskFactors: ['no_specialized_contractors', 'potential_delay'],
        availability: {
          contractorId: 'admin-intervention',
          isAvailable: false,
          currentWorkload: 0,
          maxCapacity: 0,
          availabilityReason: `No active ${caseData.category} contractors found. Admin should: reassign to general contractor or contact external services`
        }
      }];
    }
    
    // Score contractors based on simple rules
    const scoredContractors = activeContractors.map(contractor => {
      let score = 50; // Base score
      
      // Category match bonus
      if (contractor.category && caseData.category.toLowerCase().includes(contractor.category.toLowerCase())) {
        score += 25;
      }
      
      // Specialization match bonus
      if (contractor.specializations?.some(spec => 
        caseData.description.toLowerCase().includes(spec.toLowerCase())
      )) {
        score += 20;
      }
      
      // Availability bonus
      const availabilityRatio = 1 - (contractor.currentWorkload / contractor.maxJobsPerDay);
      score += availabilityRatio * 15;
      
      // Emergency availability for urgent cases
      if ((caseData.priority === 'Urgent' || caseData.urgency === 'Critical') && contractor.emergencyAvailable) {
        score += 15;
      }
      
      // Response time bonus (faster = higher score)
      if (contractor.responseTimeHours <= 2) score += 10;
      else if (contractor.responseTimeHours <= 8) score += 5;
      
      // Rating bonus
      if (contractor.rating && contractor.rating >= 4.0) {
        score += 10;
      }
      
      return {
        contractorId: contractor.id,
        contractorName: contractor.name,
        matchScore: Math.min(Math.max(score, 0), 100),
        reasoning: `Fallback matching: Category ${contractor.category || 'general'}, ${contractor.currentWorkload}/${contractor.maxJobsPerDay} workload, ${contractor.responseTimeHours}h response time`,
        estimatedResponseTime: `${contractor.responseTimeHours} hours`,
        availability: {
          contractorId: contractor.id,
          isAvailable: contractor.currentWorkload < contractor.maxJobsPerDay,
          currentWorkload: contractor.currentWorkload,
          maxCapacity: contractor.maxJobsPerDay,
          availabilityReason: contractor.availabilityPattern
        }
      };
    });
    
    return scoredContractors.sort((a, b) => b.matchScore - a.matchScore).slice(0, 3);
  }

  async generateContractorNotification(
    caseData: any, 
    contractor: any, 
    assignment: AssignmentRecommendation
  ): Promise<{ subject: string; message: string; urgencyLevel: string }> {
    try {
      const prompt = `Generate a professional notification for contractor ${contractor.name} about a new maintenance assignment:

CASE: ${caseData.title}
LOCATION: ${caseData.location || 'MIT Campus'}
PRIORITY: ${caseData.priority}
DESCRIPTION: ${caseData.description}
ESTIMATED DURATION: ${assignment.estimatedResponseTime}

Create a clear, professional message that includes:
- Brief case summary
- Why they were selected
- Required response timeframe
- Safety considerations if any
- Next steps

Respond with JSON: { "subject": "...", "message": "...", "urgencyLevel": "normal|high|urgent|emergency" }`;

      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: "You are a professional communication AI for MIT Housing maintenance coordination. Generate clear, respectful contractor notifications."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content;
      if (content) {
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Failed to generate contractor notification:', error);
    }
    
    // Fallback notification
    return {
      subject: `New Maintenance Assignment: ${caseData.title}`,
      message: `Dear ${contractor.name},\n\nYou have been assigned a new maintenance case:\n\nCase: ${caseData.title}\nLocation: ${caseData.location || 'MIT Campus'}\nPriority: ${caseData.priority}\nDescription: ${caseData.description}\n\nPlease confirm your availability and estimated start time.\n\nBest regards,\nMIT Housing Maintenance AI`,
      urgencyLevel: caseData.priority === 'Urgent' ? 'urgent' : 'normal'
    };
  }
}

export const aiCoordinatorService = new AICoordinatorService();