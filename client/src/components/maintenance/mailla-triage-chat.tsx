import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Loader2, Send, AlertTriangle, Clock, Bot, User, CheckCircle, Heart, Upload, X, Phone, MapPin, Home } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface MaillaMessage {
  id: string;
  type: "user" | "mailla" | "system";
  content: string;
  timestamp: Date;
  urgencyLevel?: 'emergency' | 'urgent' | 'normal' | 'low';
  safetyFlags?: string[];
  nextAction?: 'ask_followup' | 'request_media' | 'escalate_immediate' | 'complete_triage' | 'recommend_diy';
  nextQuestion?: string;
  quickReplies?: string[];
  followupQuestions?: string[]; // Keep for backward compatibility
  diyAction?: {
    action: string;
    instructions: string[];
    warnings: string[];
  };
  isTyping?: boolean;
}

interface TriageConversation {
  conversationId: string;
  studentId: string;
  orgId: string;
  currentPhase: string;
  urgencyLevel: string;
  safetyFlags: string[];
  isComplete: boolean;
}

interface MaillaTriageChatProps {
  studentId: string;
  orgId: string;
  onTriageComplete?: (caseId: string) => void;
}

// Generate contextual quick replies based on the conversation
const generateQuickReplies = (nextQuestion?: string, message?: string): string[] => {
  if (!nextQuestion && !message) return [];
  
  const lowerMessage = (message || '').toLowerCase();
  const lowerQuestion = (nextQuestion || '').toLowerCase();
  
  // Building selection quick replies
  if (lowerQuestion.includes('building') || lowerMessage.includes('building')) {
    return ['Next House', 'Simmons Hall', 'MacGregor House', 'Burton Conner'];
  }
  
  // Room number quick replies (after building is known)
  if (lowerQuestion.includes('room') || lowerQuestion.includes('unit')) {
    return ['100', '200', '300', 'Not sure'];
  }
  
  // Issue type quick replies
  if (lowerQuestion.includes('issue') || lowerQuestion.includes('problem')) {
    return ['Water leak', 'No heat', 'Electrical issue', 'Broken fixture'];
  }
  
  // Timeline quick replies
  if (lowerQuestion.includes('when') || lowerQuestion.includes('started')) {
    return ['Just now', 'Today', 'Yesterday', 'Few days ago'];
  }
  
  // General yes/no questions
  if (lowerQuestion.includes('?') && (lowerQuestion.includes('is') || lowerQuestion.includes('can') || lowerQuestion.includes('would'))) {
    return ['Yes', 'No', 'Not sure'];
  }
  
  return ['Skip for now'];
};

export default function MaillaTriageChat({ studentId, orgId, onTriageComplete }: MaillaTriageChatProps) {
  const [messages, setMessages] = useState<MaillaMessage[]>([
    {
      id: "welcome",
      type: "mailla",
      content: "Hi! I'm Mailla, MIT Housing's maintenance assistant. What's going on?",
      timestamp: new Date(),
    }
  ]);
  
  const [input, setInput] = useState("");
  const [conversation, setConversation] = useState<TriageConversation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTypingMailla, setIsTypingMailla] = useState(false);
  const [currentUrgency, setCurrentUrgency] = useState<string>("normal");
  const [safetyFlags, setSafetyFlags] = useState<string[]>([]);
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);
  const [needsMediaUpload, setNeedsMediaUpload] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [currentQuickReplies, setCurrentQuickReplies] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startTriageConversation = async (initialRequest: string) => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/mailla/start-triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include auth cookies
        body: JSON.stringify({
          initialRequest
        })
      });

      if (!response.ok) {
        throw new Error('Failed to start triage conversation');
      }

      const data = await response.json();
      
      setConversation({
        conversationId: data.conversationId,
        studentId,
        orgId,
        currentPhase: 'gathering_info',
        urgencyLevel: data.maillaResponse.urgencyLevel || 'normal',
        safetyFlags: data.maillaResponse.safetyFlags || [],
        isComplete: false
      });

      setCurrentUrgency(data.maillaResponse.urgencyLevel || 'normal');
      setSafetyFlags(data.maillaResponse.safetyFlags || []);

      // Generate quick replies based on context
      const quickReplies = generateQuickReplies(data.maillaResponse.nextQuestion, data.maillaResponse.message);
      
      // Add Mailla's response as a message
      const maillaMessage: MaillaMessage = {
        id: `mailla-${Date.now()}`,
        type: "mailla",
        content: data.maillaResponse.message,
        timestamp: new Date(),
        urgencyLevel: data.maillaResponse.urgencyLevel,
        safetyFlags: data.maillaResponse.safetyFlags,
        nextAction: data.maillaResponse.nextAction,
        nextQuestion: data.maillaResponse.nextQuestion,
        quickReplies,
        followupQuestions: data.maillaResponse.followupQuestions,
        diyAction: data.maillaResponse.diyAction
      };

      setMessages(prev => [...prev, maillaMessage]);
      
      // Set up quick replies if we have a question
      if (data.maillaResponse.nextQuestion && quickReplies.length > 0) {
        setCurrentQuickReplies(quickReplies);
        setShowQuickReplies(true);
      } else {
        setShowQuickReplies(false);
        setCurrentQuickReplies([]);
      }

    } catch (error) {
      console.error('Error starting triage:', error);
      toast({
        title: "Connection Error",
        description: "Failed to start conversation with Mailla. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const continueTriageConversation = async (studentMessage: string) => {
    if (!conversation) return;

    try {
      setIsLoading(true);
      setIsTypingMailla(true);

      const response = await fetch('/api/mailla/continue-triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include auth cookies
        body: JSON.stringify({
          conversationId: conversation.conversationId,
          studentMessage,
          mediaUrls: [] // TODO: Implement media upload with ObjectStorageService
        })
      });

      if (!response.ok) {
        throw new Error('Failed to continue triage conversation');
      }

      const data = await response.json();

      setCurrentUrgency(data.urgencyLevel || currentUrgency);
      setSafetyFlags(data.safetyFlags || []);

      // Generate quick replies based on context
      const quickReplies = generateQuickReplies(data.nextQuestion, data.message);
      
      // Add Mailla's response
      const maillaMessage: MaillaMessage = {
        id: `mailla-${Date.now()}`,
        type: "mailla",
        content: data.message,
        timestamp: new Date(),
        urgencyLevel: data.urgencyLevel,
        safetyFlags: data.safetyFlags,
        nextAction: data.nextAction,
        nextQuestion: data.nextQuestion,
        quickReplies,
        followupQuestions: data.followupQuestions,
        diyAction: data.diyAction
      };

      setMessages(prev => [...prev, maillaMessage]);
      
      // Set up quick replies if we have a question
      if (data.nextQuestion && quickReplies.length > 0) {
        setCurrentQuickReplies(quickReplies);
        setShowQuickReplies(true);
      } else {
        setShowQuickReplies(false);
        setCurrentQuickReplies([]);
      }

      // ✅ Handle critical safety actions
      if (data.nextAction === 'escalate_immediate') {
        setIsEmergencyMode(true);
        toast({
          title: "Priority Issue Noted",
          description: "I'll make sure this gets handled quickly. Let me gather a few more details.",
          variant: "default"
        });
      } else if (data.nextAction === 'request_media') {
        setNeedsMediaUpload(true);
      } else if (data.nextAction === 'complete_triage') {
        await completeTriageConversation();
      }

    } catch (error: any) {
      console.error('Error continuing triage:', error);
      
      // Handle specific error types
      let title = "Connection Error";
      let description = "Failed to send message to Mailla. Please try again.";
      
      if (error?.response?.status === 429) {
        title = "Please slow down";
        description = "I'm getting a lot of requests right now. Please wait a moment and try again.";
      } else if (error?.message?.includes('rate limit') || error?.message?.includes('Too many')) {
        title = "Rate limit reached";
        description = "Please wait a moment before sending another message.";
      }
      
      toast({
        title,
        description,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      setIsTypingMailla(false);
    }
  };

  const completeTriageConversation = async () => {
    if (!conversation) return;

    try {
      setIsLoading(true);

      const response = await fetch('/api/mailla/complete-triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include auth cookies
        body: JSON.stringify({
          conversationId: conversation.conversationId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to complete triage conversation');
      }

      const data = await response.json();

      // Add caring, contextual completion message
      const getCaringCompletionMessage = (caseId: string, category?: string): string => {
        const baseMessage = `✅ Perfect! I've created maintenance case #${caseId} for you. `;
        
        if (category?.toLowerCase().includes('heating') || category?.toLowerCase().includes('temperature')) {
          return baseMessage + `Help will be on the way soon. Since it's cold, try to stay warm with some blankets, or hang out with friends if you want - you don't need to be there! I'll keep you updated. 🔧`;
        } else if (category?.toLowerCase().includes('plumbing') || category?.toLowerCase().includes('water') || category?.toLowerCase().includes('leak')) {
          return baseMessage + `I'm getting a plumber out there. If the leak gets worse, there should be a water shutoff valve near your unit - but help is coming soon! 💧`;
        } else if (category?.toLowerCase().includes('electrical')) {
          return baseMessage + `Maintenance is being dispatched right away. Please stay away from that area for safety, and I'll keep you posted on timing! ⚡`;
        } else {
          return baseMessage + `Help will be there soon - you can go about your day and I'll update you along the way! 🛠️`;
        }
      };

      const completionMessage: MaillaMessage = {
        id: `completion-${Date.now()}`,
        type: "system", 
        content: getCaringCompletionMessage(data.caseId, data.category),
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, completionMessage]);
      
      setConversation(prev => prev ? { ...prev, isComplete: true } : null);
      
      if (onTriageComplete) {
        onTriageComplete(data.caseId);
      }

      // ❌ REMOVED: Disruptive toast notification - let the AI's message handle completion naturally

    } catch (error) {
      console.error('Error completing triage:', error);
      toast({
        title: "Completion Error",
        description: "Failed to complete triage. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };


  const handleQuickReply = async (reply: string) => {
    // Hide quick replies immediately for better UX
    setShowQuickReplies(false);
    setCurrentQuickReplies([]);
    
    const userMessage: MaillaMessage = {
      id: `user-${Date.now()}`,
      type: "user", 
      content: reply,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);

    if (!conversation) {
      await startTriageConversation(reply);
    } else {
      await continueTriageConversation(reply);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // ✅ Critical safety: Prevent input during emergency mode
    if (!input.trim() || isLoading || isEmergencyMode) return;

    // Hide quick replies when user types their own message
    setShowQuickReplies(false);
    setCurrentQuickReplies([]);

    const userMessage: MaillaMessage = {
      id: `user-${Date.now()}`,
      type: "user", 
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const messageText = input;
    setInput("");

    if (!conversation) {
      await startTriageConversation(messageText);
    } else {
      await continueTriageConversation(messageText);
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'emergency': return 'bg-blue-500 text-white shadow-lg border-blue-200';
      case 'urgent': return 'bg-blue-500 text-white shadow-lg border-blue-200';
      case 'normal': return 'bg-blue-500 text-white shadow-lg border-blue-200';
      case 'low': return 'bg-green-500 text-white shadow-lg border-green-200';
      default: return 'bg-gray-500 text-white shadow-lg border-gray-200';
    }
  };

  const getSafetyIcon = (flag: string) => {
    if (flag.includes('gas') || flag.includes('electrical')) return <AlertTriangle className="h-3 w-3" />;
    return <Heart className="h-3 w-3" />;
  };

  return (
    <Card className="w-full max-w-4xl mx-auto h-[600px] flex flex-col !border-2 !border-gray-300 dark:!border-gray-600 shadow-lg">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-red-600" />
            <CardTitle className="text-lg">Mailla AI Triage</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={`${getUrgencyColor(currentUrgency)} text-white`}
              data-testid="badge-urgency"
            >
              {currentUrgency}
            </Badge>
            {safetyFlags.length > 0 && (
              <Badge 
                variant="outline" 
                className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                data-testid="badge-safety-concerns"
              >
                {safetyFlags.length} safety concern{safetyFlags.length > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
        {/* ✅ Emergency Mode Banner */}
        {isEmergencyMode && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-50 dark:bg-blue-900 text-blue-800 dark:text-blue-200 p-4 rounded-lg border border-blue-200 dark:border-blue-600"
            data-testid="banner-priority"
          >
            <div className="flex items-center gap-3">
              <CheckCircle className="h-6 w-6" />
              <div className="flex-1">
                <h3 className="font-bold text-lg">Priority Issue</h3>
                <p className="text-sm opacity-90">I'll make sure this gets handled quickly</p>
                <p className="text-sm">Let me gather some details to help our team prepare</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ✅ Media Upload Area */}
        {needsMediaUpload && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-4 rounded-lg"
            data-testid="section-media-upload"
          >
            <h3 className="font-medium text-red-700 dark:text-red-300 mb-2">📸 Quick Photos Help!</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
              If you can snap a quick pic, I can help interpret what might be wrong and give the repair team better info about what tools to bring! 📷
            </p>
            
            <div className="space-y-3">
              <Input
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setSelectedFiles(files);
                }}
                className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100"
                data-testid="input-file-upload"
              />
              
              {selectedFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected:
                  </p>
                  {selectedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-gray-100 dark:bg-gray-900 p-2 rounded text-sm">
                      <span className="text-gray-800 dark:text-gray-200">{file.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedFiles(files => files.filter((_, i) => i !== idx))}
                        data-testid={`button-remove-file-${idx}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Messages Area - Scrollable */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-2 min-h-0">
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-2 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                data-testid={`message-${message.type}-${message.id}`}
              >
                <div className={`flex gap-2 max-w-[80%] ${message.type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    message.type === 'user' ? 'bg-slate-100' : 
                    message.type === 'mailla' ? 'bg-gray-100' : 'bg-gray-100'
                  }`}>
                    {message.type === 'user' ? <User className="h-4 w-4 text-slate-700" /> : 
                     message.type === 'mailla' ? <Bot className="h-4 w-4 text-red-600" /> :
                     <CheckCircle className="h-4 w-4 text-gray-600" />}
                  </div>
                  
                  <div className={`rounded-lg px-3 py-2 ${
                    message.type === 'user' ? 'bg-blue-600 text-white' :
                    message.type === 'mailla' ? 'bg-gray-50 text-gray-900 border border-gray-200' :
                    'bg-gray-50 text-gray-900 border border-gray-200'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    
                    {/* Safety Flags - HIDDEN to reduce overwhelm */}

                    {/* Natural conversation flow - only one question at a time via quick replies */}

                    {/* DIY Action */}
                    {message.diyAction && (
                      <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                        <p className="font-medium text-green-800">Quick Fix Option:</p>
                        <p className="text-green-700">{message.diyAction.action}</p>
                        {message.diyAction.instructions.map((instruction, idx) => (
                          <p key={idx} className="text-green-600">• {instruction}</p>
                        ))}
                        {message.diyAction.warnings.map((warning, idx) => (
                          <p key={idx} className="text-red-600 font-medium">⚠️ {warning}</p>
                        ))}
                      </div>
                    )}
                    
                    <div className="text-xs opacity-50 mt-1">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isTypingMailla && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2"
            >
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <Bot className="h-4 w-4 text-red-600" />
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-700">Mailla is thinking</span>
                  <Loader2 className="h-3 w-3 animate-spin text-red-600" />
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>


        {/* Input Area - Fixed at bottom */}
        <form onSubmit={handleSubmit} className="flex gap-2 flex-shrink-0">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={conversation?.isComplete ? "Triage completed" : "Describe what's happening..."}
            className="min-h-[50px] max-h-[100px] resize-none"
            disabled={isLoading || conversation?.isComplete || isEmergencyMode}
            data-testid="input-message"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <Button 
            type="submit" 
            size="sm" 
            disabled={!input.trim() || isLoading || conversation?.isComplete || isEmergencyMode}
            data-testid="button-send"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}