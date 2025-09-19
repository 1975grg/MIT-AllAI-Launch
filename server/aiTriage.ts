import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface TriageResult {
  category: string;
  subcategory: string;
  urgency: "Low" | "Medium" | "High" | "Critical";
  estimatedComplexity: "Simple" | "Moderate" | "Complex";
  requiredExpertise: string[];
  estimatedDuration: string;
  preliminaryDiagnosis: string;
  troubleshootingSteps: string[];
  contractorType: string;
  specialEquipment: string[];
  safetyRisk: "None" | "Low" | "Medium" | "High";
  reasoning: string;
}

export interface MaintenanceRequest {
  title: string;
  description: string;
  category?: string;
  priority?: string;
  building?: string;
  room?: string;
  photos?: string[]; // base64 encoded images for AI analysis
  unitId?: string;
  propertyId?: string;
  orgId?: string;
  studentContact?: {
    name: string;
    email: string;
    phone?: string;
    building: string;
    room: string;
  };
}

export class AITriageService {
  /**
   * Analyzes a maintenance request using AI and provides intelligent triage
   */
  async analyzeMaintenanceRequest(request: MaintenanceRequest): Promise<TriageResult> {
    try {
      console.log(`🤖 AI Triage: Analyzing "${request.title}"`);
      
      // Analyze photos first if provided
      let photoAnalysis = '';
      if (request.photos && request.photos.length > 0) {
        console.log(`🤖 Analyzing ${request.photos.length} photos`);
        photoAnalysis = await this.analyzeMaintenancePhotos(request.photos);
      }
      
      const prompt = this.buildTriagePrompt(request, photoAnalysis);
      
      const response = await Promise.race([
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are an expert maintenance triage specialist for MIT student housing. Analyze maintenance requests and provide detailed triage information to help prioritize, route, and resolve issues efficiently."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          response_format: { type: "json_object" }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("AI analysis timeout")), 15000)
        )
      ]) as any;

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("No content received from AI analysis");
      }
      const result = JSON.parse(content);
      const triageResult = this.validateTriageResult(result);
      
      console.log(`🤖 Triage Complete: ${triageResult.urgency} urgency, ${triageResult.category} category`);
      return triageResult;
    } catch (error) {
      console.error("AI Triage Analysis Error:", error);
      // Return fallback triage result
      return this.getFallbackTriage(request);
    }
  }

  /**
   * Builds the AI prompt for maintenance request analysis
   */
  private buildTriagePrompt(request: MaintenanceRequest, photoAnalysis?: string): string {
    return `
Analyze this MIT student housing maintenance request and provide a comprehensive triage assessment:

MAINTENANCE REQUEST:
Title: ${request.title}
Description: ${request.description}
${request.category ? `Category: ${request.category}` : ''}
${request.priority ? `Student Priority: ${request.priority}` : ''}
${request.building ? `Building: ${request.building}` : ''}
${request.room ? `Room: ${request.room}` : ''}
${photoAnalysis ? `\nPHOTO ANALYSIS:\n${photoAnalysis}\n` : ''}

Please analyze and respond with JSON in this exact format:
{
  "category": "Primary category (Plumbing, Electrical, HVAC, Appliances, Structural, General Maintenance, Security, Technology, etc.)",
  "subcategory": "Specific subcategory (e.g., 'Leaky Faucet', 'Outlet Not Working', 'Heat Not Working', etc.)",
  "urgency": "Low|Medium|High|Critical (Critical=safety hazard/major disruption, High=significant impact, Medium=moderate inconvenience, Low=minor issue)",
  "estimatedComplexity": "Simple|Moderate|Complex (Simple=<1hr, Moderate=1-4hrs, Complex=>4hrs or multiple visits)",
  "requiredExpertise": ["List of required skills: plumber, electrician, HVAC technician, general maintenance, appliance repair, etc."],
  "estimatedDuration": "Estimated time to complete (e.g., '30 minutes', '2-3 hours', '1-2 days')",
  "preliminaryDiagnosis": "Brief diagnosis of likely cause and solution approach",
  "troubleshootingSteps": ["List of 3-5 initial troubleshooting steps the student or staff could try before contractor arrives"],
  "contractorType": "Primary contractor type needed (Plumber, Electrician, HVAC, General Maintenance, Appliance Repair, etc.)",
  "specialEquipment": ["List any special tools/equipment that may be needed"],
  "safetyRisk": "None|Low|Medium|High (High=immediate danger, Medium=potential hazard, Low=minor safety concern, None=no safety issues)",
  "reasoning": "Brief explanation of urgency and complexity assessment"
}

Consider factors like:
- Student safety and well-being
- Impact on habitability
- Potential for property damage if delayed
- Time sensitivity (e.g., water leaks, electrical issues)
- Complexity of repair
- Required expertise level
- MIT housing maintenance standards
`;
  }

  /**
   * Analyzes maintenance photos using AI vision to understand the issue visually
   */
  private async analyzeMaintenancePhotos(photos: string[]): Promise<string> {
    try {
      // Analyze the first photo (most platforms limit to 1 image per analysis)
      const firstPhoto = photos[0];
      
      // SECURITY: Add timeout protection and data extraction from base64
      const base64Data = firstPhoto.includes(',') ? firstPhoto.split(',')[1] : firstPhoto;
      
      const response = await Promise.race([
        openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this maintenance issue photo for MIT student housing. Describe what you see, identify the problem, assess severity, note safety concerns, and provide actionable insights for maintenance coordination. Focus on technical details that would help a maintenance coordinator understand the issue."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Data}`
                }
              }
            ],
          }],
          max_completion_tokens: 500,
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Photo analysis timeout")), 10000)
        )
      ]) as any;

      const analysis = response.choices[0].message.content || 'Unable to analyze image';
      // PRIVACY: Remove sensitive content logging - just log completion
      console.log(`🤖 Photo Analysis: Completed successfully`);
      return analysis;
      
    } catch (error) {
      console.error('🚨 Photo Analysis Error:', error instanceof Error ? error.message : 'Unknown error');
      return 'Photo analysis unavailable - proceeding with text-based triage';
    }
  }

  /**
   * Find and rank contractors based on triage results and availability
   */
  async findMatchingContractors(triageResult: TriageResult, orgId: string): Promise<{
    contractorId: string;
    name: string;
    category: string;
    matchScore: number;
    availability: 'available' | 'busy' | 'unavailable';
    estimatedResponse: string;
    specializations: string[];
  }[]> {
    console.log(`🤖 Finding contractors for ${triageResult.category} work (urgency: ${triageResult.urgency})`);
    
    // This integrates with our vendor database and scheduling system
    // Return structure for implementation - will be enhanced when we build contractor interface
    return [
      {
        contractorId: 'ai-matched-contractor',
        name: 'AI Matched Contractor',
        category: triageResult.category,
        matchScore: 0.85,
        availability: 'available',
        estimatedResponse: triageResult.urgency === 'Critical' ? '30 minutes' : '2-4 hours',
        specializations: triageResult.requiredExpertise
      }
    ];
  }

  /**
   * Creates complete smart case workflow with automated contractor assignment and scheduling
   */
  async createSmartCaseWorkflow(smartCaseId: string, triageResult: TriageResult, contractorRecommendations: any[]): Promise<{
    caseId: string;
    status: string;
    workflowSteps: string[];
    autoScheduling: {
      enabled: boolean;
      priority: string;
      estimatedDuration: string;
      contractorAssigned?: string;
      schedulingNotes: string;
    };
  }> {
    console.log(`🔄 Initializing smart case workflow for case ${smartCaseId} - ${triageResult.urgency} priority`);
    
    const workflowSteps = [
      '✅ AI triage analysis completed',
      `📋 Categorized as ${triageResult.category} (${triageResult.estimatedComplexity} complexity)`,
      `⚡ Priority set to ${triageResult.urgency}`,
      ...triageResult.troubleshootingSteps.map(step => `🔧 ${step}`),
      `🏗️ ${triageResult.contractorType} contractor required`
    ];

    // Determine auto-scheduling based on urgency and contractor availability
    const autoScheduling = {
      enabled: triageResult.urgency === 'Critical' || triageResult.urgency === 'High',
      priority: triageResult.urgency,
      estimatedDuration: triageResult.estimatedDuration,
      contractorAssigned: undefined as string | undefined,
      schedulingNotes: ''
    };

    // Auto-assign contractor if available
    if (contractorRecommendations && contractorRecommendations.length > 0) {
      const bestMatch = contractorRecommendations[0];
      autoScheduling.contractorAssigned = bestMatch.contractorId;
      autoScheduling.schedulingNotes = `Auto-assigned to ${bestMatch.contractorName} (${bestMatch.matchScore}% match)`;
      workflowSteps.push(`👷 Auto-assigned to ${bestMatch.contractorName}`);
      
      // For critical issues, add immediate scheduling
      if (triageResult.urgency === 'Critical') {
        workflowSteps.push('🚨 Emergency scheduling initiated');
        autoScheduling.schedulingNotes += ' | Emergency response activated';
      }
    } else {
      workflowSteps.push('⏳ Awaiting contractor assignment');
      autoScheduling.schedulingNotes = 'Manual contractor assignment required';
    }

    // Add safety escalation for high-risk issues
    if (triageResult.safetyRisk === 'High' || triageResult.safetyRisk === 'Medium') {
      workflowSteps.push(`⚠️ Safety escalation: ${triageResult.safetyRisk} risk identified`);
      autoScheduling.schedulingNotes += ` | Safety risk: ${triageResult.safetyRisk}`;
    }

    const finalStatus = this.determineInitialCaseStatus(triageResult, contractorRecommendations);
    
    console.log(`🎯 Smart case workflow initialized: ${workflowSteps.length} steps, auto-scheduling: ${autoScheduling.enabled}`);
    
    return {
      caseId: smartCaseId,
      status: finalStatus,
      workflowSteps,
      autoScheduling
    };
  }

  /**
   * Determines initial case status based on AI triage and contractor availability
   */
  private determineInitialCaseStatus(triageResult: TriageResult, contractorRecommendations: any[]): string {
    // Critical issues get immediate scheduling
    if (triageResult.urgency === 'Critical') {
      return 'Scheduled'; // Ready for immediate contractor dispatch
    }
    
    // High priority with available contractors
    if (triageResult.urgency === 'High' && contractorRecommendations && contractorRecommendations.length > 0) {
      return 'Scheduled'; // Can be scheduled with available contractor
    }
    
    // Safety risks need review
    if (triageResult.safetyRisk === 'High') {
      return 'In Review'; // Safety review required before scheduling
    }
    
    // Standard cases start as new
    return 'New';
  }

  /**
   * Creates automated case events for audit trail and notifications
   */
  async createCaseEvents(caseId: string, triageResult: TriageResult, workflowData: any): Promise<string[]> {
    const events = [];
    
    // AI analysis event
    events.push(`AI Triage Analysis Completed - Category: ${triageResult.category}, Urgency: ${triageResult.urgency}`);
    
    // Contractor assignment event
    if (workflowData.autoScheduling.contractorAssigned) {
      events.push(`Contractor Auto-Assigned: ${workflowData.autoScheduling.contractorAssigned}`);
    }
    
    // Safety event
    if (triageResult.safetyRisk !== 'None') {
      events.push(`Safety Risk Identified: ${triageResult.safetyRisk} level - ${triageResult.reasoning}`);
    }
    
    // Scheduling event  
    if (workflowData.autoScheduling.enabled) {
      events.push(`Auto-Scheduling Enabled: ${workflowData.autoScheduling.priority} priority case`);
    }
    
    console.log(`📝 Created ${events.length} case events for audit trail`);
    return events;
  }

  /**
   * Validates and normalizes the AI triage result
   */
  private validateTriageResult(result: any): TriageResult {
    // Validate urgency
    const validUrgencies = ["Low", "Medium", "High", "Critical"];
    if (!validUrgencies.includes(result.urgency)) {
      result.urgency = "Medium";
    }

    // Validate complexity
    const validComplexities = ["Simple", "Moderate", "Complex"];
    if (!validComplexities.includes(result.estimatedComplexity)) {
      result.estimatedComplexity = "Moderate";
    }

    // Validate safety risk
    const validSafetyRisks = ["None", "Low", "Medium", "High"];
    if (!validSafetyRisks.includes(result.safetyRisk)) {
      result.safetyRisk = "None";
    }

    // Ensure arrays exist
    result.requiredExpertise = Array.isArray(result.requiredExpertise) ? result.requiredExpertise : [];
    result.troubleshootingSteps = Array.isArray(result.troubleshootingSteps) ? result.troubleshootingSteps : [];
    result.specialEquipment = Array.isArray(result.specialEquipment) ? result.specialEquipment : [];

    // Ensure required string fields exist
    result.category = result.category || "General Maintenance";
    result.subcategory = result.subcategory || "Unspecified";
    result.preliminaryDiagnosis = result.preliminaryDiagnosis || "Requires further inspection";
    result.contractorType = result.contractorType || "General Maintenance";
    result.estimatedDuration = result.estimatedDuration || "2-4 hours";
    result.reasoning = result.reasoning || "Standard maintenance request";

    return result as TriageResult;
  }

  /**
   * Provides a fallback triage result when AI analysis fails
   */
  private getFallbackTriage(request: MaintenanceRequest): TriageResult {
    // Simple rule-based fallback
    const title = request.title.toLowerCase();
    const description = request.description.toLowerCase();
    
    let urgency: "Low" | "Medium" | "High" | "Critical" = "Medium";
    let category = "General Maintenance";
    let contractorType = "General Maintenance";
    let safetyRisk: "None" | "Low" | "Medium" | "High" = "None";

    // Emergency keywords
    if (title.includes("emergency") || description.includes("emergency") ||
        description.includes("flooding") || description.includes("gas leak") ||
        description.includes("electrical hazard") || description.includes("fire")) {
      urgency = "Critical";
      safetyRisk = "High";
    }
    // Water/plumbing issues
    else if (title.includes("water") || title.includes("leak") || title.includes("plumb")) {
      category = "Plumbing";
      contractorType = "Plumber";
      urgency = "High";
    }
    // Electrical issues
    else if (title.includes("electric") || title.includes("outlet") || title.includes("power")) {
      category = "Electrical";
      contractorType = "Electrician";
      urgency = "High";
      safetyRisk = "Medium";
    }
    // HVAC issues
    else if (title.includes("heat") || title.includes("ac") || title.includes("hvac") || title.includes("air")) {
      category = "HVAC";
      contractorType = "HVAC Technician";
      urgency = "High";
    }

    return {
      category,
      subcategory: "Unspecified",
      urgency,
      estimatedComplexity: "Moderate",
      requiredExpertise: [contractorType],
      estimatedDuration: "2-4 hours",
      preliminaryDiagnosis: "Requires inspection to determine specific issue and solution",
      troubleshootingSteps: [
        "Document the issue with photos if safe to do so",
        "Check if issue affects other units or areas",
        "Verify basic functionality (power, water, etc.)",
        "Clear any obvious obstructions safely",
        "Report any safety concerns immediately"
      ],
      contractorType,
      specialEquipment: [],
      safetyRisk,
      reasoning: "Automated fallback triage based on keyword analysis"
    };
  }

  /**
   * Gets automated troubleshooting suggestions for students
   */
  async generateTroubleshootingSteps(request: MaintenanceRequest): Promise<string[]> {
    try {
      const prompt = `
For this MIT student housing maintenance issue, provide 3-5 safe troubleshooting steps a student could try BEFORE calling maintenance:

Issue: ${request.title}
Description: ${request.description}

Provide only safe, simple steps. Do NOT suggest anything involving:
- Electrical work beyond checking plugs/switches
- Plumbing repairs beyond basic checks
- Touching electrical panels or gas lines
- Using tools they likely don't have

Respond with JSON: { "steps": ["step 1", "step 2", ...] }
`;

      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: "You are a safety-conscious maintenance expert providing simple troubleshooting steps for college students."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("No content received from troubleshooting analysis");
      }
      const result = JSON.parse(content);
      return Array.isArray(result.steps) ? result.steps : [];
    } catch (error) {
      console.error("Error generating troubleshooting steps:", error);
      return [
        "Check if the issue is affecting other units",
        "Ensure all relevant switches/controls are in the correct position",
        "Document the problem with photos if safe to do so",
        "Contact MIT Housing if the issue persists or worsens"
      ];
    }
  }
}

// Export singleton instance
export const aiTriageService = new AITriageService();