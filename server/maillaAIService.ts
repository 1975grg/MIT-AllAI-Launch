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
  nextQuestion?: string;
  queuedQuestions?: string[];
  acknowledgment?: string;
  conversationSlots?: {
    buildingName?: string;
    roomNumber?: string;
    issueSummary?: string;
    timeline?: string;
    severity?: string;
  };
  location?: {
    buildingName?: string;
    roomNumber?: string;
    isLocationConfirmed?: boolean;
  };
  followupQuestions?: string[]; // Keep for backward compatibility
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
          context: {},
          conversationSlots: {}
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

      // 2. Smart location extraction from student message
      const extractedLocation = this.extractLocationFromMessage(studentMessage);
      console.log(`🏢 Location extraction result:`, extractedLocation);

      // 3. Build conversation context with location intelligence
      const contextPrompt = this.buildTriageContextPrompt(
        studentMessage, 
        isInitial, 
        conversation,
        safetyResults,
        extractedLocation
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
                nextQuestion: {
                  type: "string",
                  description: "The single next question to ask (if any) - keep it conversational and friendly"
                },
                queuedQuestions: {
                  type: "array",
                  items: { type: "string" },
                  description: "Additional questions to ask later, in order of priority"
                },
                acknowledgment: {
                  type: "string",
                  description: "Brief acknowledgment of what the student shared (optional)"
                },
                conversationSlots: {
                  type: "object",
                  properties: {
                    buildingName: { type: "string" },
                    roomNumber: { type: "string" },
                    issueSummary: { type: "string" },
                    timeline: { type: "string" },
                    severity: { type: "string" }
                  },
                  description: "Information slots filled from this interaction"
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

      // 5. Merge extracted location with AI-provided location
      if (extractedLocation && extractedLocation.buildingName) {
        if (!maillaResponse.location) {
          maillaResponse.location = {};
        }
        // Use extracted location if AI didn't provide it
        if (!maillaResponse.location.buildingName) {
          maillaResponse.location.buildingName = extractedLocation.buildingName;
        }
        if (!maillaResponse.location.roomNumber && extractedLocation.roomNumber) {
          maillaResponse.location.roomNumber = extractedLocation.roomNumber;
        }
        // Mark as confirmed if we have both building and room
        if (maillaResponse.location.buildingName && maillaResponse.location.roomNumber) {
          maillaResponse.location.isLocationConfirmed = true;
        }
      }

      // 6. Update conversation slots and queue pending questions
      if (maillaResponse.conversationSlots || maillaResponse.queuedQuestions || maillaResponse.location) {
        const currentTriageData = conversation?.triageData || { initialRequest: studentMessage, category: null, context: {} };
        const existingSlots = (currentTriageData as any)?.conversationSlots || {};
        const existingLocation = (currentTriageData as any)?.location || {};
        const pendingQuestions = (currentTriageData as any)?.pendingQuestions || [];
        
        // Merge conversation slots with building name normalization
        const updatedSlots = {
          ...existingSlots,
          ...maillaResponse.conversationSlots
        };
        
        // Normalize building name in slots if present
        if (updatedSlots.buildingName) {
          const normalizedBuilding = this.resolveBuildingName(updatedSlots.buildingName);
          if (normalizedBuilding) {
            updatedSlots.buildingName = normalizedBuilding;
          }
        }
        
        // Handle location updates
        const updatedLocation = {
          ...existingLocation,
          ...maillaResponse.location
        };
        
        // Normalize building name in location if present
        if (updatedLocation.buildingName) {
          const normalizedBuilding = this.resolveBuildingName(updatedLocation.buildingName);
          if (normalizedBuilding) {
            updatedLocation.buildingName = normalizedBuilding;
          }
        }
        
        // Add new queued questions to pending list
        const updatedPendingQuestions = maillaResponse.queuedQuestions 
          ? [...pendingQuestions, ...maillaResponse.queuedQuestions]
          : pendingQuestions;
        
        await storage.updateTriageConversation(conversationId, {
          triageData: {
            ...currentTriageData,
            conversationSlots: updatedSlots,
            location: updatedLocation,
            pendingQuestions: updatedPendingQuestions
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
    return `You are Mailla, MIT Housing's compassionate maintenance assistant. You help students one step at a time with a kind, natural conversation style.

CONVERSATION RULES:
1. **ONE QUESTION AT A TIME** - Never ask multiple questions in one message
2. **NEVER REPEAT QUESTIONS** - If they already provided information, don't ask for it again
3. **Be compassionate** - Acknowledge their situation and feelings
4. **Keep responses SHORT** - Maximum 2 sentences + one question
5. **Talk like a helpful person** - Natural, warm, conversational tone
6. **Safety ALWAYS comes first** - Escalate emergencies immediately

CONVERSATION FLOW:
- Greeting → Building → Room → Issue details → Timeline → Severity (as needed)
- If they give multiple pieces of info, acknowledge what they shared and ask the next most important question
- Emergency keywords bypass normal flow for immediate help

CRITICAL: If the student has already mentioned their building or room number (e.g., "Tang Hall 201"), DO NOT ask for it again. Move to the next needed information.

TONE EXAMPLES:
❌ "I need to gather some information. Which building are you in and what's your room number? Also, when did this start?"
✅ "I'm here to help! Which MIT building are you in?"

❌ "Thank you for the information. Can you provide additional details about the timeline and severity?"
✅ "Got it, Next House. What's your room number?"

SAFETY PROTOCOLS:
- Gas smells = IMMEDIATE evacuation and emergency services
- Electrical + water = IMMEDIATE isolation and emergency help
- Sparking/burning = IMMEDIATE shutdown and evacuation

Always sound like you're texting a helpful friend who works in maintenance - warm, competent, and focused.`;
  }

  private buildTriageContextPrompt(
    studentMessage: string,
    isInitial: boolean,
    conversation?: TriageConversationSelect,
    safetyResults?: { flags: string[] },
    extractedLocation?: { buildingName?: string; roomNumber?: string; confidence: 'high' | 'medium' | 'low' }
  ): string {
    let prompt = `Student message: "${studentMessage}"\n\n`;

    // Extract existing conversation slots from triageData
    const existingSlots = (conversation?.triageData as any)?.conversationSlots || {};
    const pendingQuestions = (conversation?.triageData as any)?.pendingQuestions || [];

    if (isInitial) {
      // Check if location was already extracted from initial message
      if (extractedLocation && extractedLocation.buildingName) {
        prompt += `This is the FIRST message from an MIT student about a maintenance issue.
Location detected: ${extractedLocation.buildingName}${extractedLocation.roomNumber ? `, Room ${extractedLocation.roomNumber}` : ''} (confidence: ${extractedLocation.confidence})

Your response should:
1. Be warm and compassionate - acknowledge their issue
2. CONFIRM the detected location - "Just to confirm, you're in ${extractedLocation.buildingName}${extractedLocation.roomNumber ? `, room ${extractedLocation.roomNumber}` : ''}, right?"
3. If room number missing, ask for it next
4. Keep your message short and conversational

Example: "I'm here to help with that faucet leak! Just to confirm, you're in Tang Hall, room 201, right?"
`;
      } else {
        prompt += `This is the FIRST message from an MIT student about a maintenance issue.

Your response should:
1. Be warm and compassionate - acknowledge their issue
2. Ask for their building name ONLY (don't ask multiple things)
3. Keep your message short and conversational

MIT Buildings: Next House, Simmons Hall, MacGregor House, Burton Conner, New House, Baker House, McCormick Hall, Random Hall, Senior House, Tang Hall, Westgate, Ashdown House, Sidney-Pacific

Example: "I'm here to help with that! Which MIT building are you in?"
`;
      }
    } else {
      prompt += `This is a follow-up message. Conversation progress:\n`;
      
      // Show what we know so far
      if (Object.keys(existingSlots).length > 0) {
        prompt += `✅ Information already gathered: ${JSON.stringify(existingSlots)}\n`;
        prompt += `⚠️ IMPORTANT: Do NOT ask for any information already listed above!\n\n`;
      }
      
      if (pendingQuestions.length > 0) {
        prompt += `Questions in queue: ${pendingQuestions.join(', ')}\n`;
      }
      
      // Extract what we still need based on what's missing
      const needsBuilding = !existingSlots.buildingName;
      const needsRoom = !existingSlots.roomNumber && existingSlots.buildingName;
      const needsIssueDetails = !existingSlots.issueSummary && existingSlots.buildingName && existingSlots.roomNumber;
      
      prompt += `\nNext question priority (only ask for what's MISSING):
${needsBuilding ? '1. Building name (REQUIRED)' : '✅ Building name: already have it'}
${needsRoom ? '2. Room number (REQUIRED if building known)' : '✅ Room number: already have it'}  
${needsIssueDetails ? '3. Issue details (if location complete)' : '✅ Issue details: covered'}
4. Timeline/severity (if needed)

Ask the MOST IMPORTANT missing piece of information. Be natural and acknowledge what they just shared.
NEVER ask for information you already have!\n`;
    }

    if (safetyResults && safetyResults.flags.length > 0) {
      prompt += `SAFETY ALERT: ${safetyResults.flags.join(', ')} - prioritize safety!\n`;
    }

    prompt += `\nRemember: ONE question at a time, be conversational, acknowledge what they shared.`;

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

  // ========================================
  // SMART BUILDING INTELLIGENCE
  // ========================================

  // Enhanced MIT building mapping with aliases and fuzzy matching
  private getMITPropertyMapping(buildingName?: string, roomNumber?: string): { propertyId: string | null; unitId: string | null; normalizedBuildingName?: string } {
    if (!buildingName) {
      return { propertyId: null, unitId: null };
    }

    // Smart building resolution with aliases
    const resolvedBuilding = this.resolveBuildingName(buildingName);
    if (!resolvedBuilding) {
      return { propertyId: null, unitId: null };
    }

    // Main building mapping - canonical names to property IDs
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

    const propertyId = mitBuildingMap[resolvedBuilding] || null;
    
    // Unit ID would require room number and building-specific mapping
    // For now, we'll include room in metadata but not map to specific unitId
    const unitId = null; // In production: map roomNumber to actual unit ID
    
    return { propertyId, unitId, normalizedBuildingName: resolvedBuilding };
  }

  // Smart building name resolution with aliases and fuzzy matching
  private resolveBuildingName(input: string): string | null {
    const normalizedInput = input.trim().toLowerCase();

    // Building aliases map - handles how students actually talk
    const buildingAliases: Record<string, string> = {
      // Tang Hall variations
      'tang': 'Tang Hall',
      'tang hall': 'Tang Hall',
      
      // Next House variations  
      'next': 'Next House',
      'next house': 'Next House',
      
      // Simmons Hall variations
      'simmons': 'Simmons Hall',
      'simmons hall': 'Simmons Hall',
      
      // MacGregor House variations
      'macgregor': 'MacGregor House',
      'macgregor house': 'MacGregor House',
      'mac': 'MacGregor House',
      
      // Burton Conner variations
      'burton': 'Burton Conner',
      'burton conner': 'Burton Conner',
      'bc': 'Burton Conner',
      
      // New House variations
      'new': 'New House',
      'new house': 'New House',
      
      // Baker House variations
      'baker': 'Baker House',
      'baker house': 'Baker House',
      
      // McCormick Hall variations
      'mccormick': 'McCormick Hall',
      'mccormick hall': 'McCormick Hall',
      
      // Random Hall variations
      'random': 'Random Hall',
      'random hall': 'Random Hall',
      
      // Senior House variations
      'senior': 'Senior House',
      'senior house': 'Senior House',
      
      // Westgate variations
      'westgate': 'Westgate',
      
      // Ashdown House variations
      'ashdown': 'Ashdown House',
      'ashdown house': 'Ashdown House',
      
      // Sidney-Pacific variations
      'sidney': 'Sidney-Pacific',
      'sidney pacific': 'Sidney-Pacific',
      'sidney-pacific': 'Sidney-Pacific',
      'sp': 'Sidney-Pacific'
    };

    // Direct alias match
    const aliasMatch = buildingAliases[normalizedInput];
    if (aliasMatch) {
      return aliasMatch;
    }

    // Fuzzy matching for partial inputs
    for (const [alias, canonical] of Object.entries(buildingAliases)) {
      if (alias.includes(normalizedInput) || normalizedInput.includes(alias)) {
        // Additional check to avoid false positives with very short inputs
        if (normalizedInput.length >= 3) {
          return canonical;
        }
      }
    }

    // Return null if no match found - will trigger validation
    return null;
  }

  // Pre-process student message to extract and standardize location info
  private extractLocationFromMessage(message: string): { buildingName?: string; roomNumber?: string; confidence: 'high' | 'medium' | 'low' } {
    const normalizedMessage = message.toLowerCase();
    
    // Common patterns students use
    const patterns = [
      // "Tang 201", "Next 123", "Simmons 456"
      /\b(tang|next|simmons|macgregor|mac|burton|bc|new|baker|mccormick|random|senior|westgate|ashdown|sidney|sp)\s+(\d+[a-z]?)\b/gi,
      
      // "Tang Hall 201", "Next House 123"  
      /\b(tang hall|next house|simmons hall|macgregor house|burton conner|new house|baker house|mccormick hall|random hall|senior house|ashdown house|sidney pacific|sidney-pacific)\s+(\d+[a-z]?)\b/gi,
      
      // "I'm in Tang", "from Next"
      /\b(?:in|from|at)\s+(tang|next|simmons|macgregor|mac|burton|bc|new|baker|mccormick|random|senior|westgate|ashdown|sidney|sp)\b/gi,
      
      // "Tang Hall", "Next House" mentioned alone
      /\b(tang hall|next house|simmons hall|macgregor house|burton conner|new house|baker house|mccormick hall|random hall|senior house|westgate|ashdown house|sidney pacific|sidney-pacific)\b/gi
    ];

    let extractedBuilding: string | undefined;
    let extractedRoom: string | undefined;
    let confidence: 'high' | 'medium' | 'low' = 'low';

    for (const pattern of patterns) {
      const matches = Array.from(message.matchAll(pattern));
      if (matches.length > 0) {
        const match = matches[0];
        
        if (match[2]) {
          // Pattern with room number
          extractedBuilding = match[1];
          extractedRoom = match[2];
          confidence = 'high';
          break;
        } else if (match[1]) {
          // Pattern with building only
          extractedBuilding = match[1];
          confidence = confidence === 'low' ? 'medium' : confidence;
        }
      }
    }

    // Normalize the building name if found
    if (extractedBuilding) {
      const normalizedBuilding = this.resolveBuildingName(extractedBuilding);
      if (normalizedBuilding) {
        return {
          buildingName: normalizedBuilding,
          roomNumber: extractedRoom,
          confidence
        };
      }
    }

    return { confidence: 'low' };
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
      const { propertyId, unitId, normalizedBuildingName } = this.getMITPropertyMapping(locationData?.buildingName, locationData?.roomNumber);

      // Critical validation: Ensure we have valid property mapping
      if (!propertyId && locationData?.buildingName) {
        console.error(`⚠️ Failed to map building "${locationData.buildingName}" to property ID - ticket will be unroutable!`);
        throw new Error(`Unable to route maintenance request: Building "${locationData.buildingName}" not recognized. Please contact support.`);
      }

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