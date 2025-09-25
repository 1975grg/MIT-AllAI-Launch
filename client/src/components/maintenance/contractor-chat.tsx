import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, User, Wrench, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ChatMessage {
  id: string;
  type: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ContractorChatProps {
  studentId: string;
  orgId: string;
  onCaseCreated?: (caseId: string) => void;
}

export default function ContractorChat({ studentId, orgId, onCaseCreated }: ContractorChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      type: "assistant",
      content: "Hi! I'm here to help with your maintenance issue. I'm like having a contractor on the line who can walk you through some quick fixes, or if needed, get the right person dispatched with the right tools. What's going on?",
      timestamp: new Date(),
    }
  ]);
  
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || isComplete) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const messageText = input;
    setInput("");
    setIsLoading(true);

    try {
      let response;
      
      if (!sessionId) {
        // Start new chat session
        response = await fetch('/api/contractor-chat/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            initialMessage: messageText,
            studentId,
            orgId
          })
        });
        
        const data = await response.json();
        setSessionId(data.sessionId);
        
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          type: "assistant",
          content: data.response,
          timestamp: new Date(),
        };
        
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Continue existing chat
        response = await fetch('/api/contractor-chat/continue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            message: messageText
          })
        });
        
        const data = await response.json();
        
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          type: "assistant",
          content: data.response,
          timestamp: new Date(),
        };
        
        setMessages(prev => [...prev, assistantMessage]);
        
        // Check if a case was created
        if (data.caseCreated) {
          setIsComplete(true);
          
          // Add success message
          const successMessage: ChatMessage = {
            id: `success-${Date.now()}`,
            type: "assistant",
            content: `✅ Maintenance request created successfully! Case ID: ${data.caseId}. You'll be contacted soon with next steps.`,
            timestamp: new Date(),
          };
          
          setMessages(prev => [...prev, successMessage]);
          
          if (onCaseCreated) {
            onCaseCreated(data.caseId);
          }
          
          toast({
            title: "Request Submitted",
            description: "Your maintenance request has been created and submitted.",
          });
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto h-[600px] flex flex-col border-2 border-gray-300 dark:border-gray-600 shadow-lg">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-orange-600" />
          <CardTitle className="text-lg">MIT Housing Maintenance Assistant</CardTitle>
          {isComplete && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">
              <CheckCircle className="h-3 w-3" />
              <span>Complete</span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
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
                    message.type === 'user' ? 'bg-slate-100' : 'bg-orange-100'
                  }`}>
                    {message.type === 'user' ? 
                      <User className="h-4 w-4 text-slate-700" /> : 
                      <Wrench className="h-4 w-4 text-orange-600" />
                    }
                  </div>
                  
                  <div className={`rounded-lg px-3 py-2 ${
                    message.type === 'user' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-50 text-gray-900 border border-gray-200'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    <div className="text-xs opacity-50 mt-1">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2"
            >
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                <Wrench className="h-4 w-4 text-orange-600" />
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-700">Thinking...</span>
                  <Loader2 className="h-3 w-3 animate-spin text-orange-600" />
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area - Fixed at bottom */}
        {!isComplete && (
          <form onSubmit={handleSubmit} className="flex gap-2 flex-shrink-0">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe what's happening..."
              className="min-h-[50px] max-h-[100px] resize-none"
              disabled={isLoading}
              data-testid="textarea-message-input"
            />
            <Button 
              type="submit" 
              disabled={!input.trim() || isLoading}
              className="self-end"
              data-testid="button-send-message"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        )}
        
        {isComplete && (
          <div className="text-center text-sm text-gray-500 py-2">
            Your maintenance request has been submitted. You can close this chat.
          </div>
        )}
      </CardContent>
    </Card>
  );
}