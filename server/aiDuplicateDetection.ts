import OpenAI from "openai";
import type { SmartCase } from "@shared/schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface SimilarityMatch {
  caseId: string;
  title: string;
  description: string;
  category: string;
  similarityScore: number; // 0.0 to 1.0
  matchReason: string;
  isDuplicate: boolean; // true if >0.85 similarity
}

export interface DuplicateAnalysisResult {
  isUnique: boolean;
  duplicateOfId?: string;
  similarCases: SimilarityMatch[];
  analysisReason: string;
  confidenceScore: number;
  analysisCompletedAt: string; // ISO timestamp
}

export class AIDuplicateDetectionService {
  /**
   * Analyzes a new maintenance request against existing cases to detect duplicates
   */
  async analyzeDuplicates(
    newCase: {
      title: string;
      description: string;
      category?: string;
      buildingName?: string;
      roomNumber?: string;
      unitId?: string;
    },
    existingCases: SmartCase[]
  ): Promise<DuplicateAnalysisResult> {
    try {
      console.log(`🔍 AI Duplicate Detection: Analyzing "${newCase.title}" against ${existingCases.length} existing cases`);
      
      // Filter existing cases to relevant ones (same building/unit if available)
      const relevantCases = this.filterRelevantCases(newCase, existingCases);
      console.log(`📋 Filtered to ${relevantCases.length} relevant cases for comparison`);
      
      if (relevantCases.length === 0) {
        return {
          isUnique: true,
          similarCases: [],
          analysisReason: "No existing cases found for comparison",
          confidenceScore: 1.0,
          analysisCompletedAt: new Date().toISOString()
        };
      }
      
      // Use AI to perform semantic similarity analysis
      const similarities = await this.performSemanticAnalysis(newCase, relevantCases);
      
      // Sort by similarity score (highest first)
      similarities.sort((a, b) => b.similarityScore - a.similarityScore);
      
      // Determine if any case is a duplicate (>85% similarity)
      const potentialDuplicate = similarities.find(s => s.similarityScore > 0.85);
      
      const result: DuplicateAnalysisResult = {
        isUnique: !potentialDuplicate,
        duplicateOfId: potentialDuplicate?.caseId,
        similarCases: similarities.slice(0, 5), // Top 5 similar cases
        analysisReason: potentialDuplicate 
          ? `High similarity (${(potentialDuplicate.similarityScore * 100).toFixed(1)}%) detected with case ${potentialDuplicate.caseId}`
          : "No significant duplicates found - appears to be a unique request",
        confidenceScore: potentialDuplicate ? potentialDuplicate.similarityScore : 0.95,
        analysisCompletedAt: new Date().toISOString()
      };
      
      console.log(`🎯 Duplicate Analysis Complete: ${result.isUnique ? 'UNIQUE' : 'DUPLICATE'} (confidence: ${(result.confidenceScore * 100).toFixed(1)}%)`);
      
      return result;
      
    } catch (error) {
      console.error("🚨 AI Duplicate Detection Error:", error);
      return {
        isUnique: true, // Default to unique on error to avoid blocking requests
        similarCases: [],
        analysisReason: "Duplicate detection failed - treating as unique request",
        confidenceScore: 0.5,
        analysisCompletedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Performs semantic similarity analysis using AI
   */
  private async performSemanticAnalysis(
    newCase: { title: string; description: string; category?: string; buildingName?: string; roomNumber?: string },
    existingCases: SmartCase[]
  ): Promise<SimilarityMatch[]> {
    
    const prompt = this.buildSimilarityPrompt(newCase, existingCases);
    
    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system", 
            content: "You are an expert at analyzing maintenance requests to detect duplicates and similar issues. Focus on the core problem, location, and symptoms rather than just keywords."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Similarity analysis timeout")), 20000)
      )
    ]) as any;

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No content received from similarity analysis");
    }
    
    const result = JSON.parse(content);
    return this.validateSimilarityResults(result.similarities || []);
  }

  /**
   * Builds the AI prompt for similarity analysis
   */
  private buildSimilarityPrompt(
    newCase: { title: string; description: string; category?: string; buildingName?: string; roomNumber?: string },
    existingCases: SmartCase[]
  ): string {
    const casesList = existingCases.map((c, index) => 
      `${index + 1}. ID: ${c.id}
   Title: ${c.title}
   Description: ${c.description || 'No description'}
   Category: ${c.category || 'Uncategorized'}
   Building: ${c.buildingName || 'Unknown'}
   Room: ${c.roomNumber || 'Unknown'}
   Status: ${c.status}
   Created: ${c.createdAt}`
    ).join('\n\n');

    return `
Analyze this NEW maintenance request against existing cases to detect duplicates and similar issues:

NEW REQUEST:
Title: ${newCase.title}
Description: ${newCase.description}
Category: ${newCase.category || 'Unknown'}
Building: ${newCase.buildingName || 'Unknown'}  
Room: ${newCase.roomNumber || 'Unknown'}

EXISTING CASES TO COMPARE:
${casesList}

For each existing case, analyze:
1. Same core problem? (e.g., both are leaky faucets, broken outlets, etc.)
2. Same or very close location? (same building/room/unit)
3. Similar symptoms and circumstances?
4. Could they be the same underlying issue?

Respond with JSON in this format:
{
  "similarities": [
    {
      "caseId": "existing-case-id",
      "title": "existing case title",
      "description": "existing case description", 
      "category": "existing case category",
      "similarityScore": 0.95,
      "matchReason": "Same leaky faucet in bathroom - identical symptoms and location",
      "isDuplicate": true
    }
  ]
}

Similarity Scoring Guidelines:
- 1.0 = Identical issue, same location
- 0.9-0.95 = Same problem, same room/unit 
- 0.8-0.89 = Same problem type, nearby location
- 0.7-0.79 = Similar problem, same building
- 0.6-0.69 = Related issue type
- 0.5 and below = Different issues

Only include cases with similarity > 0.6. Mark isDuplicate=true for scores > 0.85.
`;
  }

  /**
   * Filters existing cases to those most relevant for comparison
   */
  private filterRelevantCases(
    newCase: { buildingName?: string; roomNumber?: string; unitId?: string; category?: string },
    existingCases: SmartCase[]
  ): SmartCase[] {
    // Start with all cases from last 30 days to avoid comparing against very old cases
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    let relevantCases = existingCases.filter(c => 
      c.createdAt && new Date(c.createdAt) >= thirtyDaysAgo && c.status !== 'Closed'
    );
    
    // Prioritize same building/room/unit
    if (newCase.unitId || newCase.buildingName || newCase.roomNumber) {
      const sameLocationCases = relevantCases.filter(c => 
        (newCase.unitId && c.unitId === newCase.unitId) ||
        (newCase.buildingName && c.buildingName === newCase.buildingName) ||
        (newCase.roomNumber && c.roomNumber === newCase.roomNumber)
      );
      
      if (sameLocationCases.length > 0) {
        relevantCases = sameLocationCases;
      }
    }
    
    // If too many cases, prioritize by category and recency
    if (relevantCases.length > 20) {
      const sameCategoryCases = relevantCases.filter(c => 
        newCase.category && c.category === newCase.category
      );
      
      if (sameCategoryCases.length > 0 && sameCategoryCases.length <= 20) {
        relevantCases = sameCategoryCases;
      } else {
        // Take most recent 20 cases
        relevantCases = relevantCases
          .sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
          })
          .slice(0, 20);
      }
    }
    
    return relevantCases;
  }

  /**
   * Validates and normalizes similarity analysis results
   */
  private validateSimilarityResults(similarities: any[]): SimilarityMatch[] {
    return similarities
      .filter(s => s.caseId && typeof s.similarityScore === 'number')
      .map(s => ({
        caseId: s.caseId,
        title: s.title || 'No title',
        description: s.description || 'No description',
        category: s.category || 'Unknown',
        similarityScore: Math.max(0, Math.min(1, Number(s.similarityScore))), // Clamp 0-1
        matchReason: s.matchReason || 'Similar maintenance request',
        isDuplicate: s.isDuplicate === true || s.similarityScore > 0.85
      }))
      .filter(s => s.similarityScore > 0.6) // Only include meaningful similarities
      .slice(0, 10); // Limit to top 10 matches
  }

  /**
   * Generates merge recommendations for confirmed duplicates
   */
  async generateMergeRecommendation(
    originalCaseId: string,
    duplicateCaseId: string,
    similarityScore: number
  ): Promise<{
    shouldMerge: boolean;
    mergeStrategy: 'keep_original' | 'keep_duplicate' | 'combine_info';
    reasoning: string;
    mergeActions: string[];
  }> {
    
    const shouldMerge = similarityScore > 0.90; // Only auto-merge very high confidence
    
    return {
      shouldMerge,
      mergeStrategy: 'keep_original', // Usually keep the older case
      reasoning: shouldMerge 
        ? `High confidence duplicate detected (${(similarityScore * 100).toFixed(1)}% similarity). Recommend merging to avoid duplicate work.`
        : `Moderate similarity (${(similarityScore * 100).toFixed(1)}%). Recommend manual review before merging.`,
      mergeActions: shouldMerge ? [
        'Mark duplicate case as merged',
        'Transfer any unique information to original case',
        'Update case description with consolidated details',
        'Notify submitters about case consolidation',
        'Update contractor assignments if needed'
      ] : [
        'Flag for manual review',
        'Add note about similar case for reference',
        'Monitor both cases for resolution'
      ]
    };
  }

  /**
   * Creates similarity embeddings for faster future comparisons
   */
  async createCaseEmbedding(caseText: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: caseText
      });
      
      return response.data[0].embedding;
    } catch (error) {
      console.error("Error creating case embedding:", error);
      return [];
    }
  }
}

// Export singleton instance  
export const aiDuplicateDetectionService = new AIDuplicateDetectionService();