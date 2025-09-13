import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bot, Send, Lightbulb } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type AIResponse = {
  answer: string;
  sources?: string[];
  confidence?: number;
};

const EXAMPLE_QUESTIONS = [
  "What needs my attention this week?",
  "How are my properties performing?", 
  "Which property is my best investment?",
  "Any red flags I should know about?",
  "When do my leases expire?",
  "Who's late on rent this month?",
  "Which property costs the most to maintain?",
  "Should I raise rent on any properties?"
];

export default function PropertyAssistant() {
  const [question, setQuestion] = useState("");
  const [conversation, setConversation] = useState<Array<{
    type: "user" | "ai";
    content: string;
    timestamp: Date;
  }>>([]);
  const [isAsking, setIsAsking] = useState(false);

  // Get a rotating set of 4 example questions
  const getExampleQuestions = () => {
    const shuffled = [...EXAMPLE_QUESTIONS].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 4);
  };

  const [exampleQuestions] = useState(getExampleQuestions());

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
        question: userQuestion
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
    <Card className="mb-8" data-testid="card-ai-assistant">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
            <Bot className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <CardTitle className="text-lg">AI Property Assistant</CardTitle>
            <p className="text-sm text-muted-foreground">Ask me anything about your properties</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Chat Messages */}
        {conversation.length > 0 && (
          <div className="max-h-64 overflow-y-auto space-y-3 mb-4 p-3 bg-muted/30 rounded-lg">
            {conversation.map((message, index) => (
              <div key={index} className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] p-3 rounded-lg ${
                  message.type === "user" 
                    ? "bg-primary text-primary-foreground ml-4" 
                    : "bg-background border mr-4"
                }`} data-testid={`message-${message.type}-${index}`}>
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className={`text-xs mt-1 ${
                    message.type === "user" ? "text-primary-foreground/70" : "text-muted-foreground"
                  }`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            {isAsking && (
              <div className="flex justify-start">
                <div className="bg-background border mr-4 p-3 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Analyzing your property data...</span>
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
              {exampleQuestions.map((example, index) => (
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