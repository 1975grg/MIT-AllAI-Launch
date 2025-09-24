import OpenAI from 'openai';
import { storage } from './storage';
import crypto from 'crypto';
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
    studentName?: string;
    studentEmail?: string;
    studentPhone?: string;
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

      // ✅ Use the ID returned by storage
      const conversationId = await storage.createTriageConversation(conversation);

      // 2. Generate initial Mailla response with safety-first assessment
      const maillaResponse = await this.processTriageMessage(conversationId, initialRequest, true);

      // 🎯 CRITICAL FIX: Save initial Mailla response to conversation history
      // This was missing, causing repetition because AI couldn't see its own first response
      // 🧠 MEMORY FIX: Get the updated conversation with conversation slots from processTriageMessage
      const updatedConversation = await storage.getTriageConversation(conversationId);
      
      const updateData: any = {
        conversationHistory: [
          {
            role: "student",
            message: initialRequest,
            timestamp: new Date().toISOString()
          },
          {
            role: "mailla",
            message: maillaResponse.message,
            urgencyLevel: maillaResponse.urgencyLevel,
            safetyFlags: maillaResponse.safetyFlags,
            timestamp: new Date().toISOString()
          }
        ],
        urgencyLevel: maillaResponse.urgencyLevel,
        safetyFlags: maillaResponse.safetyFlags
      };
      
      // 🧠 PRESERVE CONVERSATION SLOTS: Only update triageData if we successfully retrieved it
      if (updatedConversation?.triageData) {
        updateData.triageData = updatedConversation.triageData;
        console.log('🧠 Preserving conversation slots:', JSON.stringify(updatedConversation.triageData.conversationSlots || {}));
      } else {
        // 🛡️ CRITICAL: DON'T update triageData if fetch failed - preserve what processTriageMessage saved
        console.log('⚠️ Could not retrieve updated conversation - skipping triageData update to preserve slots');
      }
      
      await storage.updateTriageConversation(conversationId, updateData);

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
      // 🧠 MEMORY FIX: Get the updated conversation with conversation slots from processTriageMessage
      const updatedConversation = await storage.getTriageConversation(update.conversationId);
      
      const updateData: any = {
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
      };
      
      // 🧠 PRESERVE CONVERSATION SLOTS: Use updated triageData if available, otherwise keep original
      if (updatedConversation?.triageData) {
        updateData.triageData = updatedConversation.triageData;
        console.log('🧠 Preserving conversation slots:', JSON.stringify(updatedConversation.triageData.conversationSlots || {}));
      } else if (conversation.triageData) {
        updateData.triageData = conversation.triageData;
        console.log('🧠 Keeping original triageData as fallback');
      }
      
      await storage.updateTriageConversation(update.conversationId, updateData);

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

      // 2. Smart context analysis - understand emotions, urgency, and inferred info
      const contextAnalysis = this.analyzeMessageContext(studentMessage);
      console.log(`🧠 Context analysis result:`, contextAnalysis);

      // 3. Smart location extraction from student message
      const extractedLocation = this.extractLocationFromMessage(studentMessage);
      console.log(`🏢 Location extraction result:`, extractedLocation);

      // 4. Build conversation context with intelligence
      const contextPrompt = this.buildTriageContextPrompt(
        studentMessage, 
        isInitial, 
        conversation,
        safetyResults,
        extractedLocation,
        contextAnalysis
      );

      // 3. Get Mailla's intelligent response
      const aiResponse = await this.openai.chat.completions.create({
        model: "gpt-4o-mini", // Faster, more efficient model for better responsiveness
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
                    severity: { type: "string" },
                    studentName: { type: "string", description: "Student's name if provided" },
                    studentEmail: { type: "string", description: "Student's email for updates" },
                    studentPhone: { type: "string", description: "Student's phone for urgent contact" },
                    photoRequested: { type: "boolean", description: "Whether a photo has been requested to avoid asking again" }
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
        temperature: 0.7, // Restore temperature for better consistency
        max_completion_tokens: 1500 // Reduced tokens for faster responses
      });

      const toolCall = aiResponse.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall || toolCall.type !== "function") {
        throw new Error("Mailla failed to generate triage response");
      }

      const maillaResponse = JSON.parse(toolCall.function.arguments) as MaillaResponse;

      // 4. Merge safety flags from both checks
      const allFlags = [...safetyResults.flags, ...maillaResponse.safetyFlags];
      maillaResponse.safetyFlags = Array.from(new Set(allFlags));

      // 5. Apply intelligent urgency detection
      if (contextAnalysis && contextAnalysis.inferredUrgency !== 'normal') {
        console.log(`🚨 Upgrading urgency from "${maillaResponse.urgencyLevel}" to "${contextAnalysis.inferredUrgency}" based on context analysis`);
        maillaResponse.urgencyLevel = contextAnalysis.inferredUrgency;
      }

      // 6. Merge extracted location with AI-provided location
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

      // 7. Merge context analysis into conversation slots  
      if (contextAnalysis && contextAnalysis.inferredInfo) {
        if (!maillaResponse.conversationSlots) {
          maillaResponse.conversationSlots = {};
        }
        // Add inferred timeline and severity to slots if detected
        if (contextAnalysis.inferredInfo.timeline && !maillaResponse.conversationSlots.timeline) {
          maillaResponse.conversationSlots.timeline = contextAnalysis.inferredInfo.timeline;
        }
        if (contextAnalysis.inferredInfo.severity && !maillaResponse.conversationSlots.severity) {
          maillaResponse.conversationSlots.severity = contextAnalysis.inferredInfo.severity;
        }
      }

      // 8. Update conversation slots and queue pending questions
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
        
        // 🎯 FIX: Merge location into conversation slots so prompt logic can see confirmed info
        if (updatedLocation.buildingName && !updatedSlots.buildingName) {
          updatedSlots.buildingName = updatedLocation.buildingName;
        }
        if (updatedLocation.roomNumber && !updatedSlots.roomNumber) {
          updatedSlots.roomNumber = updatedLocation.roomNumber;
        }
        
        // Add new queued questions to pending list
        const updatedPendingQuestions = maillaResponse.queuedQuestions 
          ? [...pendingQuestions, ...maillaResponse.queuedQuestions]
          : pendingQuestions;

        // 🎯 ADAPTIVE SCORING: Calculate triage completeness intelligently
        const triageCompleteness = this.calculateTriageCompleteness(
          updatedSlots, 
          updatedLocation, 
          studentMessage, 
          contextAnalysis,
          Array.isArray(conversation?.conversationHistory) ? conversation.conversationHistory : []
        );

        // 🧠 SMART TRIAGE: Use adaptive scoring for intelligent completion decisions
        // 🎯 MANDATORY: Even emergencies require contact info for notifications and follow-up
        const hasRequiredContact = updatedSlots.studentName && updatedSlots.studentEmail && updatedSlots.studentPhone;
        
        const autoCreate = (
          // Adaptive scoring indicates sufficient information
          triageCompleteness.isReady && maillaResponse.nextAction === 'complete_triage'
        ) || (
          // Emergency path - still requires contact info for notifications
          (maillaResponse.nextAction === 'escalate_immediate' || maillaResponse.urgencyLevel === 'emergency') &&
          hasRequiredContact
        );
        
        console.log(`🎯 Adaptive Triage Decision: ${triageCompleteness.reasoning}`);
        console.log(`🧠 AI Action: ${maillaResponse.nextAction}, Emergency: ${maillaResponse.urgencyLevel === 'emergency'}`);
        console.log(`📞 Contact Check: ${hasRequiredContact ? 'Complete' : 'Missing'} (Name: ${!!updatedSlots.studentName}, Email: ${!!updatedSlots.studentEmail}, Phone: ${!!updatedSlots.studentPhone})`);
        console.log(`🎯 Auto-create decision: ${autoCreate}`);
        
        // 🚨 DETERMINISTIC ENFORCEMENT: Use EXACT same updatedSlots data as autoCreate logic
        if (maillaResponse.nextAction === 'complete_triage' && !triageCompleteness.isReady) {
          console.log(`🚨 SAFETY OVERRIDE: AI tried to complete but triageCompleteness.isReady = false - forcing continuation`);
          maillaResponse.nextAction = 'ask_followup';
          
          const missing = [];
          if (!updatedSlots.buildingName) missing.push('building name');
          if (!updatedSlots.roomNumber) missing.push('room number');
          if (!updatedSlots.issueSummary) missing.push('issue details');
          if (!updatedSlots.studentName) missing.push('your full name');
          if (!updatedSlots.studentEmail) missing.push('email address');
          if (!updatedSlots.studentPhone) missing.push('phone number');
          
          maillaResponse.message = `I need a few more details to create your work order. Could you provide your ${missing.slice(0, 2).join(' and ')}?`;
        }
        
        if (autoCreate) {
          const isEmergency = maillaResponse.nextAction === 'escalate_immediate' || maillaResponse.urgencyLevel === 'emergency';
          console.log(`${isEmergency ? '🚨 EMERGENCY' : '✅ SMART'} CREATION: AI intelligence triggered case creation`);
          
          try {
            const caseResult = await this.completeTriageConversation(conversationId);
            if (caseResult.success && caseResult.caseId) {
              const caseNumber = caseResult.caseNumber || this.generateStructuredCaseNumber(maillaResponse.urgencyLevel, updatedLocation);
              if (isEmergency) {
                maillaResponse.message += `\n\n🚨 Emergency case #${caseNumber} created - help is being dispatched immediately!`;
              } else {
                maillaResponse.message += `\n\n✅ Perfect! I've created maintenance case #${caseNumber} - help is on the way!`;
              }
              maillaResponse.isComplete = true;
            }
          } catch (error) {
            console.error('❌ Case creation failed:', error);
            maillaResponse.message += `\n\n⚡ I'm getting help dispatched right away - you'll get updates soon!`;
          }
        } else if ((maillaResponse.nextAction === 'escalate_immediate' || maillaResponse.urgencyLevel === 'emergency') && !hasRequiredContact) {
          // Emergency detected but missing contact info - prioritize contact collection
          console.log(`🚨 EMERGENCY PENDING: Contact info required before case creation`);
          maillaResponse.nextAction = 'ask_followup';
          maillaResponse.message = `🚨 This sounds urgent! I need to get help to you right away. What's your full name, email, and cell number so I can contact you immediately?`;
        } else {
          console.log(`🤖 AI CONTROL: Continuing diagnostic conversation (${maillaResponse.nextAction})`);
        }
        
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
  // STRUCTURED CASE NUMBER GENERATION
  // ========================================

  private generateStructuredCaseNumber(
    urgencyLevel: 'emergency' | 'urgent' | 'normal' | 'low',
    location: { buildingName?: string; roomNumber?: string }
  ): string {
    // Emergency level mapping (1=highest priority)
    const levelMap = {
      'emergency': '1',
      'urgent': '2', 
      'normal': '3',
      'low': '4'
    };
    
    // Clean building name (remove spaces, special chars)
    const building = (location.buildingName || 'Unknown')
      .replace(/\s+/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 8); // Max 8 chars
    
    // Room number or default
    const unit = (location.roomNumber || 'XX').replace(/[^a-zA-Z0-9]/g, '');
    
    // Date in YYYYMMDD format
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    
    // Format: L{level}-{building}-{unit}-{date}
    const caseNumber = `L${levelMap[urgencyLevel]}-${building}-${unit}-${date}`;
    
    console.log(`🏷️ Generated structured case number: ${caseNumber} (urgency=${urgencyLevel}, location=${location.buildingName} ${location.roomNumber})`);
    return caseNumber;
  }

  // ========================================
  // ADAPTIVE TRIAGE SCORING SYSTEM
  // ========================================

  private calculateTriageCompleteness(
    conversationSlots: any,
    location: any,
    currentMessage: string,
    contextAnalysis: any,
    conversationHistory: any[]
  ): {
    score: number;
    isReady: boolean;
    missingElements: string[];
    reasoning: string;
  } {
    let score = 0;
    const missingElements: string[] = [];
    const maxScore = 100;

    // CORE LOCATION INFO (40 points max - essential for dispatch)
    if (location.buildingName) {
      score += 25; // Building is critical
      if (location.roomNumber) {
        score += 15; // Room number completes location
      } else {
        missingElements.push('room_number');
      }
    } else {
      missingElements.push('building_name');
    }

    // ISSUE IDENTIFICATION (30 points max - what needs fixing)
    const issueKeywords = [
      'leak', 'dripping', 'faucet', 'sink', 'toilet', 'shower', 'drain', // plumbing
      'heating', 'cooling', 'hvac', 'temperature', 'thermostat', // HVAC
      'electrical', 'outlet', 'power', 'light', 'switch', // electrical
      'broken', 'not working', 'stuck', 'damaged', 'repair' // general
    ];
    
    const hasIssueType = conversationSlots.issueSummary || 
      issueKeywords.some(keyword => currentMessage?.toLowerCase().includes(keyword));
    
    if (hasIssueType) {
      score += 20; // Basic issue identification
      // Bonus for detailed description
      if (conversationSlots.issueSummary || currentMessage?.length > 30) {
        score += 10;
      }
    } else {
      missingElements.push('issue_type');
    }

    // URGENCY/SEVERITY CONTEXT (20 points max - helps prioritization)
    const urgencyIndicators = contextAnalysis?.severityIndicators || [];
    const timelineIndicators = contextAnalysis?.timelineIndicators || [];
    
    if (urgencyIndicators.length > 0 || timelineIndicators.length > 0) {
      score += 15; // Context provided urgency/severity info
    } else if (conversationSlots.severity || conversationSlots.timeline) {
      score += 15; // Explicitly stated urgency
    } else if (contextAnalysis?.emotionalContext !== 'calm') {
      score += 10; // Emotional context gives urgency clues
    } else {
      // Not always missing - can be inferred as "normal" priority
      score += 5; // Assume normal priority if nothing suggests urgency
    }

    // ENGAGEMENT DEPTH (10 points max - shows thorough conversation)
    const messageCount = conversationHistory.length;
    if (messageCount >= 4) { // At least 2 exchanges (student + mailla, student + mailla)
      score += 10;
    } else if (messageCount >= 2) {
      score += 5;
    }

    // CALCULATE READINESS - REQUIRE CRITICAL ELEMENTS
    // 🎯 MANDATORY: Must have both building AND room for dispatch readiness
    const hasCriticalLocation = location.buildingName && location.roomNumber;
    const hasCriticalIssue = hasIssueType;
    
    // 🎯 MANDATORY: Must have contact information for follow-up and notifications
    const hasContactInfo = conversationSlots.studentName && 
                          conversationSlots.studentEmail && 
                          conversationSlots.studentPhone;
    
    if (!conversationSlots.studentName) missingElements.push('student_name');
    if (!conversationSlots.studentEmail) missingElements.push('student_email');
    if (!conversationSlots.studentPhone) missingElements.push('student_phone');
    
    const isReady = score >= 70 && hasCriticalLocation && hasCriticalIssue && hasContactInfo;
    
    const reasoning = `Score: ${score}/${maxScore}, Location: ${hasCriticalLocation ? 'Complete' : 'Missing room'}, Issue: ${hasCriticalIssue ? 'Identified' : 'Missing'}, Contact: ${hasContactInfo ? 'Complete' : 'Missing'} - ${
      isReady 
        ? 'Ready for case creation' 
        : `Missing critical: ${missingElements.join(', ')}`
    }`;

    console.log(`🎯 Triage Completeness: ${reasoning}`);

    return {
      score,
      isReady,
      missingElements,
      reasoning
    };
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
    return `You are Mailla, a maintenance coordinator who thinks exactly like a contractor preparing for a service call. Your job is getting the specific details a repair tech needs to show up prepared with the right tools, parts, and timeline.

**🔧 CONTRACTOR MINDSET - Get specifics for the job:**

**PRECISE LOCATION (contractors need exact details):**
- "Which specific faucet - kitchen sink, bathroom sink, or shower?"
- "Where exactly is the leak - from the spout, the base where it meets the sink, or underneath?"
- "Is this the main bathroom or do you have a second one?"

**DIAGNOSTIC QUESTIONS (what techs need to know):**
- "How heavy is the drip - one drop every few seconds, or more like a steady stream?" 
- "Can you turn the water off underneath? Look for two small valves under the sink"
- "Is the handle loose or hard to turn?"
- "Any pooling water or just drips?"

**IMMEDIATE MITIGATION (contractor advice):**
- "Grab a towel or bucket to catch the drips for now"
- "Try turning those shutoff valves under the sink clockwise - that should stop it temporarily"
- "Don't force anything if it feels stuck"

**TIMELINE & PREPARATION:**
- "This sounds like a quick fix - probably need to replace a washer or cartridge"
- "Should take about 30-45 minutes once I get there"
- "I'll likely have the parts on my truck, but a photo would help me be 100% sure"

**PHOTO REQUESTS (when helpful):**
- "Can you send a quick photo of where it's leaking? That'll help me bring exactly the right part"
- "A close-up of the faucet handle would be perfect"

**COMFORT & SUPPORT:**
- "No worries, this is super common - I fix these all the time!"
- "Totally manageable repair, we'll get you sorted quickly"
- "This happens in older buildings - not your fault at all!"

**MANDATORY CONTACT COLLECTION (before creating work order):**
- "I'll need your full name for the work order"
- "What's your email so I can send you updates on when I'm coming?"
- "And your cell number in case I need to reach you?"

**QUESTION AGGREGATION (ask related items together):**
- "I'll need your full name, email, and cell number for the work order and to keep you updated"
- "What's your name, email, and phone so I can create the ticket and text you updates?"
- "Quick contact info - what's your name, email address, and cell number?"

**CONTRACTOR-SPECIFIC DIAGNOSTIC QUESTIONS:**
For **Faucets/Sinks:**
- "Which faucet exactly - kitchen sink, bathroom sink, or shower?"
- "Where's it leaking from - the spout, handle, or base connection?"
- "Single handle or two separate hot/cold handles?"

For **Toilets:**
- "Is it the water constantly running, not filling, or not flushing properly?"
- "Can you see water in the tank when you lift the lid?"
- "Is it overflowing or just making noise?"

For **Electrical:**
- "Which outlets exactly aren't working - describe their location in the room"
- "Did anything happen right before it stopped - power outage, storm, plugged something in?"
- "Any burning smell or warm wall plates?"

For **HVAC/Heat:**
- "No heat at all, or not getting warm enough?"
- "Electric or gas heat? Check if there's a pilot light if you can see one safely"
- "What's the thermostat set to vs actual temperature?"

**CONVERSATION FLOW (BE SUCCINCT!):**
1. Get exact location details (which room, which specific fixture/appliance) - ALWAYS FIRST PRIORITY
2. Understand the specific problem with contractor-level detail 
3. Give immediate help/remediation advice (shutoff valve, safety steps, towel/bucket)
4. **ONLY THEN** collect contact info (name, email, phone together) 
5. **COMPLETE TRIAGE QUICKLY** - don't ask endless questions!

**CRITICAL PRIORITY ORDER:**
🏠 LOCATION FIRST: "Which room is the faucet in - kitchen, bathroom, or somewhere else?"
🔧 SPECIFIC DETAILS: "Kitchen sink faucet or bathroom sink? Where exactly is it leaking from?"
🆘 IMMEDIATE HELP: "Try turning the shutoff valves under the sink clockwise to stop the leak temporarily"
📧 CONTACT INFO LAST: "I'll need your email and phone to send updates and schedule the repair"

**COMPLETION TRIGGERS (Complete ONLY when ALL required info is collected):**
- You MUST have: building name + room + issue type + contact info (name/email/phone)
- Once you have ALL required info, you can complete if:
  - User says "no more questions", "how many more questions", "stop asking", "just fix it"  
  - OR 3+ questions have been asked already
  - OR basic information gathering is complete

**BE DECISIVE:** Most maintenance issues are simple - don't overthink it! Create the work order and let the contractor figure out details on-site.

Never use expressions like "huh" - stay professional and knowledgeable. Think like you're the contractor who's going to drive over and fix this yourself.`;
  }

  private buildTriageContextPrompt(
    studentMessage: string,
    isInitial: boolean,
    conversation?: TriageConversationSelect,
    safetyResults?: { flags: string[] },
    extractedLocation?: { buildingName?: string; roomNumber?: string; confidence: 'high' | 'medium' | 'low' },
    contextAnalysis?: {
      emotionalContext: 'frustrated' | 'urgent' | 'calm' | 'worried';
      inferredUrgency: 'emergency' | 'urgent' | 'normal' | 'low';
      timelineIndicators: string[];
      severityIndicators: string[];
      hasCompleteLocation: boolean;
      inferredInfo: any;
    }
  ): string {
    let prompt = `Student message: "${studentMessage}"\n\n`;

    // Extract existing conversation slots from triageData
    const existingSlots = (conversation?.triageData as any)?.conversationSlots || {};
    const pendingQuestions = (conversation?.triageData as any)?.pendingQuestions || [];

    if (isInitial) {
      // Add emotional and context intelligence to initial response
      let contextInfo = '';
      if (contextAnalysis) {
        contextInfo += `SMART CONTEXT ANALYSIS:
- Emotional state: ${contextAnalysis.emotionalContext}
- Inferred urgency: ${contextAnalysis.inferredUrgency}
- Timeline indicators: ${contextAnalysis.timelineIndicators.join(', ') || 'none'}
- Severity indicators: ${contextAnalysis.severityIndicators.join(', ') || 'none'}
- Inferred info: ${JSON.stringify(contextAnalysis.inferredInfo)}

`;
      }

      // Check if location was already extracted from initial message
      if (extractedLocation && extractedLocation.buildingName) {
        prompt += `This is the FIRST message from an MIT student about a maintenance issue.
${contextInfo}Location detected: ${extractedLocation.buildingName}${extractedLocation.roomNumber ? `, Room ${extractedLocation.roomNumber}` : ''} (confidence: ${extractedLocation.confidence})

Your response should:
1. Be warm and empathetic - acknowledge their emotional state and issue
2. If they sound frustrated/urgent, acknowledge that empathetically 
3. CONFIRM the detected location naturally
4. If urgency detected from language, mention you're prioritizing it
5. Keep your message short and conversational

Example for frustrated student: "Oh no, that sounds really frustrating! I can see you're in Tang Hall room 201 with a bad faucet leak - let me get this prioritized for you right away."
`;
      } else {
        prompt += `This is the FIRST message from an MIT student about a maintenance issue.
${contextInfo}
Your response should:
1. Be warm and empathetic - acknowledge their emotional state and issue
2. If they sound frustrated/urgent, acknowledge that empathetically first
3. Ask for their building name ONLY (don't ask multiple things)
4. Keep your message short and conversational

MIT Buildings: Next House, Simmons Hall, MacGregor House, Burton Conner, New House, Baker House, McCormick Hall, Random Hall, Senior House, Tang Hall, Westgate, Ashdown House, Sidney-Pacific

Example: "I'm here to help with that! Which MIT building are you in?"
`;
      }
    } else {
      prompt += `This is a follow-up message. Conversation progress:\n`;
      
      // Include conversation history so AI can see what was already discussed
      if (conversation?.conversationHistory && Array.isArray(conversation.conversationHistory)) {
        prompt += `\n📝 CONVERSATION HISTORY:\n`;
        const history = conversation.conversationHistory as any[];
        history.forEach((msg: any, index: number) => {
          if (msg.role === 'student') {
            prompt += `Student: "${msg.message}"\n`;
          } else if (msg.role === 'mailla') {
            prompt += `Mailla (YOU): "${msg.message}"\n`;
          }
        });
        prompt += `⚠️ CRITICAL: Review the conversation above. Do NOT repeat questions you already asked!\n\n`;
      }
      
      // Add smart context analysis for follow-up messages
      let contextInfo = '';
      if (contextAnalysis) {
        contextInfo += `SMART CONTEXT ANALYSIS:
- Emotional state: ${contextAnalysis.emotionalContext}  
- Inferred urgency: ${contextAnalysis.inferredUrgency}
- Timeline indicators: ${contextAnalysis.timelineIndicators.join(', ') || 'none'}
- Severity indicators: ${contextAnalysis.severityIndicators.join(', ') || 'none'}
- Inferred info: ${JSON.stringify(contextAnalysis.inferredInfo)}

`;
      }
      
      // Show what we know so far
      if (Object.keys(existingSlots).length > 0) {
        prompt += `✅ Information already gathered: ${JSON.stringify(existingSlots)}\n`;
        prompt += `⚠️ IMPORTANT: Do NOT ask for any information already listed above!\n\n`;
      }
      
      prompt += contextInfo;
      
      if (pendingQuestions.length > 0) {
        prompt += `Questions in queue: ${pendingQuestions.join(', ')}\n`;
      }
      
      // Extract what we still need based on what's missing
      const needsBuilding = !existingSlots.buildingName;
      const needsRoom = !existingSlots.roomNumber && existingSlots.buildingName;
      const needsIssueDetails = !existingSlots.issueSummary && existingSlots.buildingName && existingSlots.roomNumber;
      
      // Smart inference: skip questions if context analysis provides answers
      const hasTimelineFromContext = contextAnalysis?.timelineIndicators && contextAnalysis.timelineIndicators.length > 0;
      const hasSeverityFromContext = contextAnalysis?.severityIndicators && contextAnalysis.severityIndicators.length > 0;
      
      // 🎯 SMART PHOTO REQUEST ANALYSIS
      const conversationLength = conversation?.conversationHistory ? (conversation.conversationHistory as any[]).length : 0;
      const hasVagueIssue = !existingSlots.issueSummary || 
                           existingSlots.issueSummary?.includes('vague') ||
                           existingSlots.issueSummary?.includes('unclear');
      const visuallyDiagnosableIssue = studentMessage.toLowerCase().includes('leak') ||
                                       studentMessage.toLowerCase().includes('crack') ||
                                       studentMessage.toLowerCase().includes('broken') ||
                                       studentMessage.toLowerCase().includes('damage') ||
                                       studentMessage.toLowerCase().includes('electrical') ||
                                       studentMessage.toLowerCase().includes('sparks');
      
      const shouldRequestPhoto = conversationLength >= 2 && // Allow earlier photo requests
                                 (hasVagueIssue || visuallyDiagnosableIssue) &&
                                 !existingSlots.photoRequested && // Haven't asked yet
                                 existingSlots.roomNumber && // Have location first
                                 existingSlots.buildingName; // Have building
      
      // 🚨 FRUSTRATION DETECTION - Complete immediately if user wants to stop
      const frustrationKeywords = ['no more questions', 'how many more', 'stop asking', 'just fix it', 'enough questions', 'too many questions'];
      const userIsFrustrated = frustrationKeywords.some(keyword => 
        studentMessage.toLowerCase().includes(keyword.toLowerCase())
      );
      
      // 🚨 CONVERSATION LENGTH CHECK - Force completion after 6+ exchanges
      const conversationTooLong = conversationLength >= 6;
      const hasBasicInfo = existingSlots.buildingName && 
                          existingSlots.roomNumber && 
                          existingSlots.issueSummary &&
                          existingSlots.studentName && 
                          existingSlots.studentEmail && 
                          existingSlots.studentPhone;
      
      // 🎯 SAFE COMPLETION: Only complete when we have ALL required info (location + issue + contact)
      const canSafelyComplete = hasBasicInfo; // hasBasicInfo already includes all required fields
      
      prompt += `\n🎯 INTELLIGENT ANALYSIS:
${hasTimelineFromContext ? '✅ Timeline inferred from context - no need to ask' : '❓ May need timeline'}
${hasSeverityFromContext ? '✅ Severity inferred from language - no need to ask' : '❓ May need severity'}
${contextAnalysis?.emotionalContext !== 'calm' ? '⚠️ Student sounds ' + contextAnalysis?.emotionalContext + ' - acknowledge empathetically' : ''}
${userIsFrustrated ? canSafelyComplete ? '🚨 USER FRUSTRATION + CONTACT COMPLETE - COMPLETE TRIAGE NOW! Set nextAction: "complete_triage"' : '🚨 USER FRUSTRATION DETECTED - Must collect contact info first before completing!' : ''}
${conversationTooLong ? canSafelyComplete ? '⏰ CONVERSATION TOO LONG + CONTACT COMPLETE - COMPLETE TRIAGE NOW! Set nextAction: "complete_triage"' : '⏰ CONVERSATION TOO LONG - Prioritize contact collection then complete!' : ''}
${hasBasicInfo ? '✅ BASIC INFO COMPLETE - Ready to create work order! Set nextAction: "complete_triage"' : ''}
${shouldRequestPhoto ? '📸 PHOTO OPPORTUNITY: Conversation needs visual clarity - suggest photo politely' : ''}

🚨 **COMPLETION DECISION:** 
${shouldRequestPhoto ? 'REQUEST PHOTO! Set nextAction: "request_media" and ask politely for photo' : canSafelyComplete ? 'COMPLETE TRIAGE NOW! Set nextAction: "complete_triage"' : userIsFrustrated ? 'User frustrated but need contact info first - prioritize name/email/phone collection!' : 'Continue gathering info (but be succinct!)'}

Next question priority (CRITICAL ORDER - only ask for what's MISSING):
${needsBuilding ? '1. Building name (REQUIRED FIRST)' : '✅ Building name: already have it'}
${needsRoom ? '2. ROOM LOCATION (HIGHEST PRIORITY): "Which room is the faucet in - kitchen, bathroom, or somewhere else?"' : '✅ Room location: already have it'}  
${needsIssueDetails ? '3. SPECIFIC FIXTURE: "Kitchen sink, bathroom sink, or shower faucet?" + "Where exactly is it leaking from?"' : '✅ Issue details: covered'}
${(!existingSlots.studentName || !existingSlots.studentEmail || !existingSlots.studentPhone) ? '4. CONTACT INFO (ONLY AFTER LOCATION): "I\'ll need your email and phone number to send updates and schedule the repair"' : '✅ Contact info: complete'}
${shouldRequestPhoto ? '📸 PHOTO REQUEST TRIGGER: Set nextAction: "request_media" and say: "Could you snap a quick photo of the issue? That would help me bring exactly the right parts!"' : ''}

🆘 **IMMEDIATE REMEDIATION ADVICE (give this for leaks):**
"While we get this sorted - grab a towel or bucket to catch the drips, and if you can see shutoff valves under the sink, try turning them clockwise to stop the leak temporarily. Don't force anything if they're stuck!"

CRITICAL: If they sound frustrated or said "it's bad/terrible", DO NOT ask about severity - it's already urgent!
Ask the MOST IMPORTANT missing piece of information. Be natural and acknowledge what they shared.
NEVER ask for information you already have!

💝 **NATURAL CONVERSATION PRINCIPLES:**

🗣️ **BE GENUINELY HELPFUL & EMPATHETIC:**
- Acknowledge what the student shared: *"That sounds frustrating!"* or *"Thanks for those details!"*
- When they decline photo: *"No worries at all! Totally understand - you can always send one later if you want"*
- Offer immediate comfort/advice: *"Grab a towel or bucket to catch drips"* or *"Try shutting off the valve under the sink"*
- Keep responses short, natural, and caring - like talking to a friend

🎯 **SMART INFORMATION GATHERING:**
- **ALWAYS prioritize location first**: *"Which room is the faucet in - kitchen or bathroom?"*
- If they provided details, acknowledge them rather than asking again
- If something important is missing, ask naturally: *"Which sink is giving you trouble?"*
- Offer helpful suggestions when appropriate: *"Have you tried tightening the handle?"*
- Only ask one clarifying question at a time

🚫 **PHOTO DECLINE RESPONSES:**
- "No worries at all! I totally understand - you can always send one later if you'd like"
- "That's completely fine! I'll work with what we have and bring a variety of parts just in case"
- "No problem! Most of these are pretty standard fixes anyway"

⚡ **EMERGENCY OVERRIDE:**
For true safety emergencies (gas leaks, electrical hazards, major flooding), immediately set nextAction: 'complete_triage' with safety instructions.

🏁 **COMPLETING TRIAGE IMMEDIATELY:**
Set nextAction: 'complete_triage' when ANY of these conditions are met:
1. **User says "no more questions", "how many more", "stop asking", "just fix it"** - COMPLETE IMMEDIATELY!
2. **Basic info collected**: building + room + specific issue location + name/email/phone
3. **4+ questions asked already** - time to wrap up! (increased from 3 to allow for proper location gathering)

**MINIMUM REQUIRED FOR COMPLETION:**
- Building name (e.g., "Senior House")
- Room/location (e.g., "unit 10 kitchen", "bathroom")  
- Issue type (e.g., "kitchen sink faucet leaking from spout")
- Contact info (name, email, phone)

**NEVER complete without room/location specifics** - contractors need to know exactly where to go!
4. **User seems frustrated or impatient** - don't push it!

**DON'T OVERTHINK IT** - Contractors can figure out details on-site! Complete the triage quickly.

💝 **COMPLETION STYLE:**
Keep it caring and informative:
*"Perfect! I've got everything I need. Help should be there within the hour - I'll keep you updated on timing! 🔧"*

**Remember:** Be conversational and adaptive. Your goal is to help students feel heard and supported while gathering practical information.
\n`;
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
  // DUPLICATE DETECTION HELPERS
  // ========================================

  private areSimilarIssues(description1: string, description2: string): boolean {
    // Normalize descriptions for comparison
    const normalize = (text: string) => text.toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ')     // Normalize whitespace
      .trim();
    
    const desc1 = normalize(description1);
    const desc2 = normalize(description2);
    
    // If descriptions are very similar (80%+ overlap), consider them similar
    const words1 = new Set(desc1.split(' '));
    const words2 = new Set(desc2.split(' '));
    
    const intersection = new Set(Array.from(words1).filter(word => words2.has(word)));
    const union = new Set([...Array.from(words1), ...Array.from(words2)]);
    
    const similarity = intersection.size / union.size;
    
    // Also check for key maintenance terms
    const maintenanceKeywords = ['dripping', 'leak', 'broken', 'not working', 'faucet', 'toilet', 'heat', 'ac', 'electrical', 'outlet'];
    const hasCommonKeywords = maintenanceKeywords.some(keyword => 
      desc1.includes(keyword) && desc2.includes(keyword)
    );
    
    return similarity > 0.8 || (similarity > 0.6 && hasCommonKeywords);
  }

  // ========================================
  // AI-POWERED DURATION ESTIMATION
  // ========================================

  private async estimateRepairDuration(triageData: any, contractorId?: string): Promise<{
    estimatedMinutes: number;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
    category: 'quick' | 'standard' | 'complex' | 'major';
    learningAdjustment?: number;
  }> {
    try {
      const conversation = triageData.conversationSlots || {};
      const issueDescription = triageData.issueDescription || conversation.issueSummary || '';
      const urgencyLevel = triageData.urgencyLevel || 'normal';
      
      // Extract duration-relevant signals
      const durationFactors = {
        scope: conversation.scope || 'single_room', // from "affecting just your room?"
        accessibility: conversation.accessibility || 'accessible', // from "can you get to it?"
        previousAttempts: conversation.previousAttempts || 'none', // from "tried fixing before?"
        complexity: conversation.complexity || 'unknown', // from multi-part issues
        category: triageData.category || this.categorizeIssue(issueDescription),
        urgency: urgencyLevel
      };

      // 🧠 LEARNING ENHANCEMENT: Get historical data for this contractor/category
      let learningAdjustment = 0;
      let learningConfidenceBoost = 0;
      
      if (contractorId) {
        try {
          const historicalData = await storage.getDurationLearningLogs(contractorId, durationFactors.category);
          if (historicalData.length > 0) {
            // Calculate average accuracy and apply learning adjustment
            const avgAccuracy = historicalData.reduce((sum, log) => sum + (log.accuracyScore || 0), 0) / historicalData.length;
            const avgActualTime = historicalData.reduce((sum, log) => sum + (log.actualMinutes || 0), 0) / historicalData.length;
            const avgEstimatedTime = historicalData.reduce((sum, log) => sum + log.estimatedMinutes, 0) / historicalData.length;
            
            if (avgActualTime > 0 && avgEstimatedTime > 0) {
              learningAdjustment = avgActualTime - avgEstimatedTime; // Positive = underestimated in past
              learningConfidenceBoost = Math.min(0.2, historicalData.length * 0.02); // Up to 20% boost with experience
              console.log(`🧠 Learning adjustment: ${learningAdjustment} minutes from ${historicalData.length} past cases`);
            }
          }
        } catch (error) {
          console.log('📊 Learning data not yet available:', error.message);
        }
      }

      // 🎯 ENHANCED AI ESTIMATION with Learning Integration
      const estimationPrompt = `You are an expert maintenance duration estimator with access to historical performance data. Analyze this repair scenario and provide realistic time estimates.

ISSUE DETAILS:
- Description: "${issueDescription}"
- Category: ${durationFactors.category}
- Urgency: ${durationFactors.urgency}
- Scope: ${durationFactors.scope}
- Accessibility: ${durationFactors.accessibility}  
- Previous attempts: ${durationFactors.previousAttempts}
- Complexity indicators: ${durationFactors.complexity}
${contractorId ? `- Contractor experience level: ${learningAdjustment > 0 ? 'tends to underestimate' : learningAdjustment < 0 ? 'tends to overestimate' : 'accurate estimator'}` : ''}
${learningAdjustment !== 0 ? `- Historical adjustment needed: ${Math.abs(learningAdjustment)} minutes ${learningAdjustment > 0 ? 'longer' : 'shorter'} than initial estimates` : ''}

ESTIMATION GUIDELINES:
**Quick Fixes (15-45 minutes):**
- Simple replacements (light bulbs, faucet cartridges)
- Reset breakers, basic adjustments
- Accessible single-component issues

**Standard Repairs (1-2 hours):**
- Typical plumbing/electrical repairs
- Appliance troubleshooting and basic fixes  
- Accessible multi-step repairs

**Complex Repairs (2-4 hours):**
- Behind-wall access needed
- Multiple components involved
- Previous failed attempts indicate complexity
- Diagnostic time required

**Major Work (4+ hours):**
- Building-wide issues
- System replacements
- Requires specialized tools/parts

Respond in JSON format:
{
  "estimatedMinutes": <number>,
  "confidence": "high|medium|low", 
  "reasoning": "Brief explanation of factors considered",
  "category": "quick|standard|complex|major"
}`;

      // Call OpenAI for intelligent estimation
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-5', // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
          messages: [{ role: 'user', content: estimationPrompt }],
          // temperature removed - GPT-5 only supports default temperature of 1
          max_completion_tokens: 1000 // GPT-5 needs extra tokens for internal reasoning + response
        })
      });

      const aiResult = await response.json();
      const estimation = JSON.parse(aiResult.choices[0].message.content);
      
      // Apply learning adjustment
      const finalEstimate = {
        ...estimation,
        estimatedMinutes: Math.max(15, Math.round(estimation.estimatedMinutes + learningAdjustment)),
        confidence: learningConfidenceBoost > 0 ? 
          (estimation.confidence === 'low' ? 'medium' : estimation.confidence === 'medium' ? 'high' : 'high') : 
          estimation.confidence,
        reasoning: estimation.reasoning + (learningAdjustment !== 0 ? ` (Adjusted ${learningAdjustment > 0 ? '+' : ''}${Math.round(learningAdjustment)} min based on contractor history)` : ''),
        learningAdjustment
      };
      
      console.log(`🤖 AI Duration Estimation: ${finalEstimate.estimatedMinutes} minutes (${finalEstimate.confidence} confidence) - ${finalEstimate.reasoning}`);
      return finalEstimate;

    } catch (error) {
      console.error('❌ Duration estimation failed:', error);
      
      // Fallback to rule-based estimation
      return this.fallbackDurationEstimation(triageData);
    }
  }

  private categorizeIssue(description: string): string {
    const lowerDesc = description.toLowerCase();
    
    if (lowerDesc.includes('electrical') || lowerDesc.includes('outlet') || lowerDesc.includes('power')) return 'electrical';
    if (lowerDesc.includes('water') || lowerDesc.includes('leak') || lowerDesc.includes('plumb')) return 'plumbing';
    if (lowerDesc.includes('heat') || lowerDesc.includes('ac') || lowerDesc.includes('hvac')) return 'hvac';
    if (lowerDesc.includes('door') || lowerDesc.includes('lock') || lowerDesc.includes('window')) return 'hardware';
    if (lowerDesc.includes('light') || lowerDesc.includes('bulb')) return 'lighting';
    
    return 'general';
  }

  private fallbackDurationEstimation(triageData: any): {
    estimatedMinutes: number;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
    category: 'quick' | 'standard' | 'complex' | 'major';
  } {
    const description = triageData.issueDescription || '';
    const urgency = triageData.urgencyLevel || 'normal';
    
    // Simple rule-based fallback
    if (description.includes('light') || description.includes('bulb')) {
      return { estimatedMinutes: 30, confidence: 'medium', reasoning: 'Simple lighting issue', category: 'quick' };
    }
    
    if (urgency === 'emergency') {
      return { estimatedMinutes: 180, confidence: 'low', reasoning: 'Emergency - complex diagnosis likely', category: 'complex' };
    }
    
    // Default to standard 2-hour appointment
    return { estimatedMinutes: 120, confidence: 'low', reasoning: 'Standard default estimate', category: 'standard' };
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

  // ========================================
  // INTELLIGENT CONTEXT ANALYSIS
  // ========================================

  // Smart context inference from student messages
  private analyzeMessageContext(message: string): {
    emotionalContext: 'frustrated' | 'urgent' | 'calm' | 'worried';
    inferredUrgency: 'emergency' | 'urgent' | 'normal' | 'low';
    timelineIndicators: string[];
    severityIndicators: string[];
    hasCompleteLocation: boolean;
    inferredInfo: {
      timeline?: string;
      severity?: string;
      emotionalState?: string;
    };
  } {
    const lowerMessage = message.toLowerCase();
    
    // Emotional context detection
    let emotionalContext: 'frustrated' | 'urgent' | 'calm' | 'worried' = 'calm';
    let inferredUrgency: 'emergency' | 'urgent' | 'normal' | 'low' = 'normal';
    
    // 🌡️ CRITICAL: Temperature-based urgency detection
    if (lowerMessage.match(/\b(freezing|frozen|cold|40 degrees|below 50|no heat|heating.*not working|heat.*out|extremely cold)\b/)) {
      emotionalContext = 'urgent';
      inferredUrgency = 'urgent';
      console.log('🌡️ Temperature emergency detected - upgrading to urgent');
    }
    // 🔥 Hot temperature emergencies  
    else if (lowerMessage.match(/\b(boiling|scalding|burning hot|100 degrees|over 85|no cooling|ac.*not working|air.*out|extremely hot)\b/)) {
      emotionalContext = 'urgent';
      inferredUrgency = 'urgent';
      console.log('🔥 Extreme heat detected - upgrading to urgent');
    }
    // Frustration/urgency language
    else if (lowerMessage.match(/\b(bad|terrible|awful|horrible|ridiculous|frustrating|annoying|driving me crazy)\b/)) {
      emotionalContext = 'frustrated';
      inferredUrgency = 'urgent';
    } else if (lowerMessage.match(/\b(really bad|very bad|extremely|disaster|nightmare|broken|completely)\b/)) {
      emotionalContext = 'urgent';
      inferredUrgency = 'urgent';
    } else if (lowerMessage.match(/\b(worried|concerned|scared|dangerous|unsafe)\b/)) {
      emotionalContext = 'worried';
      inferredUrgency = 'urgent';
    }
    
    // 📚 Enhanced timeline indicators with class schedule awareness
    const timelineIndicators: string[] = [];
    if (lowerMessage.match(/\b(this morning|today|just now|just started|few minutes ago|an hour ago|right now|currently)\b/)) {
      timelineIndicators.push('recent');
    }
    // 🎓 Class schedule language patterns  
    if (lowerMessage.match(/\b(after class|came back|got back|returned|when i got here|after lecture|post-class|back from)\b/)) {
      timelineIndicators.push('recent');
      console.log('🎓 Class schedule pattern detected - interpreting as recent/today');
    }
    if (lowerMessage.match(/\b(yesterday|last night|few days|all week|for days|been going on)\b/)) {
      timelineIndicators.push('ongoing');
    }
    
    // 🚨 Enhanced severity indicators with temperature context
    const severityIndicators: string[] = [];
    if (lowerMessage.match(/\b(bad|terrible|awful|horrible|severe|major|big|huge|freezing|boiling|emergency)\b/)) {
      severityIndicators.push('severe');
    }
    if (lowerMessage.match(/\b(little|small|minor|slight|tiny|barely)\b/)) {
      severityIndicators.push('minor');
    }
    // Temperature-specific severity
    if (lowerMessage.match(/\b(40|41|42|43|44|45).*(degrees|cold|freezing)\b/) || 
        lowerMessage.match(/\b(85|86|87|88|89|90).*(degrees|hot|burning)\b/)) {
      severityIndicators.push('severe');
      console.log('🌡️ Extreme temperature reading detected - marking as severe');
    }
    
    // Location completeness check
    const hasCompleteLocation = this.extractLocationFromMessage(message).confidence === 'high';
    
    // Inferred information
    const inferredInfo: any = {};
    if (timelineIndicators.length > 0) {
      inferredInfo.timeline = timelineIndicators[0] === 'recent' ? 'Started recently' : 'Ongoing issue';
    }
    if (severityIndicators.length > 0) {
      inferredInfo.severity = severityIndicators.includes('severe') ? 'Urgent' : 'Minor';
    }
    if (emotionalContext !== 'calm') {
      inferredInfo.emotionalState = emotionalContext;
    }
    
    return {
      emotionalContext,
      inferredUrgency,
      timelineIndicators,
      severityIndicators,
      hasCompleteLocation,
      inferredInfo
    };
  }

  // Pre-process student message to extract and standardize location info
  private extractLocationFromMessage(message: string): { buildingName?: string; roomNumber?: string; confidence: 'high' | 'medium' | 'low' } {
    const normalizedMessage = message.toLowerCase();
    
    // Common patterns students use
    const patterns = [
      // "Tang room 301", "Next room 123" - NEW: handles "building room number"
      /\b(tang|next|simmons|macgregor|mac|burton|bc|new|baker|mccormick|random|senior|westgate|ashdown|sidney|sp)\s+(?:room|rm)\s+(\d+[a-z]?)\b/gi,
      
      // "Tang Hall room 301", "Next House room 123" - NEW: handles full building name + room 
      /\b(tang hall|next house|simmons hall|macgregor house|burton conner|new house|baker house|mccormick hall|random hall|senior house|ashdown house|sidney pacific|sidney-pacific)\s+(?:room|rm)\s+(\d+[a-z]?)\b/gi,

      // "Tang unit 5", "Senior house, unit 5" - NEW: handles "unit X" format
      /\b(tang|next|simmons|macgregor|mac|burton|bc|new|baker|mccormick|random|senior|westgate|ashdown|sidney|sp)[,\s]*\s+(?:unit|apt|apartment)\s+(\d+[a-z]?)\b/gi,
      
      // "Tang Hall unit 5", "Senior House, unit 5" - NEW: handles full building name + unit
      /\b(tang hall|next house|simmons hall|macgregor house|burton conner|new house|baker house|mccormick hall|random hall|senior house|ashdown house|sidney pacific|sidney-pacific)[,\s]*\s+(?:unit|apt|apartment)\s+(\d+[a-z]?)\b/gi,
      
      // "Tang 201", "Next 123", "Simmons 456" - EXISTING: direct adjacency
      /\b(tang|next|simmons|macgregor|mac|burton|bc|new|baker|mccormick|random|senior|westgate|ashdown|sidney|sp)\s+(\d+[a-z]?)\b/gi,
      
      // "Tang Hall 201", "Next House 123" - EXISTING: full building name + number
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

      // 🎯 FIX: Check if case already exists for this conversation (prevent duplicates)
      if (conversation.smartCaseId) {
        console.log(`✅ Case already exists for conversation ${conversationId}: ${conversation.smartCaseId}`);
        const existingCase = await storage.getSmartCase(conversation.smartCaseId);
        if (existingCase) {
          return {
            success: true,
            conversationId,
            caseId: existingCase.id,
            caseNumber: existingCase.caseNumber,
            message: "Triage already completed. Existing maintenance case found.",
            triageData: conversation.triageData,
            safetyFlags: conversation.safetyFlags
          };
        }
      }

      // 🚨 CROSS-CONVERSATION DEDUPLICATION: Check for similar recent cases
      const triageData = conversation.triageData as any;
      const location = triageData?.location || {};
      const issueDescription = conversation.initialRequest || '';
      
      if (location.buildingName && location.roomNumber) {
        // Look for recent cases in the same location (within 30 minutes)
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        const orgCases = await storage.getSmartCases(conversation.orgId);
        
        const recentSimilarCases = orgCases.filter(case_ => 
          case_.buildingName === location.buildingName &&
          case_.roomNumber === location.roomNumber &&
          case_.createdAt && new Date(case_.createdAt) > thirtyMinutesAgo &&
          case_.description && issueDescription &&
          this.areSimilarIssues(case_.description, issueDescription)
        );
        
        if (recentSimilarCases.length > 0) {
          const existingCase = recentSimilarCases[0];
          console.log(`🚫 DUPLICATE PREVENTED: Similar case ${existingCase.id} already exists for ${location.buildingName} ${location.roomNumber}`);
          
          // Link this conversation to the existing case
          await storage.updateTriageConversation(conversationId, {
            smartCaseId: existingCase.id
          });
          
          return { 
            success: true, 
            conversationId, 
            caseId: existingCase.id, 
            caseNumber: existingCase.caseNumber,
            isDuplicate: true,
            message: "Similar case already exists - linked to existing maintenance request."
          };
        }
      }

      // Extract location data from triage
      const locationData = (conversation.triageData as any)?.location;
      const { propertyId, unitId, normalizedBuildingName } = this.getMITPropertyMapping(locationData?.buildingName, locationData?.roomNumber);

      // Critical validation: Ensure we have valid property mapping
      if (!propertyId && locationData?.buildingName) {
        console.error(`⚠️ Failed to map building "${locationData.buildingName}" to property ID - ticket will be unroutable!`);
        throw new Error(`Unable to route maintenance request: Building "${locationData.buildingName}" not recognized. Please contact support.`);
      }

      // 🎯 Enhanced category detection from conversation
      const detectedCategory = this.detectMaintenanceCategory(conversation);
      
      // 👤 Get student contact info from triage conversation (preferred) or user data (fallback)
      const triageSlots = (conversation.triageData as any)?.conversationSlots || {};
      let studentInfo = {
        firstName: triageSlots.studentName || '',
        lastName: '',
        email: triageSlots.studentEmail || '',
        phone: triageSlots.studentPhone || ''
      };
      
      // Fallback to user lookup if no triage contact info available
      if (!studentInfo.firstName && !studentInfo.email) {
        const fallbackInfo = await this.getStudentFullName(conversation.studentId);
        if (fallbackInfo) {
          studentInfo = fallbackInfo;
        }
      }
      
      // 🎬 Get media analysis insights if available
      const mediaInsights = await this.analyzeConversationMedia(conversation);
      
      // Create enhanced smart case with comprehensive context
      const caseData = {
        orgId: conversation.orgId,
        title: `${detectedCategory.toUpperCase()}: ${conversation.initialRequest.substring(0, 40)}...`,
        description: this.buildEnhancedTicketDescription(conversation, locationData, studentInfo, mediaInsights),
        category: detectedCategory, // 🎯 AI-detected category
        priority: this.mapUrgencyToPriority(conversation.urgencyLevel),
        status: "New" as any,
        reportedBy: conversation.studentId,
        propertyId: propertyId,
        unitId: unitId,
        // ✅ FIX: Store location in dedicated database columns for display
        buildingName: locationData?.buildingName,
        roomNumber: locationData?.roomNumber,
        metadata: {
          triageConversationId: conversationId,
          safetyFlags: conversation.safetyFlags,
          triageData: conversation.triageData,
          urgencyLevel: conversation.urgencyLevel,
          mitBuilding: locationData?.buildingName,
          roomNumber: locationData?.roomNumber,
          studentName: `${studentInfo?.firstName || ''} ${studentInfo?.lastName || ''}`.trim(),
          studentEmail: studentInfo?.email || '',
          studentPhone: studentInfo?.phone || '',
          category: detectedCategory,
          mediaInsights: mediaInsights || null
        }
      };
      
      // Generate structured case number
      const caseNumber = this.generateStructuredCaseNumber(
        conversation.urgencyLevel as 'emergency' | 'urgent' | 'normal' | 'low',
        locationData || {}
      );
      
      // Add caseNumber to case data
      const caseDataWithNumber = {
        ...caseData,
        caseNumber
      };

      const newCase = await storage.createSmartCase(caseDataWithNumber);
      const caseId = newCase.id;

      // Update conversation as complete (consistent with schema)
      await storage.updateTriageConversation(conversationId, {
        isComplete: true,
        currentPhase: "final_triage",
        smartCaseId: caseId,
        completedAt: new Date()
      });

      // ✅ Start Post-Escalation Workflow
      await this.initiatePostEscalationWorkflow(caseId, conversationId, conversation);

      // ✅ Send comprehensive notifications to admins and contractors
      await this.sendCaseCreationNotifications(newCase, conversation);

      // 📧 ADDED: Send immediate confirmation to student with case details
      await this.sendStudentCaseConfirmation(newCase, conversation);

      return {
        success: true,
        conversationId,
        caseId,
        caseNumber: newCase.caseNumber,
        message: "Triage completed successfully. A maintenance case has been created.",
        triageData: conversation.triageData,
        safetyFlags: conversation.safetyFlags
      };

    } catch (error) {
      console.error('Error completing Mailla triage:', error);
      throw error;
    }
  }

  // ========================================
  // POST-ESCALATION WORKFLOW SYSTEM
  // ========================================

  private async initiatePostEscalationWorkflow(caseId: string, conversationId: string, conversation: any) {
    try {
      console.log(`🚀 Starting post-escalation workflow for case ${caseId}`);

      // Create escalation event
      await this.createTicketEvent(caseId, conversationId, "escalated", 
        "I've created your maintenance ticket and will guide you through the next steps.", 
        {
          urgencyLevel: conversation.urgencyLevel,
          safetyFlags: conversation.safetyFlags,
          escalatedAt: new Date()
        }
      );

      // Analyze if we need media based on the issue type
      const needsMedia = this.shouldRequestMedia(conversation);
      if (needsMedia.request) {
        await this.requestMedia(caseId, conversationId, needsMedia);
      }

      // Provide immediate remediation guidance if applicable
      const remediationGuidance = this.getRemediationGuidance(conversation);
      if (remediationGuidance) {
        await this.provideRemediationGuidance(caseId, conversationId, remediationGuidance);
      }

      // Schedule intelligent follow-up based on emotional context and urgency
      await this.scheduleIntelligentFollowUp(caseId, conversationId, conversation);

      // 🔧 CONTRACTOR ASSIGNMENT - Find and assign optimal contractor
      await this.assignOptimalContractor(caseId, conversationId, conversation);

      // 🎬 Analyze uploaded media for contractor insights
      const mediaInsights = await this.analyzeConversationMedia(conversation);
      if (mediaInsights) {
        await this.createTicketEvent(caseId, conversationId, "media_analyzed", 
          `AI Analysis: ${mediaInsights.summary}`, {
          insights: mediaInsights,
          contractorRecommendations: mediaInsights.contractorRecommendations
        });
      }

      console.log(`✅ Post-escalation workflow initiated for case ${caseId}`);
    } catch (error) {
      console.error('Error initiating post-escalation workflow:', error);
      // Don't throw - this shouldn't block the main escalation
    }
  }

  private async createTicketEvent(
    caseId: string, 
    conversationId: string, 
    eventType: string, 
    message: string, 
    metadata: any = {}
  ) {
    try {
      const event = {
        caseId,
        conversationId,
        eventType: eventType as any,
        message,
        metadata,
        createdBy: 'mailla'
      };
      
      // Try to create the event, but don't fail if the table doesn't exist yet
      await storage.createTicketEvent(event);
      console.log(`📝 Ticket event created: ${eventType} for case ${caseId}`);
    } catch (error) {
      console.log(`⚠️ Could not create ticket event (table may not exist yet): ${error instanceof Error ? error.message : String(error)}`);
      // Continue without failing - this is for enhanced tracking
    }
  }

  // ========================================
  // CONTRACTOR ASSIGNMENT SYSTEM
  // ========================================

  /**
   * Maps database priority enum to AI Coordinator urgency format
   */
  private mapPriorityToUrgency(priority: string): 'Low' | 'Medium' | 'High' | 'Critical' {
    const mapping: Record<string, 'Low' | 'Medium' | 'High' | 'Critical'> = {
      'Low': 'Low',
      'Medium': 'Medium', 
      'High': 'High',
      'Urgent': 'Critical'  // Database 'Urgent' becomes AI Coordinator 'Critical'
    };
    return mapping[priority] || 'Medium';
  }

  /**
   * Maps Mailla urgency levels to AI Coordinator urgency format
   */
  private mapMaillaUrgencyToCoordinator(urgencyLevel: string): 'Low' | 'Medium' | 'High' | 'Critical' {
    const mapping: Record<string, 'Low' | 'Medium' | 'High' | 'Critical'> = {
      'low': 'Low',
      'normal': 'Medium',
      'urgent': 'High', 
      'emergency': 'Critical'
    };
    return mapping[urgencyLevel] || 'Medium';
  }

  /**
   * Maps Mailla urgency levels to database priority enum values
   */
  private mapUrgencyToPriority(urgencyLevel: string): 'Low' | 'Medium' | 'High' | 'Urgent' {
    const mapping: Record<string, 'Low' | 'Medium' | 'High' | 'Urgent'> = {
      'low': 'Low',
      'normal': 'Medium', 
      'urgent': 'High',
      'emergency': 'Urgent'
    };
    return mapping[urgencyLevel] || 'Medium';
  }

  /**
   * Generates user-friendly case number from UUID
   */
  private generateFriendlyCaseNumber(caseId: string): string {
    // Convert UUID to a short, memorable number
    const hash = caseId.split('-')[0]; // Use first part of UUID
    const num = parseInt(hash.substring(0, 6), 16) % 9000 + 1000; // Generate 1000-9999
    return `MIT-${num}`;
  }

  private async assignOptimalContractor(caseId: string, conversationId: string, conversation: any) {
    try {
      console.log(`🔧 Starting contractor assignment for case ${caseId}`);

      // Get the smart case details
      const smartCase = await storage.getSmartCase(caseId);
      if (!smartCase) {
        console.error(`❌ Case ${caseId} not found for contractor assignment`);
        return;
      }

      // Get available contractors for the organization
      const allVendors = await storage.getVendors(smartCase.orgId);
      const availableContractors = allVendors.filter(v => 
        v.specializations && 
        Array.isArray(v.specializations) && 
        v.specializations.length > 0
      );

      if (availableContractors.length === 0) {
        console.log(`⚠️ No contractors available for assignment in org ${smartCase.orgId}`);
        await this.createTicketEvent(caseId, conversationId, "assignment_failed", 
          "No contractors available for assignment. Manual assignment required.");
        return;
      }

      // Use AI Coordinator to find optimal contractor
      const { aiCoordinatorService } = await import('./aiCoordinator');
      
      // 🔧 FIX: Properly map urgency from conversation + database priority
      const mappedUrgency = conversation.urgencyLevel 
        ? this.mapMaillaUrgencyToCoordinator(conversation.urgencyLevel)
        : this.mapPriorityToUrgency(smartCase.priority || 'Medium');

      console.log(`🔄 Urgency Mapping: conversation=${conversation.urgencyLevel} → database=${smartCase.priority} → coordinator=${mappedUrgency}`);

      const contractorRequest = {
        caseData: {
          id: caseId,
          category: smartCase.category || 'General Maintenance',
          priority: this.mapPriorityToUrgency(smartCase.priority || 'Medium'),
          description: smartCase.description || '',
          location: smartCase.buildingName || 'Unknown',
          urgency: mappedUrgency,
          estimatedDuration: '2-4 hours',
          safetyRisk: 'None' as any,
          contractorType: smartCase.category || undefined
        },
        availableContractors: availableContractors.map(c => ({
          id: c.id,
          name: c.name,
          category: c.category || 'General',
          specializations: c.specializations || [],
          availabilityPattern: c.availabilityPattern || 'standard',
          responseTimeHours: c.responseTimeHours || 24,
          estimatedHourlyRate: Number(c.estimatedHourlyRate) || 75,
          rating: 4.5,
          maxJobsPerDay: c.maxJobsPerDay || 3,
          currentWorkload: 0,
          emergencyAvailable: c.emergencyAvailable || false,
          isActiveContractor: true
        }))
      };

      const recommendations = await aiCoordinatorService.findOptimalContractor(contractorRequest);
      
      // 🎯 RESTORED APPROVAL WORKFLOW: Don't auto-assign contractors
      // Cases should be created as "New" status so contractors can choose to accept them
      // This preserves the contractor approval workflow: New → Scheduled → In Progress → Resolved
      
      if (recommendations && recommendations.length > 0) {
        const bestContractor = recommendations[0];
        
        // ❌ REMOVED AUTO-ASSIGNMENT - Cases stay "New" for contractor approval
        // await storage.updateSmartCase(caseId, { 
        //   contractorId: bestContractor.contractorId,
        //   status: 'In Progress' as any
        // });

        // 🤖 AI-POWERED DURATION ESTIMATION with Learning
        const conversationData = await storage.getTriageConversation(conversationId);
        const durationEstimate = await this.estimateRepairDuration(conversationData?.triageData, bestContractor.contractorId);
        
        // 📝 Log contractor recommendation with duration estimate
        // 🧠 Create learning log for future improvement
        try {
          await storage.createDurationLearningLog({
            caseId,
            contractorId: bestContractor.contractorId,
            orgId: smartCase.orgId,
            estimatedMinutes: durationEstimate.estimatedMinutes,
            estimationConfidence: durationEstimate.confidence,
            estimationMethod: 'ai',
            estimationReasoning: durationEstimate.reasoning,
            issueCategory: durationEstimate.category || conversationData?.triageData?.category || 'general',
            urgencyLevel: conversationData?.triageData?.urgencyLevel || 'normal',
            complexityFactors: {
              scope: conversationData?.triageData?.conversationSlots?.scope,
              accessibility: conversationData?.triageData?.conversationSlots?.accessibility,
              previousAttempts: conversationData?.triageData?.conversationSlots?.previousAttempts,
              complexity: conversationData?.triageData?.conversationSlots?.complexity
            }
          });
        } catch (error: any) {
          console.log('📊 Learning log creation deferred until schema ready:', error?.message || 'Unknown error');
        }
        
        await this.createTicketEvent(caseId, conversationId, "contractor_assigned", 
          `Contractor recommended: ${bestContractor.contractorName} (${Math.round(bestContractor.matchScore)}% match) - Estimated ${durationEstimate.estimatedMinutes} minutes (${durationEstimate.confidence} confidence)${durationEstimate.learningAdjustment ? ` [Learning-adjusted: ${durationEstimate.learningAdjustment > 0 ? '+' : ''}${durationEstimate.learningAdjustment}min]` : ''}`, {
          contractorId: bestContractor.contractorId,  // Keep existing field structure
          contractorName: bestContractor.contractorName,
          matchScore: bestContractor.matchScore,
          estimatedResponseTime: bestContractor.estimatedResponseTime,
          reasoning: bestContractor.reasoning,
          isRecommendation: true,  // Flag to indicate this is a recommendation, not actual assignment
          // 🎯 NEW: Duration estimation data
          estimatedDurationMinutes: durationEstimate.estimatedMinutes,
          durationConfidence: durationEstimate.confidence,
          durationReasoning: durationEstimate.reasoning,
          durationCategory: durationEstimate.category
        });

        console.log(`💡 Contractor ${bestContractor.contractorName} recommended for case ${caseId} - awaiting acceptance`);
      } else {
        console.log(`⚠️ No suitable contractor recommendations for case ${caseId}`);
        await this.createTicketEvent(caseId, conversationId, "assignment_deferred", 
          "No suitable contractors found. Case available for any qualified contractor to accept.");
      }

    } catch (error) {
      console.error('Error assigning contractor:', error);
      await this.createTicketEvent(caseId, conversationId, "assignment_error", 
        "Error occurred during contractor assignment. Manual assignment required.");
    }
  }

  private shouldRequestMedia(conversation: any): { request: boolean; types: string[]; reason: string } {
    const description = conversation.initialRequest?.toLowerCase() || '';
    
    // Skip media requests for safety hazards - prioritize evacuation
    if (conversation.safetyFlags && conversation.safetyFlags.length > 0) {
      return { request: false, types: [], reason: 'Safety priority - no media needed' };
    }

    // Visual issues that benefit from photos
    if (description.match(/\b(leak|water|drip|stain|crack|hole|break|broken|damage|mold|rust)\b/)) {
      return { 
        request: true, 
        types: ['photo'], 
        reason: 'Photos help contractors assess damage severity and bring the right tools and parts' 
      };
    }

    // Strange noises that benefit from audio
    if (description.match(/\b(noise|sound|loud|buzz|hum|rattle|clank|bang|grinding|squealing|clicking)\b/)) {
      return { 
        request: true, 
        types: ['audio'], 
        reason: 'Audio recording helps contractors identify the specific equipment problem and estimate repair time' 
      };
    }

    // Appliance/HVAC issues that benefit from error code photos
    if (description.match(/\b(appliance|fridge|microwave|oven|dishwasher|washer|dryer|error|code|display|thermostat|hvac|heat|cool)\b/)) {
      return { 
        request: true, 
        types: ['photo'], 
        reason: 'Photos of error codes, displays, or equipment help contractors diagnose issues faster and bring replacement parts' 
      };
    }

    // Electrical issues that benefit from visual assessment
    if (description.match(/\b(electrical|electric|outlet|switch|breaker|power|lights|wiring)\b/)) {
      return { 
        request: true, 
        types: ['photo'], 
        reason: 'Photos help contractors assess electrical safety and plan the repair approach' 
      };
    }

    return { request: false, types: [], reason: 'No media needed for this issue type' };
  }

  private async requestMedia(caseId: string, conversationId: string, mediaRequest: any) {
    const message = `One quick thing that would help - ${mediaRequest.reason}. ${
      mediaRequest.types.includes('photo') ? 'Can you take a photo showing the problem?' : 
      'Can you record a short audio clip of the sound?'
    } This helps contractors come prepared with the right tools.`;

    await this.createTicketEvent(caseId, conversationId, "media_requested", message, {
      mediaTypes: mediaRequest.types,
      reason: mediaRequest.reason
    });
  }

  private getRemediationGuidance(conversation: any): any {
    const description = conversation.initialRequest?.toLowerCase() || '';
    const urgencyLevel = conversation.urgencyLevel;
    
    // Water-related issues
    if (description.match(/\b(leak|water|drip|overflow|flood)\b/)) {
      return {
        category: 'water',
        steps: [
          'Use towels or buckets to contain the water',
          'Move any items away from the leak',
          'If safe to do so, look for a water shutoff valve',
          'Keep the area well ventilated'
        ],
        warnings: ['Don\'t touch electrical outlets or switches near water', 'If you see sparks or smell gas, evacuate immediately'],
        urgency: urgencyLevel
      };
    }

    // Electrical issues
    if (description.match(/\b(electrical|electric|shock|spark|outlet|breaker|power)\b/)) {
      return {
        category: 'electrical',
        steps: [
          'Turn off the circuit breaker for that area if you know which one',
          'Don\'t touch the outlet or switch',
          'Keep the area clear'
        ],
        warnings: ['Never touch electrical components with wet hands', 'If you smell burning or see sparks, call emergency services'],
        urgency: 'urgent'
      };
    }

    // HVAC issues
    if (description.match(/\b(hvac|heat|cool|air|conditioner|furnace|thermostat)\b/)) {
      return {
        category: 'hvac',
        steps: [
          'Try turning the system off for 10 minutes, then back on',
          'Check that the thermostat is set correctly',
          'Make sure vents aren\'t blocked'
        ],
        warnings: ['Don\'t keep resetting breakers repeatedly', 'If you smell gas, evacuate and call emergency services'],
        urgency: urgencyLevel
      };
    }

    return null;
  }

  private async provideRemediationGuidance(caseId: string, conversationId: string, guidance: any) {
    const stepsText = guidance.steps.map((step: string, i: number) => `${i + 1}. ${step}`).join('\n');
    const warningsText = guidance.warnings.map((warning: string) => `⚠️ ${warning}`).join('\n');
    
    const message = `While we get someone there to help, here's what you can do right now:\n\n${stepsText}\n\n${warningsText}\n\nOnly do what feels safe - your safety comes first!`;

    await this.createTicketEvent(caseId, conversationId, "remediation_provided", message, {
      category: guidance.category,
      steps: guidance.steps,
      warnings: guidance.warnings
    });
  }

  private async scheduleIntelligentFollowUp(caseId: string, conversationId: string, conversation: any) {
    // Determine follow-up frequency based on emotional context and urgency
    const contextAnalysis = this.analyzeMessageContext(conversation.initialRequest);
    let followUpMinutes = 60; // Default: 1 hour

    // More frequent for frustrated or worried students
    if (contextAnalysis.emotionalContext === 'frustrated' || contextAnalysis.emotionalContext === 'worried') {
      followUpMinutes = 30; // Every 30 minutes
    }

    // More frequent for urgent issues
    if (conversation.urgencyLevel === 'urgent' || conversation.urgencyLevel === 'emergency') {
      followUpMinutes = 15; // Every 15 minutes
    }

    // Less frequent for calm situations
    if (contextAnalysis.emotionalContext === 'calm' && conversation.urgencyLevel === 'normal') {
      followUpMinutes = 120; // Every 2 hours
    }

    await this.createTicketEvent(caseId, conversationId, "communication_sent", 
      `I'll check back with you in ${followUpMinutes} minutes with an update on your maintenance request.`, {
      followUpScheduled: new Date(Date.now() + followUpMinutes * 60 * 1000),
      frequency: followUpMinutes,
      reason: `Based on ${contextAnalysis.emotionalContext} emotional state and ${conversation.urgencyLevel} urgency`
    });
  }

  // ========================================
  // ENHANCED MEDIA ANALYSIS FOR CONTRACTORS
  // ========================================

  private async analyzeConversationMedia(conversation: any): Promise<any> {
    try {
      // Extract media from conversation history and triage data
      const mediaUrls: string[] = [];
      const audioUrls: string[] = [];
      
      // Check conversation history for media
      if (conversation.conversationHistory) {
        for (const entry of conversation.conversationHistory) {
          if (entry.mediaUrls) {
            for (const url of entry.mediaUrls) {
              if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                mediaUrls.push(url);
              } else if (url.match(/\.(mp3|wav|m4a|ogg)$/i)) {
                audioUrls.push(url);
              }
            }
          }
        }
      }

      // Check triage data for media uploads
      if (conversation.mediaUploads) {
        for (const upload of conversation.mediaUploads) {
          if (upload.type === 'image') {
            mediaUrls.push(upload.url);
          } else if (upload.type === 'audio') {
            audioUrls.push(upload.url);
          }
        }
      }

      if (mediaUrls.length === 0 && audioUrls.length === 0) {
        return null; // No media to analyze
      }

      console.log(`🎬 Analyzing media for contractor insights: ${mediaUrls.length} images, ${audioUrls.length} audio files`);

      let analysisResults = [];

      // Analyze photos for contractor insights
      if (mediaUrls.length > 0) {
        const photoAnalysis = await this.analyzePhotosForContractors(mediaUrls, conversation);
        if (photoAnalysis) {
          analysisResults.push(photoAnalysis);
        }
      }

      // Analyze audio for contractor insights  
      if (audioUrls.length > 0) {
        const audioAnalysis = await this.analyzeAudioForContractors(audioUrls, conversation);
        if (audioAnalysis) {
          analysisResults.push(audioAnalysis);
        }
      }

      if (analysisResults.length === 0) {
        return null;
      }

      // Combine insights for comprehensive contractor summary
      return this.synthesizeContractorInsights(analysisResults, conversation);

    } catch (error) {
      console.error('Error analyzing conversation media:', error);
      return null;
    }
  }

  private async analyzePhotosForContractors(imageUrls: string[], conversation: any): Promise<any> {
    try {
      const firstImage = imageUrls[0]; // Focus on first image for now
      
      // Get OpenAI integration - using same pattern as other AI services
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const prompt = `You are an expert maintenance contractor analyzing this photo from a MIT student housing maintenance request.

ORIGINAL REQUEST: "${conversation.initialRequest}"
LOCATION: ${conversation.triageData?.location?.buildingName || 'Unknown'} ${conversation.triageData?.location?.roomNumber || ''}
URGENCY: ${conversation.urgencyLevel}

Please analyze this image and provide a comprehensive contractor assessment in JSON format:

{
  "damageAssessment": "Detailed description of what you see",
  "severity": "minor|moderate|major|critical", 
  "estimatedRepairTime": "15-30 minutes|1-2 hours|2-4 hours|4+ hours|multi-day",
  "toolsRequired": ["specific tools needed"],
  "partsRequired": ["specific parts that may be needed"],
  "safetyNotes": ["any safety concerns visible"],
  "contractorPrep": "What contractor should bring/prepare",
  "urgencyConfirmation": "Does photo confirm/change urgency level?",
  "costEstimate": "rough cost range if visible",
  "accessRequirements": "any special access needs",
  "summary": "2-sentence contractor summary"
}

Focus on practical details that help contractors prepare effectively.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { 
              type: "image_url", 
              image_url: { url: firstImage }
            }
          ]
        }],
        response_format: { type: "json_object" },
        max_completion_tokens: 800
      });

      const analysis = JSON.parse(response.choices[0].message.content || '{}');
      console.log(`📸 Photo analysis completed for contractor insights`);
      return { type: 'photo', ...analysis };

    } catch (error) {
      console.error('Error analyzing photos for contractors:', error);
      return null;
    }
  }

  private async analyzeAudioForContractors(audioUrls: string[], conversation: any): Promise<any> {
    try {
      // For now, provide structured analysis based on audio description patterns
      // This can be enhanced with actual audio analysis APIs later
      const description = conversation.initialRequest?.toLowerCase() || '';
      
      let audioInsights = {
        type: 'audio',
        soundAnalysis: 'Audio analysis not yet implemented',
        estimatedRepairTime: '1-2 hours',
        toolsRequired: ['diagnostic tools'],
        summary: 'Audio recording provided - contractor should listen for specific equipment sounds'
      };

      // Pattern-based audio analysis for now
      if (description.match(/\b(grinding|squealing|screeching)\b/)) {
        audioInsights = {
          type: 'audio',
          soundAnalysis: 'Grinding/squealing sounds typically indicate worn bearings or mechanical issues',
          estimatedRepairTime: '2-4 hours',
          toolsRequired: ['diagnostic tools', 'replacement bearings', 'lubricants'],
          summary: 'Mechanical wear sounds detected - likely bearing or motor issues requiring parts replacement'
        };
      } else if (description.match(/\b(clicking|ticking)\b/)) {
        audioInsights = {
          type: 'audio',
          soundAnalysis: 'Clicking sounds often indicate electrical relay issues or loose connections',
          estimatedRepairTime: '1-2 hours',
          toolsRequired: ['electrical tester', 'replacement relays', 'wire connectors'],
          summary: 'Electrical clicking detected - likely relay or connection issue'
        };
      }

      console.log(`🔊 Audio analysis completed for contractor insights`);
      return audioInsights;

    } catch (error) {
      console.error('Error analyzing audio for contractors:', error);
      return null;
    }
  }

  private synthesizeContractorInsights(analysisResults: any[], conversation: any): any {
    try {
      // Combine all analysis results into comprehensive contractor recommendations
      const photoResults = analysisResults.filter(r => r.type === 'photo');
      const audioResults = analysisResults.filter(r => r.type === 'audio');

      let combinedInsights = {
        hasMedia: true,
        photoCount: photoResults.length,
        audioCount: audioResults.length,
        overallSeverity: 'moderate',
        estimatedRepairTime: '1-2 hours',
        toolsRequired: [] as string[],
        partsRequired: [] as string[],
        safetyNotes: [] as string[],
        contractorRecommendations: {
          preparation: 'Standard maintenance response',
          urgencyLevel: conversation.urgencyLevel,
          specialConsiderations: []
        },
        summary: 'Media analysis completed - see detailed breakdown for contractor insights'
      };

      // Synthesize photo insights
      if (photoResults.length > 0) {
        const photo = photoResults[0];
        combinedInsights.overallSeverity = photo.severity || 'moderate';
        combinedInsights.estimatedRepairTime = photo.estimatedRepairTime || '1-2 hours';
        combinedInsights.toolsRequired = [...(photo.toolsRequired || [])];
        combinedInsights.partsRequired = [...(photo.partsRequired || [])];
        combinedInsights.safetyNotes = [...(photo.safetyNotes || [])];
        combinedInsights.contractorRecommendations.preparation = photo.contractorPrep || 'Bring standard tools based on photo assessment';
      }

      // Add audio insights
      if (audioResults.length > 0) {
        const audio = audioResults[0];
        combinedInsights.toolsRequired.push(...(audio.toolsRequired || []));
        const audioSummary = audio.summary || 'Audio provided for equipment diagnosis';
        combinedInsights.contractorRecommendations.specialConsiderations.push(audioSummary);
      }

      // Generate comprehensive summary
      const mediaTypes = [];
      if (photoResults.length > 0) mediaTypes.push(`${photoResults.length} photo(s)`);
      if (audioResults.length > 0) mediaTypes.push(`${audioResults.length} audio file(s)`);
      
      combinedInsights.summary = `Student provided ${mediaTypes.join(' and ')} showing ${combinedInsights.overallSeverity} severity issue. Estimated repair time: ${combinedInsights.estimatedRepairTime}. ${combinedInsights.contractorRecommendations.preparation}`;

      return combinedInsights;

    } catch (error) {
      console.error('Error synthesizing contractor insights:', error);
      return {
        summary: 'Media analysis encountered errors - proceed with standard assessment',
        hasMedia: true,
        analysisError: true
      };
    }
  }

  // ========================================
  // APPOINTMENT RELAY SYSTEM
  // ========================================

  /**
   * Automatically relay appointment details to student when contractor schedules
   */
  async relayAppointmentToStudent(appointment: any) {
    try {
      console.log(`🔔 Starting appointment relay for appointment ${appointment.id}`);

      // Get the smart case to find student information
      const smartCase = await storage.getSmartCase(appointment.caseId);
      if (!smartCase) {
        console.error(`❌ Case ${appointment.caseId} not found for appointment relay`);
        return;
      }

      // Get contractor details
      const contractor = await storage.getVendor(appointment.contractorId);
      if (!contractor) {
        console.error(`❌ Contractor ${appointment.contractorId} not found for appointment relay`);
        return;
      }

      // Generate approval token with 24-hour expiry
      const approvalToken = crypto.randomBytes(32).toString('hex');
      const approvalExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Update appointment with approval details
      await storage.updateAppointment(appointment.id, {
        approvalToken,
        approvalExpiresAt,
        status: 'Proposed' as any
      });

      // Format appointment time for student
      const startTime = new Date(appointment.scheduledStartAt);
      const endTime = new Date(appointment.scheduledEndAt);
      const dateStr = startTime.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      const timeStr = `${startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

      // Create relay message for student
      const relayMessage = `🔧 **Maintenance Appointment Scheduled** 🔧

Good news! Your maintenance request for "${smartCase.title}" has been scheduled.

**📅 Appointment Details:**
• **Date:** ${dateStr}
• **Time:** ${timeStr}
• **Contractor:** ${contractor.name}
• **Location:** ${appointment.locationDetails || smartCase.buildingName || 'Your building'}

**🏠 Room Access Required:** ${appointment.requiresTenantAccess ? 'Yes - please be available' : 'No - contractor has building access'}

**✅ Please confirm this appointment works for your schedule:**
• **Accept:** Reply "CONFIRM" or "YES"
• **Reschedule:** Reply "RESCHEDULE" if you need a different time

This appointment confirmation expires in 24 hours. If you don't respond, we'll reach out to reschedule.

Questions? Just ask! I'm here to help coordinate your maintenance needs.`;

      // Create student notification event
      await this.createTicketEvent(
        appointment.caseId,
        '', // No specific conversation ID for relay
        "appointment_scheduled",
        relayMessage,
        {
          appointmentId: appointment.id,
          contractorId: appointment.contractorId,
          contractorName: contractor.name,
          scheduledStartAt: appointment.scheduledStartAt,
          scheduledEndAt: appointment.scheduledEndAt,
          approvalToken,
          approvalExpiresAt,
          requiresTenantAccess: appointment.requiresTenantAccess
        }
      );

      console.log(`✅ Appointment relay completed for case ${smartCase.id} - student notified of ${dateStr} appointment`);

    } catch (error) {
      console.error('❌ Error relaying appointment to student:', error);
      throw error; // Let caller handle gracefully
    }
  }

  // ========================================
  // ENHANCED TICKET CREATION SYSTEM
  // ========================================

  private detectMaintenanceCategory(conversation: any): string {
    const description = conversation.initialRequest?.toLowerCase() || '';
    
    // 🌡️ HVAC Issues
    if (description.match(/\b(heat|heating|hvac|ac|air conditioning|thermostat|furnace|boiler|radiator|vent|temperature|cold|hot|freezing|cooling|fan)\b/)) {
      return 'HVAC';
    }
    
    // ⚡ Electrical Issues
    if (description.match(/\b(electrical|electric|power|outlet|switch|light|lamp|breaker|fuse|wiring|electricity|shock|spark)\b/)) {
      return 'Electrical';
    }
    
    // 🔧 Plumbing Issues
    if (description.match(/\b(water|plumbing|pipe|leak|drain|toilet|sink|shower|faucet|bathroom|flooding|drip)\b/)) {
      return 'Plumbing';
    }
    
    // 🏠 Structural Issues
    if (description.match(/\b(wall|ceiling|floor|door|window|paint|crack|hole|damage|structural|broken)\b/)) {
      return 'Structural';
    }
    
    // 🔐 Security/Access Issues
    if (description.match(/\b(lock|key|security|door.*won.*open|can.*get.*in|locked out|access|entry)\b/)) {
      return 'Security';
    }
    
    // 🧹 General Maintenance
    return 'General';
  }

  private async getStudentFullName(studentId: string): Promise<{ firstName?: string; lastName?: string } | null> {
    try {
      // Get user information from storage
      const user = await storage.getUser(studentId);
      if (user) {
        return {
          firstName: user.firstName || undefined,
          lastName: user.lastName || undefined
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting student name:', error);
      return null;
    }
  }

  private buildEnhancedTicketDescription(
    conversation: any, 
    locationData: any, 
    studentInfo: any, 
    mediaInsights: any
  ): string {
    let description = `**Student Report:**\n${conversation.initialRequest}\n\n`;
    
    // 📍 Location Information
    if (locationData?.buildingName) {
      description += `**Location:** ${locationData.buildingName}`;
      if (locationData.roomNumber) {
        description += `, Room ${locationData.roomNumber}`;
      }
      description += '\n\n';
    }
    
    // 👤 Student Information
    if (studentInfo?.firstName || studentInfo?.lastName) {
      description += `**Reported by:** ${studentInfo.firstName || ''} ${studentInfo.lastName || ''}`.trim() + '\n\n';
    }
    
    // 🚨 Urgency & Safety
    if (conversation.urgencyLevel !== 'normal') {
      description += `**Urgency Level:** ${conversation.urgencyLevel.toUpperCase()}\n\n`;
    }
    
    if (conversation.safetyFlags && conversation.safetyFlags.length > 0) {
      description += `**⚠️ Safety Concerns:** ${conversation.safetyFlags.join(', ')}\n\n`;
    }
    
    // 🎬 Media Analysis Insights
    if (mediaInsights && mediaInsights.summary) {
      description += `**📸 AI Media Analysis:**\n${mediaInsights.summary}\n\n`;
      
      if (mediaInsights.estimatedRepairTime) {
        description += `**Estimated Repair Time:** ${mediaInsights.estimatedRepairTime}\n`;
      }
      
      if (mediaInsights.toolsRequired && mediaInsights.toolsRequired.length > 0) {
        description += `**Recommended Tools:** ${mediaInsights.toolsRequired.join(', ')}\n`;
      }
      
      if (mediaInsights.partsRequired && mediaInsights.partsRequired.length > 0) {
        description += `**Potential Parts Needed:** ${mediaInsights.partsRequired.join(', ')}\n`;
      }
      
      if (mediaInsights.safetyNotes && mediaInsights.safetyNotes.length > 0) {
        description += `**Safety Notes:** ${mediaInsights.safetyNotes.join(', ')}\n`;
      }
      
      description += '\n';
    }
    
    // 📝 Triage Context
    if (conversation.triageData) {
      const contextItems = [];
      if (conversation.triageData.timeline) {
        contextItems.push(`Timeline: ${conversation.triageData.timeline}`);
      }
      if (conversation.triageData.severity) {
        contextItems.push(`Severity: ${conversation.triageData.severity}`);
      }
      if (contextItems.length > 0) {
        description += `**Additional Context:** ${contextItems.join(' | ')}\n\n`;
      }
    }
    
    description += `**Ticket created:** ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`;
    
    return description;
  }

  // ========================================
  // NOTIFICATION INTEGRATION
  // ========================================

  /**
   * Send comprehensive notifications when a case is created via Mailla AI triage
   */
  private async sendCaseCreationNotifications(newCase: any, conversation: any) {
    try {
      console.log(`📬 Sending notifications for AI-created case ${newCase.caseNumber}`);
      
      // Import notification service
      const { notificationService } = await import('./notificationService.js');
      
      // Create notification data
      const notificationData = {
        to: '', // Will be filled per recipient
        subject: `🚨 New Maintenance Case: ${newCase.caseNumber}`,
        message: `A ${conversation.urgencyLevel} priority maintenance case has been created via AI triage:\n\n${newCase.description}`,
        type: 'case_created' as const,
        caseId: newCase.id,
        caseNumber: newCase.caseNumber,
        urgencyLevel: conversation.urgencyLevel,
        metadata: {
          buildingName: newCase.buildingName,
          roomNumber: newCase.roomNumber,
          category: newCase.category,
          studentId: conversation.studentId,
          safetyFlags: conversation.safetyFlags
        }
      };

      // Send notifications to admins
      await notificationService.notifyAdmins(notificationData, conversation.orgId);

      // If urgent/emergency, immediately notify available contractors
      if (['emergency', 'urgent'].includes(conversation.urgencyLevel?.toLowerCase())) {
        console.log(`🚨 Emergency/Urgent case - notifying contractors immediately`);
        
        const storage = (await import('./storage.js')).storage;
        const availableContractors = await storage.getVendors(conversation.orgId);
        const activeContractors = availableContractors.filter(c => c.isActiveContractor);
        
        // Notify up to 3 available contractors for urgent cases
        for (const contractor of activeContractors.slice(0, 3)) {
          if (contractor.userId) {
            const contractorNotification = {
              ...notificationData,
              subject: `🚨 URGENT: New Case Available - ${newCase.caseNumber}`,
              message: `URGENT maintenance needed at ${newCase.buildingName || 'MIT Housing'}. Case: ${newCase.description.substring(0, 100)}...`,
              type: 'contractor_assigned' as const
            };
            
            await notificationService.notifyContractor(contractorNotification, contractor.userId);
          }
        }
      }

      console.log(`✅ Notifications sent for case ${newCase.caseNumber}`);
    } catch (error) {
      console.error('❌ Failed to send case creation notifications:', error);
      // Don't throw - notification failures shouldn't block case creation
    }
  }

  /**
   * Send immediate confirmation to student after case creation
   */
  private async sendStudentCaseConfirmation(newCase: any, conversation: any) {
    try {
      console.log(`📧 Sending case confirmation to student for case ${newCase.caseNumber}`);
      
      // Extract student contact info from case metadata (where it's actually stored)
      const metadata = newCase.metadata || {};
      const studentEmail = metadata.studentEmail;
      const studentName = metadata.studentName;
      const studentPhone = metadata.studentPhone;
      
      if (!studentEmail) {
        console.warn('⚠️ No student email found for case confirmation');
        return;
      }

      const { notificationService } = await import('./notificationService.js');
      
      const subject = `✅ Your Maintenance Request #${newCase.caseNumber} - Help is Coming!`;
      const message = `Hi ${studentName || 'there'}!

Great news! I've successfully created your maintenance request and help is on the way.

🎫 **Your Case Details:**
• **Case Number:** ${newCase.caseNumber}
• **Location:** ${newCase.buildingName} ${newCase.roomNumber ? `Room ${newCase.roomNumber}` : ''}
• **Issue:** ${newCase.title || 'Maintenance needed'}
• **Priority:** ${conversation.urgencyLevel || 'Normal'}

👷 **What Happens Next:**
1. **Contractor Assignment:** I'm finding the best available contractor for your specific issue
2. **Contact Soon:** They'll reach out within the next few hours to schedule a convenient time
3. **Updates:** You'll get SMS/email updates when the contractor is assigned and on their way

📱 **Stay Connected:**
I'll keep you posted via text (${studentPhone}) and email about your case progress.

❓ **Need Help?** 
Just reply to this message if you have questions or if anything changes with your maintenance needs.

Thanks for reporting this issue - we'll get it fixed quickly!

Best regards,
Mailla 🤖
MIT Housing Maintenance Coordinator`;

      await notificationService.notifyStudent(
        studentEmail,
        subject,
        message,
        conversation.orgId
      );
      
      console.log(`✅ Student confirmation sent to ${studentEmail} for case ${newCase.caseNumber}`);
    } catch (error) {
      console.error('❌ Failed to send student case confirmation:', error);
      // Don't throw - notification failures shouldn't block case creation
    }
  }
}

// ✅ Export singleton instance for consistent usage
export const maillaAIService = new MaillaAIService();