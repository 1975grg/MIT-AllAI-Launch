import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Send, MapPin, AlertTriangle, Clock, Bot, User, CheckCircle, Camera } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface AIContextExtraction {
  locationText?: string;
  buildingName?: string;
  roomNumber?: string;
  category?: string;
  priority?: "Low" | "Medium" | "High" | "Critical";
  urgency?: string;
  aiConfidence?: number;
  isComplete?: boolean;
}

interface ChatMessage {
  id: string;
  type: "user" | "ai" | "system";
  content: string;
  timestamp: Date;
  context?: AIContextExtraction;
  isTyping?: boolean;
}

interface EnhancedChatInterfaceProps {
  onSubmitRequest?: (request: any) => void;
  isSubmitting?: boolean;
}

export default function EnhancedChatInterface({ onSubmitRequest, isSubmitting }: EnhancedChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      type: "ai",
      content: "Hi! I'm your MIT Housing maintenance assistant. Just describe what's wrong in plain English - like 'My sink is leaking in Baker House 305' - and I'll take care of the rest!",
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState("");
  const [extractedContext, setExtractedContext] = useState<AIContextExtraction>({});
  const [isExtracting, setIsExtracting] = useState(false);
  const [isTypingAI, setIsTypingAI] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Real-time AI context extraction as user types
  useEffect(() => {
    if (input.length < 10) {
      setExtractedContext({});
      return;
    }

    const debounceTimer = setTimeout(async () => {
      if (input.trim() && !isExtracting) {
        await extractContextFromInput(input);
      }
    }, 800); // Debounce to avoid too many API calls

    return () => clearTimeout(debounceTimer);
  }, [input]);

  const extractContextFromInput = async (text: string) => {
    setIsExtracting(true);
    try {
      // Simple client-side extraction for demo - in production this would call AI service
      const context: AIContextExtraction = {
        aiConfidence: 0
      };

      // Extract building names (MIT dorms)
      const buildingPatterns = [
        /baker\s*house/i, /burton\s*conner/i, /east\s*campus/i, /macgregor/i,
        /maseeh/i, /mccormick/i, /new\s*house/i, /next\s*house/i, /random/i, 
        /senior\s*house/i, /simmons/i, /tang/i, /westgate/i
      ];
      
      for (const pattern of buildingPatterns) {
        const match = text.match(pattern);
        if (match) {
          context.buildingName = match[0];
          context.locationText = match[0];
          context.aiConfidence = (context.aiConfidence || 0) + 20;
          break;
        }
      }

      // Extract room numbers
      const roomMatch = text.match(/\b\d{1,4}[A-Z]?\b/);
      if (roomMatch) {
        context.roomNumber = roomMatch[0];
        context.aiConfidence = (context.aiConfidence || 0) + 15;
      }

      // Extract issue category
      const categoryKeywords = {
        "Plumbing": /leak|sink|water|drain|toilet|shower|pipe|faucet/i,
        "Electrical": /power|electric|outlet|light|bulb|switch|breaker/i,
        "HVAC": /heat|cold|ac|air|temperature|thermostat|fan/i,
        "Security": /lock|door|window|key|access|card/i,
        "Appliances": /fridge|microwave|stove|washer|dryer|dishwasher/i,
        "Internet": /wifi|internet|network|connection/i
      };

      for (const [category, pattern] of Object.entries(categoryKeywords)) {
        if (pattern.test(text)) {
          context.category = category;
          context.aiConfidence = (context.aiConfidence || 0) + 25;
          break;
        }
      }

      // Extract urgency/priority (map to backend schema)
      const urgencyKeywords = {
        "Urgent": /emergency|urgent|broken|not\s*working|critical/i, // Map Critical->Urgent
        "High": /important|need|soon|asap/i,
        "Medium": /should|when|convenient/i,
        "Low": /sometime|eventually|minor/i
      };

      for (const [priority, pattern] of Object.entries(urgencyKeywords)) {
        if (pattern.test(text)) {
          context.priority = priority as any;
          context.urgency = priority;
          context.aiConfidence = (context.aiConfidence || 0) + 20;
          break;
        }
      }

      // Check if we have enough context
      context.isComplete = !!(context.buildingName && context.roomNumber && context.category);
      context.aiConfidence = Math.min(context.aiConfidence || 0, 95); // Cap at 95%

      setExtractedContext(context);
    } catch (error) {
      console.error("Context extraction error:", error);
    } finally {
      setIsExtracting(false);
    }
  };

  const simulateAITyping = (content: string, context?: AIContextExtraction) => {
    setIsTypingAI(true);
    
    setTimeout(() => {
      const newMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        type: "ai",
        content,
        timestamp: new Date(),
        context
      };

      setMessages(prev => [...prev, newMessage]);
      setIsTypingAI(false);
    }, 1500 + Math.random() * 1000); // Realistic typing delay
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isSubmitting) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: "user", 
      content: input.trim(),
      timestamp: new Date(),
      context: extractedContext
    };

    setMessages(prev => [...prev, userMessage]);
    const userInput = input.trim();
    setInput("");

    // If we have enough context, show AI confirmation and submit
    if (extractedContext.isComplete) {
      simulateAITyping(
        `Perfect! I've extracted all the details:
• **Location**: ${extractedContext.buildingName} Room ${extractedContext.roomNumber}
• **Issue**: ${extractedContext.category} problem
• **Priority**: ${extractedContext.priority}

I'm creating your maintenance request now and will assign the right contractor automatically. You'll get a notification when they're scheduled to visit!`,
        extractedContext
      );

      // Submit the request
      setTimeout(() => {
        if (onSubmitRequest) {
          onSubmitRequest({
            title: userInput,
            description: userInput,
            locationText: extractedContext.locationText,
            buildingName: extractedContext.buildingName,
            roomNumber: extractedContext.roomNumber,
            category: extractedContext.category,
            priority: extractedContext.priority,
            aiConfidence: extractedContext.aiConfidence
          });
        }
      }, 2000);
    } else {
      // Ask for missing information
      let missingInfo = [];
      if (!extractedContext.buildingName) missingInfo.push("building name");
      if (!extractedContext.roomNumber) missingInfo.push("room number");
      if (!extractedContext.category) missingInfo.push("what type of issue this is");

      simulateAITyping(
        `I can see you're having an issue! To help you better, could you also mention: ${missingInfo.join(", ")}? 

For example: "My sink is leaking in Baker House room 305"`
      );
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return "bg-green-500";
    if (confidence >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case "Critical": return "bg-red-100 text-red-800 border-red-200";
      case "High": return "bg-orange-100 text-orange-800 border-orange-200";
      case "Medium": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "Low": return "bg-green-100 text-green-800 border-green-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-full flex flex-col">
      {/* Context Extraction Panel */}
      <AnimatePresence>
        {(Object.keys(extractedContext).length > 0 || isExtracting) && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mb-4"
          >
            <Card className="border-purple-200 bg-purple-50 dark:bg-purple-900/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center space-x-2">
                  <Bot className="h-4 w-4 text-purple-600" />
                  <span>AI Context Extraction</span>
                  {isExtracting && <Loader2 className="h-4 w-4 animate-spin" />}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Location */}
                  <div className="flex items-center space-x-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">Location</div>
                      <div className="text-sm font-medium">
                        {extractedContext.buildingName || "Not detected"}
                        {extractedContext.roomNumber && ` ${extractedContext.roomNumber}`}
                      </div>
                    </div>
                  </div>

                  {/* Category */}
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">Category</div>
                      <div className="text-sm font-medium">
                        {extractedContext.category || "Analyzing..."}
                      </div>
                    </div>
                  </div>

                  {/* Priority */}
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">Priority</div>
                      <div className="text-sm">
                        {extractedContext.priority ? (
                          <Badge className={getPriorityColor(extractedContext.priority)}>
                            {extractedContext.priority}
                          </Badge>
                        ) : (
                          "Determining..."
                        )}
                      </div>
                    </div>
                  </div>

                  {/* AI Confidence */}
                  <div className="flex items-center space-x-2">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                    <div className="w-full">
                      <div className="text-xs text-muted-foreground">Confidence</div>
                      <div className="flex items-center space-x-2">
                        <Progress 
                          value={extractedContext.aiConfidence || 0} 
                          className="h-2 flex-1"
                        />
                        <span className="text-xs font-medium">
                          {Math.round(extractedContext.aiConfidence || 0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {extractedContext.isComplete && (
                  <div className="mt-3 flex items-center space-x-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">Ready to submit request!</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Messages */}
      <Card className="flex-1 flex flex-col">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4" style={{ maxHeight: "500px" }}>
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                  message.type === "user" 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted"
                }`}>
                  <div className="flex items-center space-x-2 mb-1">
                    {message.type === "user" ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4 text-purple-600" />
                    )}
                    <span className="text-xs opacity-70">
                      {message.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap" data-testid={`message-${message.type}`}>
                    {message.content}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* AI Typing Indicator */}
          <AnimatePresence>
            {isTypingAI && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex justify-start"
              >
                <div className="bg-muted px-4 py-2 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Bot className="h-4 w-4 text-purple-600" />
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                      <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                      <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </CardContent>

        {/* Input Area */}
        <div className="p-4 border-t">
          <div className="flex space-x-2">
            <div className="flex-1">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Describe your maintenance issue in plain English... (e.g., 'My sink is leaking in Baker House 305')"
                className="min-h-[60px] resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={isSubmitting}
                data-testid="textarea-chat-input"
              />
              <div className="flex items-center justify-between mt-2">
                <div className="text-xs text-muted-foreground">
                  {input.length > 0 && `${input.length} characters • Press Enter to send`}
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm" disabled>
                    <Camera className="h-4 w-4 mr-1" />
                    Photo
                  </Button>
                </div>
              </div>
            </div>
            <Button 
              onClick={handleSendMessage}
              disabled={!input.trim() || isSubmitting}
              className="self-end"
              data-testid="button-send-message"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}