import OpenAI from 'openai';
import { storage } from './storage';
import { nanoid } from 'nanoid';
import type { 
  TriageConversationSelect, 
  InsertTriageConversation,
  TriageSafetyProtocolSelect,
  TriageQuestionRuleSelect 
} from '@shared/schema';

// ========================================
// 🛡️ Mailla AI Triage Agent Service
// ========================================

interface MaillaResponse {
  message: string;
  urgencyLevel: 'emergency' | 'urgent' | 'normal' | 'low';
  safetyFlags: string[];
  nextAction: 'ask_followup' | 'request_media' | 'escalate_immediate' | 'complete_triage' | 'recommend_diy';
  location?: {
    buildingName?: string;
    roomNumber?: string;
    isLocationConfirmed?: boolean;
  };
  followupQuestions?: string[];
  mediaRequest?: {
    type: 'photo' | 'video' | 'audio';
    reason: string;
  };
  diyAction?: {
    action: string;
    instructions: string[];
    warnings: string[];
  };
  isComplete?: boolean;
}

interface TriageUpdate {
  conversationId: string;
  studentMessage: string;
  mediaUrls?: string[];
}

export class MaillaAIService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-development'
    });
  }

  // ========================================
  // MAIN TRIAGE CONVERSATION FLOW
  // ========================================

  async startTriageConversation(
    studentId: string, 
    orgId: string, 
    initialRequest: string
  ): Promise<{ conversationId: string; maillaResponse: MaillaResponse }> {
    try {
      console.log(`🤖 Mailla starting triage for student ${studentId}: "${initialRequest}"`);

      // 1. Create conversation record
      const conversationId = nanoid();
      const conversation: InsertTriageConversation = {
        studentId,
        orgId,
        initialRequest,
        currentPhase: "gathering_info",
        urgencyLevel: "normal",
        safetyFlags: [],
        conversationHistory: [
          {
            role: "student",
            message: initialRequest,
            timestamp: new Date().toISOString()
          }
        ],
        triageData: {
          initialRequest,
          category: null,
          context: {}
        }
      };

      await storage.createTriageConversation(conversation);

      // 2. Generate initial Mailla response with safety-first assessment
      const maillaResponse = await this.processTriageMessage(conversationId, initialRequest, true);

      console.log(`✅ Mailla triage started with urgency: ${maillaResponse.urgencyLevel}`);
      return { conversationId, maillaResponse };

    } catch (error) {
      console.error("🚨 Mailla triage start error:", error);
      throw new Error("Failed to start triage conversation");
    }
  }

  async continueTriageConversation(update: TriageUpdate): Promise<MaillaResponse> {
    try {
      console.log(`🤖 Mailla continuing triage ${update.conversationId}`);

      // 1. Get conversation context
      const conversation = await storage.getTriageConversation(update.conversationId);
      if (!conversation) {
        throw new Error("Conversation not found");
      }

      // 2. Update conversation history
      const updatedHistory = [
        ...(conversation.conversationHistory as any[]),
        {
          role: "student",
          message: update.studentMessage,
          mediaUrls: update.mediaUrls || [],
          timestamp: new Date().toISOString()
        }
      ];

      // 3. Process new message with full context
      const maillaResponse = await this.processTriageMessage(
        update.conversationId, 
        update.studentMessage, 
        false, 
        conversation
      );

      // 4. Update conversation with Mailla's response
      await storage.updateTriageConversation(update.conversationId, {
        conversationHistory: [
          ...updatedHistory,
          {
            role: "mailla",
            message: maillaResponse.message,
            urgencyLevel: maillaResponse.urgencyLevel,
            safetyFlags: maillaResponse.safetyFlags,
            timestamp: new Date().toISOString()
          }
        ],
        urgencyLevel: maillaResponse.urgencyLevel,
        safetyFlags: maillaResponse.safetyFlags,
        currentPhase: maillaResponse.isComplete ? "final_triage" : conversation.currentPhase
      });

      console.log(`✅ Mailla response generated with action: ${maillaResponse.nextAction}`);
      return maillaResponse;

    } catch (error) {
      console.error("🚨 Mailla triage continue error:", error);
      throw new Error("Failed to continue triage conversation");
    }
  }

  // ========================================
  // AI PROCESSING & SAFETY PROTOCOLS
  // ========================================

  private async processTriageMessage(
    conversationId: string,
    studentMessage: string,
    isInitial: boolean,
    conversation?: TriageConversationSelect
  ): Promise<MaillaResponse> {
    try {
      // 1. Safety check first - ALWAYS
      const safetyResults = await this.performSafetyCheck(studentMessage);
      
      if (safetyResults.isEmergency) {
        return {
          message: safetyResults.emergencyMessage!,
          urgencyLevel: 'emergency',
          safetyFlags: safetyResults.flags,
          nextAction: 'escalate_immediate'
        };
      }

      // 2. Build conversation context
      const contextPrompt = this.buildTriageContextPrompt(
        studentMessage, 
        isInitial, 
        conversation,
        safetyResults
      );

      // 3. Get Mailla's intelligent response
      const aiResponse = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: this.getMaillaSystemPrompt() },
          { role: "user", content: contextPrompt }
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_triage_response",
            description: "Generate Mailla's intelligent triage response with safety and urgency assessment",
            parameters: {
              type: "object",
              properties: {
                message: { type: "string", description: "Mailla's friendly but professional response" },
                urgencyLevel: { 
                  type: "string", 
                  enum: ["emergency", "urgent", "normal", "low"],
                  description: "Assessed urgency level" 
                },
                safetyFlags: { 
                  type: "array", 
                  items: { type: "string" },
                  description: "Safety concerns identified" 
                },
                nextAction: { 
                  type: "string", 
                  enum: ["ask_followup", "request_media", "escalate_immediate", "complete_triage", "recommend_diy"],
                  description: "Next step in triage process" 
                },
                location: {
                  type: "object",
                  properties: {
                    buildingName: { type: "string", description: "MIT building name (e.g., 'Next House', 'Simmons Hall')" },
                    roomNumber: { type: "string", description: "Room/unit number" },
                    isLocationConfirmed: { type: "boolean", description: "Whether student has provided complete location" }
                  },
                  description: "Student's location information"
                },
                followupQuestions: { 
                  type: "array", 
                  items: { type: "string" },
                  description: "Specific follow-up questions to ask" 
                },
                mediaRequest: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["photo", "video", "audio"] },
                    reason: { type: "string" }
                  },
                  description: "Request for photos/videos/audio"
                },
                diyAction: {
                  type: "object",
                  properties: {
                    action: { type: "string" },
                    instructions: { type: "array", items: { type: "string" } },
                    warnings: { type: "array", items: { type: "string" } }
                  },
                  description: "Simple student action with safety warnings"
                },
                isComplete: { type: "boolean", description: "Whether triage is complete" }
              },
              required: ["message", "urgencyLevel", "safetyFlags", "nextAction"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "generate_triage_response" } },
        temperature: 0.7,
        max_tokens: 1500
      });

      const toolCall = aiResponse.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall || toolCall.type !== "function") {
        throw new Error("Mailla failed to generate triage response");
      }

      const maillaResponse = JSON.parse(toolCall.function.arguments) as MaillaResponse;

      // 4. Merge safety flags from both checks
      const allFlags = [...safetyResults.flags, ...maillaResponse.safetyFlags];
      maillaResponse.safetyFlags = Array.from(new Set(allFlags));

      // 5. Update triage data with location if provided
      if (maillaResponse.location && (maillaResponse.location.buildingName || maillaResponse.location.roomNumber)) {
        const currentTriageData = conversation?.triageData || { initialRequest: studentMessage, category: null, context: {} };
        const existingLocation = (currentTriageData as any)?.location || {};
        
        await storage.updateTriageConversation(conversationId, {
          triageData: {
            ...currentTriageData,
            location: {
              buildingName: maillaResponse.location.buildingName || existingLocation.buildingName,
              roomNumber: maillaResponse.location.roomNumber || existingLocation.roomNumber,
              isLocationConfirmed: maillaResponse.location.isLocationConfirmed || false
            }
          }
        });
      }

      return maillaResponse;

    } catch (error) {
      console.error("🚨 Mailla AI processing error:", error);
      return {
        message: "I'm having trouble processing your message right now. Let me connect you with someone who can help immediately.",
        urgencyLevel: 'urgent',
        safetyFlags: ['ai_processing_error'],
        nextAction: 'escalate_immediate'
      };
    }
  }

  // ========================================
  // SAFETY-FIRST PROTOCOLS
  // ========================================

  private async performSafetyCheck(message: string): Promise<{
    isEmergency: boolean;
    flags: string[];
    emergencyMessage?: string;
  }> {
    const lowerMessage = message.toLowerCase();
    const flags: string[] = [];
    
    // Critical safety keywords that trigger immediate escalation
    const emergencyKeywords = [
      'gas smell', 'gas leak', 'smell gas', 'gas odor',
      'electrical sparking', 'sparks', 'smoke', 'burning smell',
      'water gushing', 'flooding', 'electrical outlet wet',
      'no heat', 'no air conditioning', 'carbon monoxide',
      'exposed wire', 'electrical shock'
    ];

    const urgentKeywords = [
      'no power', 'circuit breaker', 'outlet not working',
      'water leak', 'dripping', 'toilet overflow', 
      'heater not working', 'ac not working'
    ];

    // Check for emergency conditions
    for (const keyword of emergencyKeywords) {
      if (lowerMessage.includes(keyword)) {
        flags.push(`emergency_${keyword.replace(/\s+/g, '_')}`);
        
        if (keyword.includes('gas')) {
          return {
            isEmergency: true,
            flags,
            emergencyMessage: "🚨 **EMERGENCY - GAS DETECTED** 🚨\n\n**IMMEDIATELY:**\n• Leave the building now\n• Do NOT use electrical switches or phones\n• Call 911 or gas company emergency line\n• Do NOT return until authorities say it's safe\n\nThis is a serious safety emergency. Please get to safety now and call for professional help."
          };
        }
        
        if (keyword.includes('electrical') && keyword.includes('water')) {
          return {
            isEmergency: true,
            flags,
            emergencyMessage: "🚨 **ELECTRICAL HAZARD** 🚨\n\n**IMMEDIATELY:**\n• Stay away from the area\n• Turn off electricity at circuit breaker if safe to reach\n• Do NOT touch water near electrical outlets\n• Call maintenance emergency line\n\nElectrical + water = serious danger. Please stay safe and get help immediately."
          };
        }
      }
    }

    // Check for urgent conditions
    for (const keyword of urgentKeywords) {
      if (lowerMessage.includes(keyword)) {
        flags.push(`urgent_${keyword.replace(/\s+/g, '_')}`);
      }
    }

    return { isEmergency: false, flags };
  }

  // ========================================
  // MAILLA CONVERSATION PROMPTS
  // ========================================

  private getMaillaSystemPrompt(): string {
    return `You are Mailla, a friendly but safety-focused AI assistant helping university students with maintenance issues.

CORE PRINCIPLES:
1. **Safety ALWAYS comes first** - detect and escalate any safety hazards immediately
2. **Urgency assessment** - understand timeline and impact to prioritize properly
3. **Student-friendly** - students are not expected to do complex repairs, only simple safe actions
4. **Context gathering** - ask smart questions to understand the full situation
5. **Media collection** - request photos/videos/audio when helpful for contractors

SAFETY PROTOCOLS:
- Gas smells = IMMEDIATE evacuation and emergency services
- Electrical + water = IMMEDIATE isolation and emergency help
- No heat/cooling + extreme weather = URGENT
- Sparking/burning = IMMEDIATE shutdown and evacuation

STUDENT ACTIONS (Simple & Safe Only):
- Check circuit breakers (flip if tripped)
- Ensure appliances are plugged in securely
- Place towels for minor water (away from electrical)
- Turn off water valve if easy to reach
- Never: electrical repairs, gas work, complex plumbing

URGENCY LEVELS:
- Emergency: Safety hazard, immediate danger
- Urgent: No heat/cooling, significant water damage, major disruption
- Normal: Standard maintenance issues
- Low: Cosmetic issues, minor inconveniences

Always be empathetic, clear, and focused on student safety and getting the right help quickly.`;
  }

  private buildTriageContextPrompt(
    studentMessage: string,
    isInitial: boolean,
    conversation?: TriageConversationSelect,
    safetyResults?: { flags: string[] }
  ): string {
    let prompt = `Student message: "${studentMessage}"\n\n`;

    if (isInitial) {
      prompt += `This is the initial maintenance request from an MIT student. Please:
1. Assess safety and urgency FIRST
2. Ask for location details early (CRITICAL for MIT Housing):
   - Which MIT building? (Next House, Simmons Hall, MacGregor House, Burton Conner, New House, Baker House, McCormick Hall, Random Hall, Senior House, Tang Hall, Westgate, Ashdown House, Sidney-Pacific, or Other)
   - What room/unit number?
3. Ask smart follow-up questions about the issue:
   - Timeline (when did this start?)
   - Severity (dripping vs gushing? warm vs cold room?)
   - Context (any other symptoms?)
4. Request photos/videos if visual assessment would help contractors
5. Suggest simple safe student actions if appropriate

MIT context: This is university housing, so focus on student safety and getting maintenance staff the exact location quickly.
`;
    } else {
      prompt += `This is a follow-up in an ongoing MIT student conversation.\n`;
      if (conversation) {
        prompt += `Previous context: ${JSON.stringify(conversation.triageData)}\n`;
        prompt += `Current phase: ${conversation.currentPhase}\n`;
        prompt += `Previous urgency: ${conversation.urgencyLevel}\n\n`;
      }
      
      prompt += `Continue gathering context. If location (building + room) is missing, prioritize getting that information. Complete triage when you have enough details.\n\n`;
    }

    if (safetyResults && safetyResults.flags.length > 0) {
      prompt += `Safety flags detected: ${safetyResults.flags.join(', ')}\n\n`;
    }

    prompt += `Remember: prioritize safety, be concise but thorough, and help the student feel supported.`;

    return prompt;
  }

  // ========================================
  // COMPLETE TRIAGE & CASE CREATION
  // ========================================

  // ✅ Unified case creation method - DEPRECATED: Use completeTriageConversation instead
  async completeTriageAndCreateCase(conversationId: string): Promise<string> {
    console.log(`⚠️ Using deprecated completeTriageAndCreateCase - use completeTriageConversation instead`);
    const result = await this.completeTriageConversation(conversationId);
    return result.caseId;
  }

  // MIT building mapping with basic implementation
  private getMITPropertyMapping(buildingName?: string, roomNumber?: string): { propertyId: string | null; unitId: string | null } {
    if (!buildingName) {
      return { propertyId: null, unitId: null };
    }

    // Basic MIT building mapping - in production this would be a database lookup
    const mitBuildingMap: Record<string, string> = {
      'Next House': 'mit-next-house',
      'Simmons Hall': 'mit-simmons-hall', 
      'MacGregor House': 'mit-macgregor-house',
      'Burton Conner': 'mit-burton-conner',
      'New House': 'mit-new-house',
      'Baker House': 'mit-baker-house',
      'McCormick Hall': 'mit-mccormick-hall',
      'Random Hall': 'mit-random-hall',
      'Senior House': 'mit-senior-house',
      'Tang Hall': 'mit-tang-hall',
      'Westgate': 'mit-westgate',
      'Ashdown House': 'mit-ashdown-house',
      'Sidney-Pacific': 'mit-sidney-pacific'
    };

    const propertyId = mitBuildingMap[buildingName] || null;
    
    // Unit ID would require room number and building-specific mapping
    // For now, we'll include room in metadata but not map to specific unitId
    const unitId = null; // In production: map roomNumber to actual unit ID
    
    return { propertyId, unitId };
  }

  // ✅ Implementation for complete triage conversation (required by API)
  async completeTriageConversation(conversationId: string) {
    try {
      console.log(`🤖 Mailla completing triage for conversation: ${conversationId}`);
      
      const conversation = await storage.getTriageConversation(conversationId);
      if (!conversation) {
        throw new Error("Conversation not found");
      }

      // Extract location data from triage
      const locationData = (conversation.triageData as any)?.location;
      const { propertyId, unitId } = this.getMITPropertyMapping(locationData?.buildingName, locationData?.roomNumber);

      // Create smart case with rich triage context and location
      const caseData = {
        orgId: conversation.orgId,
        title: `Maintenance Request: ${conversation.initialRequest.substring(0, 50)}...`,
        description: `${conversation.initialRequest}${locationData ? `\n\nLocation: ${locationData.buildingName || 'Unknown building'}${locationData.roomNumber ? `, Room ${locationData.roomNumber}` : ''}` : ''}`,
        category: "general", // Will be updated by AI
        priority: conversation.urgencyLevel as any,
        status: "Open" as any,
        reportedBy: conversation.studentId,
        propertyId: propertyId, // Now uses location data
        unitId: unitId,        // Now uses location data
        metadata: {
          triageConversationId: conversationId,
          safetyFlags: conversation.safetyFlags,
          triageData: conversation.triageData,
          urgencyLevel: conversation.urgencyLevel,
          mitBuilding: locationData?.buildingName,
          roomNumber: locationData?.roomNumber
        }
      };

      const newCase = await storage.createSmartCase(caseData);
      const caseId = newCase.id;

      // Update conversation as complete (consistent with schema)
      await storage.updateTriageConversation(conversationId, {
        isComplete: true,
        currentPhase: "final_triage",
        smartCaseId: caseId,
        completedAt: new Date()
      });

      return {
        success: true,
        conversationId,
        caseId,
        message: "Triage completed successfully. A maintenance case has been created.",
        triageData: conversation.triageData,
        safetyFlags: conversation.safetyFlags
      };

    } catch (error) {
      console.error('Error completing Mailla triage:', error);
      throw error;
    }
  }
}

// ✅ Export singleton instance for consistent usage
export const maillaAIService = new MaillaAIService();