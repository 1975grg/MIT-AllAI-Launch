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
  apiKey: process.env.OPENAI_API_KEY
});

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY is required for triage system');
  throw new Error('Missing OPENAI_API_KEY environment variable');
}

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

    // 5. Update conversation - IMPORTANT: Persist triageData with slots and location
    const updatedTriageData = {
      ...conversation.triageData,
      conversationSlots: {
        ...conversation.triageData?.conversationSlots,
        ...maillaResponse.conversationSlots
      }
    };
    
    // Merge location data if present
    if (maillaResponse.location) {
      updatedTriageData.location = {
        ...conversation.triageData?.location,
        ...maillaResponse.location
      };
    }
    
    // Store student contact info if present
    if (maillaResponse.studentEmail) updatedTriageData.studentEmail = maillaResponse.studentEmail;
    if (maillaResponse.studentPhone) updatedTriageData.studentPhone = maillaResponse.studentPhone;
    
    await storage.updateTriageConversation(update.conversationId, {
      conversationHistory: finalHistory,
      urgencyLevel: maillaResponse.urgencyLevel,
      safetyFlags: maillaResponse.safetyFlags,
      currentPhase: maillaResponse.isComplete ? "completed" : "gathering_info",
      triageData: updatedTriageData  // CRITICAL: Persist the conversation data
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
      model: "gpt-5",
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
              studentEmail: { type: "string", description: "Student's email address for updates" },
              studentPhone: { type: "string", description: "Student's phone number for urgent notifications" },
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
      tool_choice: { type: "function", function: { name: "triage_response" } }
    });

    const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "triage_response") {
      throw new Error("Mailla failed to generate triage response");
    }

    const maillaResponse = JSON.parse(toolCall.function.arguments);
    
    // Add safety flags as context for GPT-5 to consider, but don't override its decision
    if (safetyResults && safetyResults.flags.length > 0) {
      maillaResponse.safetyFlags = [...(maillaResponse.safetyFlags || []), ...safetyResults.flags];
      // Let GPT-5 decide the urgency level based on full context, don't force it
    }

    // Enhanced location handling - also update conversationSlots
    if (extractedLocation && (extractedLocation.buildingName || extractedLocation.roomNumber)) {
      if (!maillaResponse.location) {
        maillaResponse.location = {};
      }
      if (!maillaResponse.conversationSlots) {
        maillaResponse.conversationSlots = {};
      }
      
      if (!maillaResponse.location.buildingName && extractedLocation.buildingName) {
        maillaResponse.location.buildingName = extractedLocation.buildingName;
        maillaResponse.conversationSlots.buildingName = extractedLocation.buildingName;
      }
      if (!maillaResponse.location.roomNumber && extractedLocation.roomNumber) {
        maillaResponse.location.roomNumber = extractedLocation.roomNumber;
        maillaResponse.conversationSlots.roomNumber = extractedLocation.roomNumber;
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
      message: "I'm having technical difficulties right now. Can you help me with a few more details? What's your email address so our maintenance team can contact you?",
      urgencyLevel: "normal",
      safetyFlags: [],
      nextAction: "ask_followup",
      isComplete: false
    };
  }
}

// ========================================
// HELPER FUNCTIONS
// ========================================

function getMaillaSystemPrompt() {
  return `You are Mailla, MIT Housing's intelligent maintenance assistant. You help students with maintenance issues through conversational triage.

You're talking to college students in dorms - they're dealing with typical dorm life issues. Most maintenance requests are routine: dripping faucets, heating issues, small repairs, etc. Use your intelligence to assess what's truly urgent vs. normal maintenance.

Your personality: Friendly, understanding, efficient. You get that students aren't maintenance experts and might describe things dramatically when they're just frustrated.

EMERGENCY ASSESSMENT (use your judgment):
- TRUE emergencies: Active fire, gas smell, electrical sparking/shock, major flooding, complete loss of heat in winter, safety hazards
- NOT emergencies: Dripping faucets, minor leaks, heating too hot/cold, normal wear and tear, small repairs

Your job: Gather location, issue description, and student contact info through natural conversation.

Location gathering:
- Ask for building name and room/unit number  
- Be familiar with MIT buildings: Senior House, Baker House, Burton-Conner, Tang, Simmons, McCormick, Next House, New House, MacGregor
- Confirm: "Just to confirm, you're in [Building] room [Number]?"

Communication collection:
- Ask for email address for updates
- Ask for phone number for urgent issues
- Explain: "I'll need your email and phone so our maintenance team can update you"

Once you have location + issue + contact info, you can complete the triage.

Response format: One question at a time, be conversational, acknowledge what they shared. Use your intelligence - don't over-react to normal dorm issues.`;
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

  // Check what we still need - prioritize persisted triageData over current extraction
  const persistedLocation = conversation?.triageData?.location;
  const locationFromPersisted = (persistedLocation?.buildingName && persistedLocation?.roomNumber);
  const locationFromExtracted = (extractedLocation?.buildingName && extractedLocation?.roomNumber);
  const locationFromSlots = (existingSlots.buildingName && existingSlots.roomNumber);
  const hasLocation = locationFromPersisted || locationFromSlots || locationFromExtracted;
  const locationIsConfirmed = persistedLocation?.isLocationConfirmed || false;
  
  const hasIssue = existingSlots.issueSummary || conversation.initialRequest;
  const hasEmail = conversation?.triageData?.studentEmail;
  const hasPhone = conversation?.triageData?.studentPhone;
  
  prompt += `\nWhat we already know: Location=${hasLocation ? '✓' : '✗'}, Issue=${hasIssue ? '✓' : '✗'}, Email=${hasEmail ? '✓' : '✗'}, Phone=${hasPhone ? '✓' : '✗'}

${locationIsConfirmed ? 'Location is confirmed. ' : ''}Ask for the next most important missing piece. Once you have location + issue + email, you can proceed to complete the triage.`;

  if (safetyResults && safetyResults.flags.length > 0) {
    prompt += `Safety context: ${safetyResults.flags.join(', ')} - use your judgment to assess if this is truly urgent.\n`;
  }

  prompt += `\nRemember: ONE question at a time, be conversational, acknowledge what they shared.`;

  return prompt;
}

async function performSafetyCheck(message) {
  // Let GPT-5 handle safety assessment intelligently instead of rigid keyword matching
  // Only flag truly obvious emergencies that need immediate attention
  const lowerMessage = message.toLowerCase();
  const flags = [];
  
  // Only the most critical emergencies that require immediate campus police
  const trueEmergencyKeywords = ['fire', 'smoke', 'gas smell', 'electrical shock', 'electrocuted', 'major flooding', 'injury', 'hurt', 'bleeding'];
  
  for (const keyword of trueEmergencyKeywords) {
    if (lowerMessage.includes(keyword)) {
      // But even then, let GPT-5 make the final decision based on context
      flags.push(`Potential safety concern: ${keyword}`);
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
      confidence += 0.8;
      break;
    }
  }
  
  // Enhanced room number detection - handle "unit", "room", "apt", "apartment"
  const roomMatch = message.match(/(?:room|unit|apt|apartment)\s*(\d+[a-z]?)/i) || 
                   message.match(/(?:rm\.?|#)\s*(\d+[a-z]?)/i) ||
                   message.match(/\b(\d{2,4}[a-z]?)\b/);
  if (roomMatch) {
    roomNumber = roomMatch[1];
    confidence += 0.5;
  }
  
  // Special handling for "unit X" format common in dorms
  const unitMatch = message.match(/unit\s+(\d+[a-z]?)/i);
  if (unitMatch) {
    roomNumber = unitMatch[1];
    confidence += 0.4;
  }
  
  return {
    buildingName,
    roomNumber, 
    confidence,
    reasoning: `Detected building: ${buildingName || 'none'}, room/unit: ${roomNumber || 'none'}`
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
    priority: 'Low', 
    status: "New",
    reportedBy: conversation.studentId,
    orgId: conversation.orgId,
    buildingName: locationData?.buildingName || 'Unknown',
    roomNumber: locationData?.roomNumber || 'Unknown'
  };

  const caseId = await storage.createSmartCase(newCase);
  
  // 🚨 CRITICAL: Wire notifications and WebSocket updates
  try {
    const { notificationService } = await import('./notificationService.js');
    
    // Send email notification to student if available
    if (triageData?.studentEmail) {
      await notificationService.notifyStudent(
        triageData.studentEmail,
        `Maintenance Request Submitted - Case #${newCase.caseNumber || caseId}`,
        `Your maintenance request for ${locationData?.buildingName} ${locationData?.roomNumber} has been submitted and assigned case #${newCase.caseNumber || caseId}. Our maintenance team will contact you soon.`,
        conversation.orgId
      );
    }
    
    // Notify admins about new case
    await notificationService.notifyAdmins({
      type: 'case_created',
      subject: `New Maintenance Case: ${newCase.title}`,
      message: `${locationData?.buildingName} ${locationData?.roomNumber}: ${conversation.initialRequest}`,
      caseId,
      caseNumber: newCase.caseNumber || caseId,
      urgencyLevel: 'normal'
    }, conversation.orgId);
    
    console.log(`✅ Notifications sent for case ${caseId}`);
  } catch (error) {
    console.error('❌ Failed to send notifications for case:', error);
    // Don't fail case creation if notifications fail
  }
  
  return caseId;
}

// Export the service as an object for compatibility
export const maillaAIService = {
  startTriageConversation,
  continueTriageConversation,
  completeTriageConversation
};