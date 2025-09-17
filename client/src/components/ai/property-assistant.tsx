import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Bot, Send, Lightbulb, CheckCircle, Calendar, AlertCircle, TrendingUp, PiggyBank, Maximize2, Copy, Grid3x3 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type AIResponse = {
  answer: {
    tldr: string;
    bullets: string[];
    actions: { label: string; due?: string; id?: string }[];
    caveats?: string;
  } | string; // fallback for plain text responses
  sources?: string[];
  confidence?: number;
};

// Enhanced AI Response Component with Tabs and Visual Improvements
type EnhancedAIResponseProps = {
  content: {
    tldr: string;
    bullets: string[];
    actions: { label: string; due?: string; id?: string }[];
    caveats?: string;
    highlights?: { label: string; value: string; trend?: "up" | "down" | "neutral" }[];
  };
  timestamp: Date;
  isLatest?: boolean;
};

function EnhancedAIResponse({ content, timestamp, isLatest = false }: EnhancedAIResponseProps) {
  const [activeTab, setActiveTab] = useState("summary");
  
  // Extract potential KPI highlights with context-aware labels
  const extractHighlights = () => {
    if (content.highlights) return content.highlights;
    
    // Try to extract numbers from TL;DR and bullets for automatic highlights
    const highlights = [];
    const numberRegex = /\$[\d,]+|\d+%|\d+\s*(properties|units|days)/gi;
    
    // Look for money amounts, percentages, or counts
    const tldrNumbers = content.tldr.match(numberRegex);
    if (tldrNumbers && tldrNumbers.length > 0) {
      const value = tldrNumbers[0];
      let label = "Amount";
      
      // Context-aware labeling based on TL;DR content
      const tldrLower = content.tldr.toLowerCase();
      if (tldrLower.includes("collected") || tldrLower.includes("received") || tldrLower.includes("paid")) {
        label = "Collected";
      } else if (tldrLower.includes("unpaid") || tldrLower.includes("outstanding") || tldrLower.includes("owe")) {
        label = "Outstanding";
      } else if (tldrLower.includes("due") || tldrLower.includes("total")) {
        label = "Total Due";
      } else if (tldrLower.includes("rent") && !tldrLower.includes("collected")) {
        label = "Monthly Rent";
      } else if (tldrLower.includes("expense") || tldrLower.includes("cost")) {
        label = "Expense";
      } else if (value.includes("%")) {
        label = "Rate";
      }
      
      highlights.push({
        label,
        value,
        trend: "neutral" as const
      });
    }
    
    return highlights.slice(0, 3); // Max 3 highlights
  };

  const highlights = extractHighlights();

  return (
    <div className="bg-background border mr-4 rounded-lg overflow-hidden shadow-sm">
      {/* Sticky TL;DR Header */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Bot className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            <div className="font-medium text-purple-800 dark:text-purple-200" data-testid="text-tldr-header">
              {content.tldr}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigator.clipboard.writeText(content.tldr)}
              data-testid="button-copy-tldr"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" data-testid="button-fullscreen">
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh]">
                <DialogHeader>
                  <DialogTitle className="flex items-center space-x-2">
                    <Bot className="h-5 w-5 text-purple-600" />
                    <span>Mailla Analysis - Full View</span>
                  </DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-full">
                  <EnhancedAIResponse content={content} timestamp={timestamp} isLatest={false} />
                </ScrollArea>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* KPI Highlights */}
        {highlights.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            {highlights.map((highlight, index) => (
              <div key={index} className="bg-white/70 dark:bg-gray-800/70 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">{highlight.value}</div>
                <div className="text-xs text-muted-foreground">{highlight.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabbed Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-muted/30 m-1">
          <TabsTrigger value="summary" className="text-xs" data-testid="tab-summary">Summary</TabsTrigger>
          <TabsTrigger value="details" className="text-xs" data-testid="tab-details">Details</TabsTrigger>
          <TabsTrigger value="actions" className="text-xs" data-testid="tab-actions">Actions</TabsTrigger>
        </TabsList>

        {/* Summary Tab */}
        <TabsContent value="summary" className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {content.bullets.slice(0, 4).map((bullet, index) => (
              <div key={index} className="flex items-start space-x-2 p-3 bg-muted/30 rounded-lg">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span className="text-sm">{bullet}</span>
              </div>
            ))}
          </div>
          
          {content.bullets.length > 4 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setActiveTab("details")}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Show all {content.bullets.length} details →
            </Button>
          )}

        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details" className="p-4">
          <ScrollArea className="h-48">
            <div className="space-y-2" data-testid="list-facts-detailed">
              {content.bullets.map((bullet, index) => (
                <div key={index} className="flex items-start space-x-2 p-2 rounded hover:bg-muted/30 transition-colors">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{bullet}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
          
        </TabsContent>

        {/* Actions Tab */}
        <TabsContent value="actions" className="p-4">
          <ScrollArea className="h-48">
            <div className="space-y-3" data-testid="list-actions-enhanced">
              {content.actions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2" />
                  <p className="text-sm">No actions required right now</p>
                </div>
              ) : (
                content.actions.map((action, index) => (
                  <div key={index} className="group">
                    <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg border-l-4 border-blue-500 hover:shadow-md transition-all">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{action.label}</div>
                        {action.due && (
                          <Badge variant="outline" className="mt-1 text-xs">
                            Due: {action.due}
                          </Badge>
                        )}
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid={`button-action-${index}`}
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

    </div>
  );
}

const DEFAULT_EXAMPLE_QUESTIONS = [
  "What needs my attention this week?",
  "How are my properties performing?", 
  "Which property is my best investment?",
  "Any red flags I should know about?",
  "When do my leases expire?",
  "Who's late on rent this month?",
  "Which property costs the most to maintain?",
  "Should I raise rent on any properties?"
];

type PropertyAssistantProps = {
  context?: string;
  exampleQuestions?: string[];
};

export default function PropertyAssistant({ context = "dashboard", exampleQuestions: customQuestions }: PropertyAssistantProps) {
  const [question, setQuestion] = useState("");
  const [conversation, setConversation] = useState<Array<{
    type: "user" | "ai";
    content: string | {
      tldr: string;
      bullets: string[];
      actions: { label: string; due?: string; id?: string }[];
      caveats?: string;
    };
    timestamp: Date;
  }>>([]);
  const [isAsking, setIsAsking] = useState(false);

  // Get a rotating set of 4 example questions
  const getExampleQuestions = () => {
    const questions = customQuestions || DEFAULT_EXAMPLE_QUESTIONS;
    if (customQuestions) {
      // If custom questions provided, use them as-is
      return questions;
    }
    // Otherwise, randomize the default questions
    const shuffled = [...questions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 4);
  };

  const [displayQuestions] = useState(getExampleQuestions());

  const handleAskQuestion = async (questionText: string) => {
    if (!questionText.trim() || isAsking) return;

    const userQuestion = questionText.trim();
    setQuestion("");
    setIsAsking(true);

    // Add user question to conversation
    setConversation(prev => [...prev, {
      type: "user",
      content: userQuestion,
      timestamp: new Date()
    }]);

    try {
      const response = await apiRequest("POST", "/api/ai/ask", {
        question: userQuestion,
        context: context
      });
      
      const data = await response.json() as AIResponse;

      // Add AI response to conversation
      setConversation(prev => [...prev, {
        type: "ai", 
        content: data.answer,
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error("AI request failed:", error);
      setConversation(prev => [...prev, {
        type: "ai",
        content: "I'm sorry, I'm having trouble analyzing your data right now. Please try again in a moment.",
        timestamp: new Date()
      }]);
    } finally {
      setIsAsking(false);
    }
  };

  const handleExampleClick = (exampleQuestion: string) => {
    handleAskQuestion(exampleQuestion);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAskQuestion(question);
  };

  return (
    <Card id="mailla-assistant" className="mb-8" data-testid="card-ai-assistant">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
            <Bot className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <CardTitle className="text-lg cursor-help">Mailla</CardTitle>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">ask me anything, I will leverage my intimate knowledge of your real estate portfolio and the power of AI to try to help you</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <p className="text-sm text-muted-foreground">Enjoy the Power of your Personal AI Assistant</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enhanced Chat Messages */}
        {conversation.length > 0 && (
          <div className="space-y-4 mb-4">
            {/* Older Conversations - Collapsed */}
            {conversation.length > 2 && (
              <div className="bg-muted/20 rounded-lg p-3">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{conversation.length - 2} previous conversations</span>
                  <Button variant="ghost" size="sm" className="text-xs">
                    Show History
                  </Button>
                </div>
              </div>
            )}
            
            {/* Latest Conversation Pair (User Question + AI Response) */}
            {conversation.slice(-2).map((message, index) => {
              const actualIndex = conversation.length - 2 + index;
              const isLatest = actualIndex === conversation.length - 1;
              
              return (
                <div key={actualIndex} className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}>
                  {message.type === "user" ? (
                    /* User Message */
                    <div className="max-w-[80%] p-3 rounded-lg bg-primary text-primary-foreground ml-4" data-testid={`message-user-${actualIndex}`}>
                      <p className="text-sm whitespace-pre-wrap">{message.content as string}</p>
                      <p className="text-xs mt-2 text-primary-foreground/70">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ) : (
                    /* AI Message - Enhanced Version */
                    <div className="max-w-[95%] w-full" data-testid={`message-ai-${actualIndex}`}>
                      {typeof message.content === 'string' ? (
                        /* Fallback for plain text responses */
                        <div className="bg-background border mr-4 p-3 rounded-lg">
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          <p className="text-xs mt-2 text-muted-foreground text-right">
                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      ) : (
                        /* Enhanced structured response */
                        <EnhancedAIResponse 
                          content={message.content}
                          timestamp={message.timestamp}
                          isLatest={isLatest}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            
            {/* Loading State */}
            {isAsking && (
              <div className="flex justify-start">
                <div className="bg-background border mr-4 p-4 rounded-lg shadow-sm">
                  <div className="flex items-center space-x-3">
                    <div className="w-6 h-6 bg-purple-100 dark:bg-purple-900/20 rounded-full flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">Mailla is analyzing...</div>
                      <div className="text-xs text-muted-foreground">Looking at your property data</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Question Input */}
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about your properties, leases, expenses, tenants..."
            className="flex-1"
            disabled={isAsking}
            data-testid="input-ai-question"
          />
          <Button 
            type="submit" 
            disabled={!question.trim() || isAsking}
            data-testid="button-ask-ai"
          >
            {isAsking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>

        {/* Example Questions */}
        {conversation.length === 0 && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Lightbulb className="h-4 w-4" />
              <span>Try these:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {displayQuestions.map((example, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  className="text-xs h-auto py-2 px-3 hover:bg-muted/50"
                  onClick={() => handleExampleClick(example)}
                  disabled={isAsking}
                  data-testid={`button-example-${index}`}
                >
                  {example}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}