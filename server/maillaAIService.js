// Converted from TypeScript to JavaScript to avoid compilation issues
import OpenAI from 'openai';
import { storage } from './storage.js';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { notificationService } from './notificationService.js';

// ========================================
// 🛡️ Mailla AI Triage Agent Service (JS Module)
// ========================================

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-development'
});

// ========================================
// MAIN TRIAGE CONVERSATION FLOW
// ========================================

export async function startTriageConversation(studentId, orgId, initialRequest) {
  try {
    console.log(`🤖 Mailla starting triage for student ${studentId}: "${initialRequest}"`);

    // 1. Create conversation record
    const conversation = {
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

    // Use the ID returned by storage
    const conversationId = await storage.createTriageConversation(conversation);

    // 2. Generate initial Mailla response with safety-first assessment
    const maillaResponse = await processTriageMessage(conversationId, initialRequest, true);

    console.log(`✅ Mailla triage started with urgency: ${maillaResponse.urgencyLevel}`);
    return { conversationId, maillaResponse };

  } catch (error) {
    console.error("🚨 Mailla triage start error:", error);
    throw new Error("Failed to start triage conversation");
  }
}

export async function continueTriageConversation(update) {
  try {
    console.log(`🤖 Mailla continuing triage ${update.conversationId}`);

    // 1. Get conversation context
    const conversation = await storage.getTriageConversation(update.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // 2. Add student message to history
    const updatedHistory = [
      ...conversation.conversationHistory,
      {
        role: "student", 
        message: update.studentMessage,
        timestamp: new Date().toISOString()
      }
    ];

    // 3. Process with Mailla AI
    const maillaResponse = await processTriageMessage(update.conversationId, update.studentMessage, false, update.mediaUrls);

    // 4. Add Mailla response to history
    const finalHistory = [
      ...updatedHistory,
      {
        role: "mailla",
        message: maillaResponse.message,
        urgencyLevel: maillaResponse.urgencyLevel,
        timestamp: new Date().toISOString()
      }
    ];

    // 5. Update conversation
    await storage.updateTriageConversation(update.conversationId, {
      conversationHistory: finalHistory,
      urgencyLevel: maillaResponse.urgencyLevel,
      safetyFlags: maillaResponse.safetyFlags,
      currentPhase: maillaResponse.isComplete ? "completed" : "gathering_info"
    });

    console.log(`✅ Mailla response: ${maillaResponse.urgencyLevel} priority, complete: ${maillaResponse.isComplete}`);
    return maillaResponse;

  } catch (error) {
    console.error("🚨 Mailla continuation error:", error);
    throw new Error("Failed to continue triage conversation");
  }
}

// ========================================
// CORE PROCESSING FUNCTIONS
// ========================================

async function processTriageMessage(conversationId, studentMessage, isInitial, mediaUrls) {
  try {
    const conversation = await storage.getTriageConversation(conversationId);
    if (!conversation) throw new Error("Conversation not found");

    // 1. SAFETY CHECK - Always first priority
    const safetyResults = await performSafetyCheck(studentMessage);
    
    // 2. Context analysis
    const contextAnalysis = analyzeMessageContext(studentMessage);
    const extractedLocation = extractLocationFromMessage(studentMessage);

    // 3. Generate AI response
    const prompt = buildTriageContextPrompt(studentMessage, isInitial, conversation, safetyResults, extractedLocation, contextAnalysis);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: getMaillaSystemPrompt() },
        { role: "user", content: prompt }
      ],
      tools: [{
        type: "function",
        function: {
          name: "triage_response",
          description: "Generate structured maintenance triage response",
          parameters: {
            type: "object",
            properties: {
              message: { type: "string", description: "Response to student" },
              urgencyLevel: { type: "string", enum: ["emergency", "urgent", "normal", "low"] },
              safetyFlags: { type: "array", items: { type: "string" } },
              nextAction: { 
                type: "string", 
                enum: ["ask_followup", "request_media", "escalate_immediate", "complete_triage", "recommend_diy", "self_resolved"]
              },
              conversationSlots: {
                type: "object",
                properties: {
                  buildingName: { type: "string" },
                  roomNumber: { type: "string" },
                  issueSummary: { type: "string" },
                  timeline: { type: "string" },
                  severity: { type: "string" }
                }
              },
              location: {
                type: "object",
                properties: {
                  buildingName: { type: "string" },
                  roomNumber: { type: "string" },
                  isLocationConfirmed: { type: "boolean" }
                }
              }
            },
            required: ["message", "urgencyLevel", "safetyFlags", "nextAction"]
          }
        }
      }],
      tool_choice: { type: "function", function: { name: "triage_response" } },
      temperature: 0.3
    });

    const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "triage_response") {
      throw new Error("Mailla failed to generate triage response");
    }

    const maillaResponse = JSON.parse(toolCall.function.arguments);
    
    // Add safety flags from safety check
    if (safetyResults && safetyResults.flags.length > 0) {
      maillaResponse.safetyFlags = [...(maillaResponse.safetyFlags || []), ...safetyResults.flags];
      maillaResponse.urgencyLevel = contextAnalysis.inferredUrgency;
    }

    // Enhanced location handling
    if (extractedLocation && (extractedLocation.buildingName || extractedLocation.roomNumber)) {
      if (!maillaResponse.location) {
        maillaResponse.location = {};
      }
      if (!maillaResponse.location.buildingName && extractedLocation.buildingName) {
        maillaResponse.location.buildingName = extractedLocation.buildingName;
      }
      if (!maillaResponse.location.roomNumber && extractedLocation.roomNumber) {
        maillaResponse.location.roomNumber = extractedLocation.roomNumber;
      }
      if (maillaResponse.location.buildingName && maillaResponse.location.roomNumber) {
        maillaResponse.location.isLocationConfirmed = true;
      }
    }

    // Update conversation data
    if (contextAnalysis && contextAnalysis.inferredInfo) {
      if (!maillaResponse.conversationSlots) {
        maillaResponse.conversationSlots = {};
      }
      if (contextAnalysis.inferredInfo.timeline && !maillaResponse.conversationSlots.timeline) {
        maillaResponse.conversationSlots.timeline = contextAnalysis.inferredInfo.timeline;
      }
      if (contextAnalysis.inferredInfo.severity && !maillaResponse.conversationSlots.severity) {
        maillaResponse.conversationSlots.severity = contextAnalysis.inferredInfo.severity;
      }
    }

    // Process completion if ready
    if (maillaResponse.nextAction === 'complete_triage') {
      try {
        const result = await completeTriageConversation(conversationId);
        if (result && result.isComplete) {
          maillaResponse.isComplete = true;
        }
      } catch (error) {
        console.error("Error completing triage:", error);
        maillaResponse.message += `\n\n⚡ I'm getting help dispatched right away - you'll get updates soon!`;
      }
    }

    return maillaResponse;

  } catch (error) {
    console.error("Error in processTriageMessage:", error);
    return {
      message: "I'm experiencing technical difficulties. Please contact MIT Housing directly at housing@mit.edu or (617) 253-1600 for immediate assistance.",
      urgencyLevel: "normal",
      safetyFlags: [],
      nextAction: "escalate_immediate",
      isComplete: false
    };
  }
}

// ========================================
// HELPER FUNCTIONS
// ========================================

function getMaillaSystemPrompt() {
  return `You are Mailla, MIT Housing's intelligent maintenance assistant. You help students with maintenance issues through conversational triage.

Your personality: Professional, empathetic, efficient. You understand student stress and respond with care while gathering necessary information.

CRITICAL SAFETY FIRST:
- Emergency keywords: "fire", "gas leak", "electrical shock", "water damage", "broken glass", "lockout", "security", "injury" 
- For emergencies: Immediately escalate with urgency level "emergency" and direct to Campus Police (617) 253-1212

Your job: Gather location, issue description, and student contact info (email/phone) through natural conversation.

Location gathering:
- Ask for building name and room/unit number
- Be familiar with MIT buildings (e.g., "Senior House", "Baker House", "Tang", "Simmons")
- Confirm: "Just to confirm, you're in [Building] room [Number]?"

Communication collection:
- Always ask for email address for updates
- Ask for phone number for urgent notifications  
- Explain: "I'll need your email and phone so our maintenance team can update you"

Once you have location + issue + contact info, you can complete the triage.

Response format: One question at a time, be conversational, acknowledge what they shared.`;
}

function buildTriageContextPrompt(studentMessage, isInitial, conversation, safetyResults, extractedLocation, contextAnalysis) {
  let prompt = `Student message: "${studentMessage}"\n\n`;

  const existingSlots = conversation?.triageData?.conversationSlots || {};
  const pendingQuestions = conversation?.triageData?.pendingQuestions || [];

  if (isInitial) {
    let contextInfo = '';
    if (contextAnalysis?.emotionalState) {
      contextInfo += `Student seems: ${contextAnalysis.emotionalState}\n`;
    }
    if (contextAnalysis?.timelineIndicators?.length > 0) {
      contextInfo += `Timeline cues: ${contextAnalysis.timelineIndicators.join(', ')}\n`;
    }
    if (contextAnalysis?.severityIndicators?.length > 0) {
      contextInfo += `Severity cues: ${contextAnalysis.severityIndicators.join(', ')}\n`;
    }
    
    if (contextInfo) {
      prompt += `Context: ${contextInfo}\n`;
    }

    if (extractedLocation && (extractedLocation.buildingName || extractedLocation.roomNumber)) {
      prompt += `Detected location: Building="${extractedLocation.buildingName || 'unknown'}", Room="${extractedLocation.roomNumber || 'unknown'}" (confidence: ${extractedLocation.confidence})\n\n`;
    }

    prompt += `This is the initial request. Provide a warm greeting, acknowledge their issue, and start gathering the most critical missing information.\n`;
  } else {
    prompt += `This is a follow-up message in an ongoing conversation.\n\n`;
    
    if (Object.keys(existingSlots).length > 0) {
      prompt += `What we already know:\n`;
      if (existingSlots.buildingName) prompt += `- Building: ${existingSlots.buildingName}\n`;
      if (existingSlots.roomNumber) prompt += `- Room: ${existingSlots.roomNumber}\n`;
      if (existingSlots.issueSummary) prompt += `- Issue: ${existingSlots.issueSummary}\n`;
      if (existingSlots.timeline) prompt += `- Timeline: ${existingSlots.timeline}\n`;
      if (existingSlots.severity) prompt += `- Severity: ${existingSlots.severity}\n`;
      prompt += `\n`;
    }
    
    if (pendingQuestions.length > 0) {
      prompt += `Questions in queue: ${pendingQuestions.join(', ')}\n`;
    }
  }

  // Check what we still need
  const hasLocation = (existingSlots.buildingName && existingSlots.roomNumber);
  const hasIssue = existingSlots.issueSummary;
  const hasEmail = conversation?.triageData?.studentEmail;
  const hasPhone = conversation?.triageData?.studentPhone;
  
  prompt += `\nWhat we already know: Location=${hasLocation ? '✓' : '✗'}, Issue=${hasIssue ? '✓' : '✗'}, Email=${hasEmail ? '✓' : '✗'}, Phone=${hasPhone ? '✓' : '✗'}

Ask for the next most important missing piece. Once you have location + issue + email, you can proceed to complete the triage.`;

  if (safetyResults && safetyResults.flags.length > 0) {
    prompt += `SAFETY ALERT: ${safetyResults.flags.join(', ')} - prioritize safety!\n`;
  }

  prompt += `\nRemember: ONE question at a time, be conversational, acknowledge what they shared.`;

  return prompt;
}

async function performSafetyCheck(message) {
  const lowerMessage = message.toLowerCase();
  const flags = [];
  
  const emergencyKeywords = ['fire', 'smoke', 'gas leak', 'electrical shock', 'electrocuted', 'water damage', 'flooding', 'broken glass', 'lockout', 'security', 'injury', 'hurt', 'bleeding'];
  const urgentKeywords = ['no heat', 'no hot water', 'no water', 'toilet overflow', 'ceiling leak', 'window broken'];
  
  for (const keyword of emergencyKeywords) {
    if (lowerMessage.includes(keyword)) {
      flags.push(`Emergency: ${keyword}`);
    }
  }
  
  for (const keyword of urgentKeywords) {
    if (lowerMessage.includes(keyword)) {
      flags.push(`Urgent: ${keyword}`);
    }
  }
  
  return { flags };
}

function analyzeMessageContext(message) {
  const lowerMessage = message.toLowerCase();
  
  const urgentIndicators = ['urgent', 'asap', 'immediately', 'emergency', 'right away', 'broken', 'not working', 'leaking', 'flooding'];
  const timelineIndicators = [];
  const severityIndicators = [];
  
  // Extract timeline cues
  if (lowerMessage.includes('yesterday') || lowerMessage.includes('last night')) {
    timelineIndicators.push('started recently');
  }
  if (lowerMessage.includes('week') || lowerMessage.includes('days')) {
    timelineIndicators.push('ongoing for days');
  }
  
  // Extract severity cues  
  if (lowerMessage.includes('completely') || lowerMessage.includes('totally') || lowerMessage.includes('not working at all')) {
    severityIndicators.push('complete failure');
  }
  if (lowerMessage.includes('little bit') || lowerMessage.includes('slightly') || lowerMessage.includes('sometimes')) {
    severityIndicators.push('intermittent issue');
  }
  
  const isUrgent = urgentIndicators.some(indicator => lowerMessage.includes(indicator));
  const inferredUrgency = isUrgent ? 'urgent' : 'normal';
  
  return {
    isUrgent,
    inferredUrgency,
    timelineIndicators,
    severityIndicators,
    inferredInfo: {
      timeline: timelineIndicators.length > 0 ? timelineIndicators.join(', ') : null,
      severity: severityIndicators.length > 0 ? severityIndicators.join(', ') : null
    }
  };
}

function extractLocationFromMessage(message) {
  const lowerMessage = message.toLowerCase();
  let buildingName = null;
  let roomNumber = null;
  let confidence = 0;
  
  // MIT building detection
  const buildings = {
    'senior house': 'Senior House',
    'baker house': 'Baker House', 
    'burton conner': 'Burton-Conner',
    'tang': 'Tang Hall',
    'simmons': 'Simmons Hall',
    'mccormick': 'McCormick Hall',
    'next house': 'Next House',
    'new house': 'New House',
    'macgregor': 'MacGregor House'
  };
  
  for (const [key, value] of Object.entries(buildings)) {
    if (lowerMessage.includes(key)) {
      buildingName = value;
      confidence += 0.7;
      break;
    }
  }
  
  // Room number detection
  const roomMatch = message.match(/(?:room|unit|apt|apartment)\s*(\d+[a-z]?)/i) || 
                   message.match(/\b(\d{2,4}[a-z]?)\b/);
  if (roomMatch) {
    roomNumber = roomMatch[1];
    confidence += 0.3;
  }
  
  return {
    buildingName,
    roomNumber, 
    confidence,
    reasoning: `Detected building: ${buildingName || 'none'}, room: ${roomNumber || 'none'}`
  };
}

async function completeTriageConversation(conversationId) {
  try {
    console.log(`🏁 Completing triage conversation: ${conversationId}`);
    
    const conversation = await storage.getTriageConversation(conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // Create smart case
    const caseId = await createSmartCase(conversation);
    console.log(`✅ Created smart case: ${caseId}`);
    
    return { isComplete: true, caseId };
  } catch (error) {
    console.error("Error completing triage:", error);
    throw error;
  }
}

async function createSmartCase(conversation) {
  const triageData = conversation.triageData;
  const locationData = triageData?.location;
  
  const newCase = {
    title: `MAINTENANCE: ${conversation.initialRequest.substring(0, 40)}...`,
    description: `Student maintenance request from triage conversation.\n\nInitial request: ${conversation.initialRequest}`,
    category: 'maintenance',
    priority: 'normal', 
    status: "New",
    reportedBy: conversation.studentId,
    orgId: conversation.orgId,
    buildingName: locationData?.buildingName || 'Unknown',
    roomNumber: locationData?.roomNumber || 'Unknown'
  };

  const caseId = await storage.createSmartCase(newCase);
  return caseId;
}

// Export the service as an object for compatibility
export const maillaAIService = {
  startTriageConversation,
  continueTriageConversation
};