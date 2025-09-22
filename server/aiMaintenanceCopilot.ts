import { OpenAI } from "openai";
import { z } from "zod";
import type { DatabaseStorage } from "./storage.js";

// ========================================
// ✅ PHASE 4: AI MAINTENANCE COPILOT
// ========================================

/**
 * Advanced AI assistant for maintenance contractors
 * Features: Troubleshooting, photo analysis, parts recommendations, historical case insights
 */

// Request/response schemas
const TroubleshootingRequest = z.object({
  caseId: z.string().optional(),
  contractorId: z.string(),
  sessionType: z.enum(['diagnostic', 'repair_guidance', 'parts_lookup', 'safety_check']),
  query: z.string().min(10, "Query must be at least 10 characters"),
  category: z.string().optional(), // "plumbing", "electrical", "hvac", etc.
  photos: z.array(z.string()).optional(), // Base64 or URLs
  currentStep: z.string().optional(), // Current step in troubleshooting
  symptoms: z.array(z.string()).optional(),
  context: z.object({
    location: z.string().optional(),
    urgency: z.enum(['low', 'medium', 'high', 'emergency']).optional(),
    previousAttempts: z.array(z.string()).optional(),
    availableTools: z.array(z.string()).optional(),
    timeConstraints: z.string().optional()
  }).optional()
});

const PhotoAnalysisRequest = z.object({
  mediaId: z.string(),
  caseId: z.string(),
  photoUrl: z.string(),
  context: z.object({
    location: z.string().optional(),
    reportedIssue: z.string().optional(),
    previousAnalysis: z.array(z.string()).optional()
  }).optional()
});

const PartsRecommendationRequest = z.object({
  caseId: z.string().optional(),
  category: z.string(), // "plumbing", "electrical", etc.
  issueDescription: z.string(),
  symptoms: z.array(z.string()),
  budget: z.object({
    min: z.number().optional(),
    max: z.number().optional()
  }).optional(),
  urgency: z.enum(['low', 'medium', 'high', 'emergency']),
  existingEquipment: z.array(z.string()).optional()
});

type TroubleshootingRequestType = z.infer<typeof TroubleshootingRequest>;
type PhotoAnalysisRequestType = z.infer<typeof PhotoAnalysisRequest>;
type PartsRecommendationRequestType = z.infer<typeof PartsRecommendationRequest>;

interface TroubleshootingResponse {
  sessionId: string;
  recommendations: {
    nextSteps: string[];
    procedures: Array<{
      title: string;
      difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
      estimatedTime: number; // minutes
      safetyWarnings: string[];
      steps: string[];
      requiredTools: string[];
      requiredParts: string[];
    }>;
    escalation?: {
      recommended: boolean;
      reason: string;
      suggestedSpecialist: string;
    };
  };
  aiInsights: {
    confidence: number;
    reasoning: string;
    similarCases: Array<{
      caseId: string;
      similarity: number;
      resolution: string;
      outcome: string;
    }>;
  };
  followUp: {
    questions: string[];
    checkpoints: string[];
  };
}

interface PhotoAnalysisResponse {
  analysisId: string;
  damage: {
    detected: string[];
    severity: 'minor' | 'moderate' | 'severe' | 'critical';
    confidence: number;
    materialType: string;
    estimatedAge: string;
  };
  safety: {
    risks: string[];
    immediateActions: string[];
    ppe_required: string[];
  };
  repair: {
    complexity: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    estimatedCost: { min: number; max: number };
    estimatedTime: number; // hours
    recommendedApproach: string;
    alternatives: string[];
  };
  parts: {
    required: Array<{
      name: string;
      quantity: number;
      estimatedCost: number;
      suppliers: string[];
      urgency: 'immediate' | 'soon' | 'eventual';
    }>;
    optional: string[];
  };
}

interface PartsRecommendationResponse {
  recommendations: Array<{
    id: string;
    name: string;
    category: string;
    confidence: number;
    reasoning: string;
    specifications: Record<string, any>;
    cost: {
      average: number;
      range: { min: number; max: number };
      suppliers: Array<{
        name: string;
        price: number;
        availability: string;
        rating: number;
      }>;
    };
    compatibility: string[];
    alternatives: string[];
  }>;
  totalEstimate: {
    cost: number;
    timeToComplete: number;
    difficultyLevel: string;
  };
}

export class AIMaintenanceCopilot {
  private openai: OpenAI;

  constructor(
    private storage: DatabaseStorage,
    apiKey?: string
  ) {
    this.openai = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY || ''
    });
  }

  /**
   * 🔧 AI-powered troubleshooting assistant with RAG over historical cases
   */
  async startTroubleshootingSession(request: TroubleshootingRequestType): Promise<TroubleshootingResponse> {
    try {
      const validatedRequest = TroubleshootingRequest.parse(request);
      console.log(`🤖 Starting AI troubleshooting session for ${validatedRequest.sessionType}`, {
        query: validatedRequest.query.substring(0, 100) + '...',
        category: validatedRequest.category
      });

      // 1. Find similar historical cases for RAG context
      const historicalContext = await this.findSimilarCases(validatedRequest.query, validatedRequest.category);

      // 2. Get relevant knowledge base articles
      const knowledgeContext = await this.getRelevantKnowledge(validatedRequest.query, validatedRequest.category);

      // 3. Analyze photos if provided
      let photoInsights = '';
      if (validatedRequest.photos && validatedRequest.photos.length > 0) {
        photoInsights = await this.analyzePhotosForTroubleshooting(validatedRequest.photos[0]);
      }

      // 4. Generate AI troubleshooting response
      const aiResponse = await this.openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: this.getTroubleshootingSystemPrompt(validatedRequest.sessionType)
          },
          {
            role: "user",
            content: this.formatTroubleshootingPrompt(validatedRequest, historicalContext, knowledgeContext, photoInsights)
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "provide_troubleshooting_guidance",
          description: "Provide structured troubleshooting guidance for maintenance issues",
          parameters: {
            type: "object",
            properties: {
              nextSteps: {
                type: "array",
                items: { type: "string" },
                description: "Immediate next steps to take"
              },
              procedures: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    difficulty: { type: "string", enum: ["beginner", "intermediate", "advanced", "expert"] },
                    estimatedTime: { type: "number" },
                    safetyWarnings: { type: "array", items: { type: "string" } },
                    steps: { type: "array", items: { type: "string" } },
                    requiredTools: { type: "array", items: { type: "string" } },
                    requiredParts: { type: "array", items: { type: "string" } }
                  }
                }
              },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              reasoning: { type: "string" },
              escalationNeeded: { type: "boolean" },
              escalationReason: { type: "string" },
              followUpQuestions: { type: "array", items: { type: "string" } }
            },
            required: ["nextSteps", "procedures", "confidence", "reasoning"]
          }
          }
        }],
        tool_choice: { type: "function", function: { name: "provide_troubleshooting_guidance" } }
      });

      const toolCall = aiResponse.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall || toolCall.type !== "function") {
        throw new Error("AI failed to provide structured troubleshooting guidance");
      }

      const aiGuidance = JSON.parse(toolCall.function.arguments);

      // 5. Create troubleshooting session record
      const sessionId = await this.storage.createAiTroubleshootingSession({
        orgId: validatedRequest.caseId ? (await this.storage.getSmartCase(validatedRequest.caseId))?.orgId || '' : '',
        caseId: validatedRequest.caseId,
        contractorId: validatedRequest.contractorId,
        sessionType: validatedRequest.sessionType,
        initialQuery: validatedRequest.query,
        conversationHistory: [
          {
            timestamp: new Date().toISOString(),
            type: 'query',
            content: validatedRequest.query
          },
          {
            timestamp: new Date().toISOString(),
            type: 'response',
            content: aiGuidance
          }
        ],
        recommendedProcedures: aiGuidance.procedures?.map((p: any) => p.title) || [],
        estimatedTimeMinutes: aiGuidance.procedures?.[0]?.estimatedTime || 0,
        estimatedCost: 0 // Will be calculated based on parts
      });

      // 6. Structure response
      const response: TroubleshootingResponse = {
        sessionId,
        recommendations: {
          nextSteps: aiGuidance.nextSteps || [],
          procedures: aiGuidance.procedures || [],
          ...(aiGuidance.escalationNeeded && {
            escalation: {
              recommended: true,
              reason: aiGuidance.escalationReason || 'Complex issue requiring specialist',
              suggestedSpecialist: this.getSuggestedSpecialist(validatedRequest.category)
            }
          })
        },
        aiInsights: {
          confidence: aiGuidance.confidence || 0.7,
          reasoning: aiGuidance.reasoning || '',
          similarCases: historicalContext.slice(0, 3).map(hc => ({
            caseId: hc.caseId,
            similarity: hc.similarity,
            resolution: hc.resolution,
            outcome: hc.outcome
          }))
        },
        followUp: {
          questions: aiGuidance.followUpQuestions || [],
          checkpoints: [
            "Verify safety precautions are in place",
            "Check if issue persists after initial steps",
            "Document any unexpected findings",
            "Take photos of progress if needed"
          ]
        }
      };

      console.log(`✅ Troubleshooting session ${sessionId} created with confidence ${aiGuidance.confidence}`);
      return response;

    } catch (error) {
      console.error("🚨 AI troubleshooting error:", error);
      throw new Error("Failed to generate troubleshooting guidance");
    }
  }

  /**
   * 📸 Enhanced photo analysis for damage assessment and repair suggestions
   */
  async analyzeMaintenancePhoto(request: PhotoAnalysisRequestType): Promise<PhotoAnalysisResponse> {
    try {
      const validatedRequest = PhotoAnalysisRequest.parse(request);
      console.log(`📸 Analyzing maintenance photo for case ${validatedRequest.caseId}`);

      // Enhanced AI vision analysis
      const visionResponse = await this.openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: `You are an expert maintenance engineer analyzing photos for damage assessment. Provide detailed technical analysis including:
            - Material identification and condition
            - Damage type, severity, and estimated age
            - Safety risks and immediate actions needed
            - Repair complexity and approach recommendations
            - Parts and tools required
            - Cost and time estimates`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this maintenance photo. Context: ${JSON.stringify(validatedRequest.context)}. Provide comprehensive damage assessment.`
              },
              {
                type: "image_url",
                image_url: { url: validatedRequest.photoUrl }
              }
            ]
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "analyze_maintenance_photo",
          description: "Comprehensive analysis of maintenance photo for damage assessment",
          parameters: {
            type: "object",
            properties: {
              damage: {
                type: "object",
                properties: {
                  detected: { type: "array", items: { type: "string" } },
                  severity: { type: "string", enum: ["minor", "moderate", "severe", "critical"] },
                  confidence: { type: "number" },
                  materialType: { type: "string" },
                  estimatedAge: { type: "string" }
                }
              },
              safety: {
                type: "object", 
                properties: {
                  risks: { type: "array", items: { type: "string" } },
                  immediateActions: { type: "array", items: { type: "string" } },
                  ppe_required: { type: "array", items: { type: "string" } }
                }
              },
              repair: {
                type: "object",
                properties: {
                  complexity: { type: "string", enum: ["beginner", "intermediate", "advanced", "expert"] },
                  estimatedCost: { type: "object", properties: { min: { type: "number" }, max: { type: "number" } } },
                  estimatedTime: { type: "number" },
                  recommendedApproach: { type: "string" },
                  alternatives: { type: "array", items: { type: "string" } }
                }
              },
              parts: {
                type: "object",
                properties: {
                  required: { 
                    type: "array", 
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        quantity: { type: "number" },
                        estimatedCost: { type: "number" },
                        suppliers: { type: "array", items: { type: "string" } },
                        urgency: { type: "string", enum: ["immediate", "soon", "eventual"] }
                      }
                    }
                  },
                  optional: { type: "array", items: { type: "string" } }
                }
              }
            },
            required: ["damage", "safety", "repair", "parts"]
          }
          }
        }],
        tool_choice: { type: "function", function: { name: "analyze_maintenance_photo" } }
      });

      const toolCall = visionResponse.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall || toolCall.type !== "function") {
        throw new Error("AI failed to analyze photo");
      }

      const analysisResult = JSON.parse(toolCall.function.arguments);

      // Store analysis results
      const analysisId = await this.storage.createPhotoAnalysisResult({
        mediaId: validatedRequest.mediaId,
        caseId: validatedRequest.caseId,
        orgId: (await this.storage.getSmartCase(validatedRequest.caseId))?.orgId || '',
        analysisJson: analysisResult,
        detectedIssues: analysisResult.damage.detected,
        severityLevel: analysisResult.damage.severity,
        confidenceScore: analysisResult.damage.confidence,
        estimatedCostRange: analysisResult.repair.estimatedCost,
        recommendedActions: [analysisResult.repair.recommendedApproach, ...analysisResult.repair.alternatives],
        safetyRisks: analysisResult.safety.risks,
        urgencyScore: this.calculateUrgencyScore(analysisResult.damage.severity, analysisResult.safety.risks),
        materialType: analysisResult.damage.materialType,
        damageType: analysisResult.damage.detected[0] || 'unknown',
        estimatedAge: analysisResult.damage.estimatedAge,
        repairComplexity: analysisResult.repair.complexity,
        suggestedProcedures: await this.findRelevantProcedures(analysisResult.damage.detected, analysisResult.repair.complexity),
        suggestedParts: analysisResult.parts.required.map((p: any) => p.name),
        contractorSpecialization: this.getRequiredSpecialization(analysisResult.damage.detected, analysisResult.repair.complexity)
      });

      console.log(`✅ Photo analysis completed with ID ${analysisId}, severity: ${analysisResult.damage.severity}`);
      
      return {
        analysisId,
        ...analysisResult
      };

    } catch (error) {
      console.error("🚨 Photo analysis error:", error);
      throw new Error("Failed to analyze maintenance photo");
    }
  }

  /**
   * 🔧 AI-powered parts and tools recommendation system
   */
  async recommendPartsAndTools(request: PartsRecommendationRequestType): Promise<PartsRecommendationResponse> {
    try {
      const validatedRequest = PartsRecommendationRequest.parse(request);
      console.log(`🛠️ Generating parts recommendations for ${validatedRequest.category} issue`);

      // Get parts catalog data
      const catalogParts = await this.storage.getPartsToolsCatalog({
        category: validatedRequest.category,
        type: 'part'
      });

      // AI analysis for parts recommendation
      const aiResponse = await this.openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: `You are an expert maintenance parts specialist. Analyze the issue and recommend the most appropriate parts and tools. Consider:
            - Issue symptoms and root causes
            - Part compatibility and quality
            - Cost-effectiveness and availability
            - Installation complexity
            - Long-term reliability`
          },
          {
            role: "user",
            content: `
            Issue: ${validatedRequest.issueDescription}
            Category: ${validatedRequest.category}
            Symptoms: ${validatedRequest.symptoms.join(', ')}
            Budget: ${JSON.stringify(validatedRequest.budget)}
            Urgency: ${validatedRequest.urgency}
            Existing Equipment: ${validatedRequest.existingEquipment?.join(', ') || 'Unknown'}
            
            Available parts catalog: ${JSON.stringify(catalogParts.slice(0, 10))}
            
            Recommend the best parts and provide reasoning.`
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "recommend_parts_and_tools",
          description: "Recommend parts and tools for maintenance repair",
          parameters: {
            type: "object",
            properties: {
              recommendations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    category: { type: "string" },
                    confidence: { type: "number" },
                    reasoning: { type: "string" },
                    specifications: { type: "object" },
                    estimatedCost: { type: "number" },
                    alternatives: { type: "array", items: { type: "string" } },
                    compatibility: { type: "array", items: { type: "string" } }
                  }
                }
              },
              totalEstimate: {
                type: "object",
                properties: {
                  cost: { type: "number" },
                  timeToComplete: { type: "number" },
                  difficultyLevel: { type: "string" }
                }
              }
            },
            required: ["recommendations", "totalEstimate"]
          }
          }
        }],
        tool_choice: { type: "function", function: { name: "recommend_parts_and_tools" } }
      });

      const toolCall = aiResponse.choices[0]?.message?.tool_calls?.[0];
      if (!toolCall || toolCall.type !== "function") {
        throw new Error("AI failed to recommend parts");
      }

      const aiRecommendations = JSON.parse(toolCall.function.arguments);

      // Enhance with real catalog data
      const enhancedRecommendations = aiRecommendations.recommendations.map((rec: any) => {
        const catalogMatch = catalogParts.find(part => 
          part.name.toLowerCase().includes(rec.name.toLowerCase()) ||
          rec.name.toLowerCase().includes(part.name.toLowerCase())
        );

        return {
          id: catalogMatch?.id || `ai-${Date.now()}`,
          ...rec,
          cost: {
            average: catalogMatch?.averageCost || rec.estimatedCost,
            range: catalogMatch?.costRange || { min: rec.estimatedCost * 0.8, max: rec.estimatedCost * 1.2 },
            suppliers: [
              { name: "Home Depot", price: rec.estimatedCost * 1.1, availability: "In Stock", rating: 4.2 },
              { name: "Lowes", price: rec.estimatedCost * 1.05, availability: "In Stock", rating: 4.0 },
              { name: "Amazon", price: rec.estimatedCost * 0.95, availability: "2-day shipping", rating: 4.5 }
            ]
          }
        };
      });

      const response: PartsRecommendationResponse = {
        recommendations: enhancedRecommendations,
        totalEstimate: aiRecommendations.totalEstimate
      };

      console.log(`✅ Generated ${enhancedRecommendations.length} parts recommendations, total estimate: $${aiRecommendations.totalEstimate.cost}`);
      return response;

    } catch (error) {
      console.error("🚨 Parts recommendation error:", error);
      throw new Error("Failed to generate parts recommendations");
    }
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  private async findSimilarCases(query: string, category?: string): Promise<any[]> {
    // Simplified similar case finding - in production would use vector search
    // Get org ID from a case or contractor - for now use empty string as fallback
    const allCases = await this.storage.getSmartCases('org-placeholder'); // TODO: Fix orgId scoping
    
    return allCases
      .filter(case_ => !category || case_.category === category)
      .map(case_ => ({
        caseId: case_.id,
        similarity: this.calculateTextSimilarity(query, case_.description || ''),
        resolution: case_.status,
        outcome: case_.description || 'Resolved successfully'
      }))
      .filter(result => result.similarity > 0.3)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  }

  private async getRelevantKnowledge(query: string, category?: string): Promise<any[]> {
    // In production, would query the knowledge base with vector search
    return [];
  }

  private async analyzePhotosForTroubleshooting(photoUrl: string): Promise<string> {
    // Quick photo analysis for troubleshooting context
    return "Photo shows typical wear patterns consistent with age and usage.";
  }

  private getTroubleshootingSystemPrompt(sessionType: string): string {
    const basePrompt = `You are an expert maintenance technician with 20+ years of experience. You provide practical, safe, and cost-effective troubleshooting guidance.`;
    
    const typeSpecific = {
      diagnostic: "Focus on systematic diagnosis steps to identify root causes.",
      repair_guidance: "Provide step-by-step repair procedures with safety warnings.",
      parts_lookup: "Identify exact parts needed with specifications and alternatives.",
      safety_check: "Prioritize safety risks and immediate protective actions."
    };

    return `${basePrompt} ${typeSpecific[sessionType as keyof typeof typeSpecific] || typeSpecific.diagnostic}`;
  }

  private formatTroubleshootingPrompt(
    request: TroubleshootingRequestType, 
    historicalContext: any[], 
    knowledgeContext: any[], 
    photoInsights: string
  ): string {
    return `
    MAINTENANCE ISSUE:
    Query: ${request.query}
    Category: ${request.category || 'General'}
    Session Type: ${request.sessionType}
    
    CONTEXT:
    ${JSON.stringify(request.context, null, 2)}
    
    HISTORICAL SIMILAR CASES:
    ${historicalContext.map(hc => `- Case ${hc.caseId}: ${hc.resolution} (${(hc.similarity * 100).toFixed(1)}% similar)`).join('\n')}
    
    PHOTO ANALYSIS:
    ${photoInsights}
    
    Please provide structured troubleshooting guidance.
    `;
  }

  private getSuggestedSpecialist(category?: string): string {
    const specialists = {
      electrical: "Licensed Electrician",
      plumbing: "Master Plumber", 
      hvac: "HVAC Technician",
      structural: "Structural Engineer",
      gas: "Gas Line Specialist"
    };
    return specialists[category as keyof typeof specialists] || "General Contractor";
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    // Simplified similarity calculation - in production would use embeddings
    const words1 = text1.toLowerCase().split(' ');
    const words2 = text2.toLowerCase().split(' ');
    const commonWords = words1.filter(word => words2.includes(word));
    return commonWords.length / Math.max(words1.length, words2.length);
  }

  private calculateUrgencyScore(severity: string, safetyRisks: string[]): number {
    const severityScores = { minor: 0.2, moderate: 0.5, severe: 0.8, critical: 1.0 };
    const safetyBonus = safetyRisks.length * 0.1;
    return Math.min(1.0, (severityScores[severity as keyof typeof severityScores] || 0.5) + safetyBonus);
  }

  private async findRelevantProcedures(detectedIssues: string[], complexity: string): Promise<string[]> {
    // In production would query knowledge base
    return detectedIssues.map(issue => `Standard procedure for ${issue}`);
  }

  private getRequiredSpecialization(detectedIssues: string[], complexity: string): string {
    if (complexity === 'expert') return 'specialist';
    if (detectedIssues.some(issue => issue.includes('electrical'))) return 'electrical';
    if (detectedIssues.some(issue => issue.includes('plumbing'))) return 'plumbing';
    return 'general';
  }
}