import { OpenAI } from 'openai';

const CONTRACTOR_SYSTEM_PROMPT = `You are a friendly, human-like AI assistant supporting students in campus housing when they report maintenance issues. Imagine you are the contractor who will be dispatched. Your role is to:

Think like the contractor:

Ask the questions you would need to know before driving over:

How urgent is this? (Is anyone unsafe? Is property at risk?)

What exactly is happening? (symptoms, when it started, is it constant or intermittent)

Where is it located? (room, floor, building, appliance type)

Are there simple checks the student can safely try now (breaker, plug, thermostat)?

Could a photo, video, or audio clip help confirm details? (always optional)

Goal: gather enough info to bring the right tools, parts, and plan the right amount of time.

De-escalate first:

Offer quick, safe steps that might fix the problem without needing a dispatch (reset breaker, replug cord, adjust thermostat, relight pilot if safe).

If fixed, close warmly: "Glad we could solve this without a visit. Please reach out if it happens again."

Triage for dispatch:

If not solved, classify the issue:

Emergency (safety hazard, active flooding, no heat in cold weather, no power, gas smell).

Urgent (water leak contained, partial power, major appliance down).

Routine (minor drip, appliance inconvenience, cosmetic).

Reassure the student appropriately.

Mitigation & Comfort:

Give safe, practical steps while waiting:

Towels/buckets under leaks.

Avoid outlets near water.

Blankets or stay with friends if no heat.

Guide to water shutoff valve if necessary (offer example photo, ask them to send a picture to confirm).

Case creation & updates:

Summarize the problem clearly in plain words for contractor scheduling.

Include urgency, location, description, and suspected parts/tools.

Communicate with the student:

Contractor scheduled (share appointment window).

Appointment confirmed (student doesn't always need to be present).

Job complete (ask if resolved).

Tone and Flow:

Always kind, warm, and supportive.

Ask questions in small, natural clusters (never interrogate).

Use short, clear sentences, like a helpful human contractor would.

Keep the student reassured and informed throughout.

Context: Students in campus housing with little to no repair experience. Your goal is to act like the contractor preparing to come on-site—asking the right questions, understanding urgency, preparing correctly, de-escalating when possible, and keeping the student comfortable and informed until resolution.

This makes the AI behave like the dispatcher + contractor rolled into one:

First, it tries to avoid a trip (de-escalation).

If not, it triages with the same curiosity a real contractor would have (so they don't show up unprepared).

Then it mitigates, dispatches, and communicates.

CRITICAL CASE CREATION RULE: 
When you have gathered enough information to create a maintenance case (student info, location, description), you MUST respond with ONLY this exact format:

CREATE_CASE: {
  "title": "Brief title of the issue",
  "description": "Detailed description for the contractor", 
  "urgency": "Emergency",
  "location": "Building Room",
  "category": "HVAC",
  "studentInfo": "Email: student@school.edu, Name: Student Name, Phone: xxx-xxx-xxxx"
}

Example for HVAC issue:
User: "AC not working in Tang Hall 123 for student nihal3@mit.edu"
You: CREATE_CASE: {"title": "HVAC: Air conditioning not working", "description": "Student reports AC not working in Tang Hall room 123. Unit is not responding to controls.", "urgency": "Urgent", "location": "Tang Hall 123", "category": "HVAC", "studentInfo": "Email: nihal3@mit.edu"}

IMPORTANT: Output ONLY the CREATE_CASE line, no additional text before or after it!`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatSession {
  id: string;
  studentId: string;
  orgId: string;
  messages: ChatMessage[];
  isComplete: boolean;
  caseCreated?: string; // case ID if created
}

export class ContractorChatService {
  private openai: OpenAI;
  private activeSessions: Map<string, ChatSession> = new Map();

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async startChat(studentId: string, orgId: string, initialMessage: string): Promise<{ sessionId: string; response: string }> {
    const sessionId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const session: ChatSession = {
      id: sessionId,
      studentId,
      orgId,
      messages: [
        {
          role: 'user',
          content: initialMessage,
          timestamp: new Date()
        }
      ],
      isComplete: false
    };

    // Get GPT-5 response
    const response = await this.getChatGPTResponse(session.messages);
    
    // Add response to session
    session.messages.push({
      role: 'assistant',
      content: response,
      timestamp: new Date()
    });

    // Store session
    this.activeSessions.set(sessionId, session);

    return {
      sessionId,
      response
    };
  }

  async continueChat(sessionId: string, userMessage: string): Promise<{ response: string; caseData?: any }> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Chat session not found');
    }

    // Add user message
    session.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    });

    // Get GPT response
    const response = await this.getChatGPTResponse(session.messages);
    console.log('🤖 GPT Response:', response.substring(0, 200));

    // Check if this is a case creation response
    if (response.includes('CREATE_CASE:')) {
      console.log('📋 CREATE_CASE detected in response');
      try {
        // Extract JSON from response - find the JSON object between { and }
        const jsonStart = response.indexOf('{');
        const jsonEnd = response.lastIndexOf('}');
        
        console.log(`🔍 JSON boundaries: start=${jsonStart}, end=${jsonEnd}`);
        
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          const jsonStr = response.substring(jsonStart, jsonEnd + 1);
          console.log('🔍 Extracted JSON string:', jsonStr);
          
          const caseData = JSON.parse(jsonStr);
          console.log('✅ Parsed case data successfully:', JSON.stringify(caseData, null, 2));
          
          // Mark session as complete
          session.isComplete = true;
          session.caseCreated = 'pending';
          
          // Return both the case data and a friendly response
          return {
            response: "I've gathered all the information needed. Let me create a maintenance request for you right away. A contractor will be in touch soon!",
            caseData
          };
        } else {
          console.error('❌ Could not find valid JSON boundaries in response');
        }
      } catch (error) {
        console.error('Failed to parse case creation data:', error);
        console.error('Response was:', response);
        // Fall back to regular response
      }
    }

    // Add response to session
    session.messages.push({
      role: 'assistant',
      content: response,
      timestamp: new Date()
    });

    return { response };
  }

  private async getChatGPTResponse(messages: ChatMessage[]): Promise<string> {
    try {
      const openAIMessages = [
        { role: 'system' as const, content: CONTRACTOR_SYSTEM_PROMPT },
        ...messages.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        }))
      ];

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o', // Using GPT-4o as GPT-5 isn't publicly available yet
        messages: openAIMessages,
        temperature: 0.7,
        max_tokens: 500
      });

      return completion.choices[0]?.message?.content || 'I apologize, but I encountered an issue. Could you please repeat your question?';
    } catch (error) {
      console.error('OpenAI API error:', error);
      return 'I apologize, but I\'m having trouble connecting right now. Could you please try again in a moment?';
    }
  }

  getSession(sessionId: string): ChatSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  clearSession(sessionId: string): void {
    this.activeSessions.delete(sessionId);
  }
}

export const contractorChatService = new ContractorChatService();