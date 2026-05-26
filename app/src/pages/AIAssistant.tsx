import { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Send,
  Loader2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/providers/trpc";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const suggestions = [
  "Find trading files from last month",
  "Show my largest files",
  "Organize my documents by type",
  "What files did I upload yesterday?",
  "Show deleted AI project files",
  "Find duplicate files",
];

export default function AIAssistant() {
  const utils = trpc.useUtils();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hello! I'm your SharedPoint AI assistant. I can help you search, organize, and manage your files. What would you like to do?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = {
      id: `user_${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    setTimeout(async () => {
      const lowerText = text.toLowerCase();
      let response = "I can inspect your vault metadata, search content, and help with recovery and organization. Try asking for files, deleted items, images, videos, or a specific folder.";

      if (lowerText.includes("deleted")) {
        const deleted = await utils.recovery.list.fetch({ page: 1, limit: 10 });
        response = deleted.length
          ? `Deleted items:\n\n${deleted.map((item, index) => `${index + 1}. ${item.name} (${item.resourceType})`).join("\n")}`
          : "No deleted items found in your trash.";
      } else if (lowerText.includes("image")) {
        const results = await utils.search.query.fetch({ q: "", type: "files", page: 1, limit: 50 });
        const files = results.files.filter((file) => (file.mimeType || "").startsWith("image/"));
        response = files.length
          ? `Images found:\n\n${files.map((file, index) => `${index + 1}. ${file.name}`).join("\n")}`
          : "No images found right now.";
      } else if (lowerText.includes("video")) {
        const results = await utils.search.query.fetch({ q: "", type: "files", page: 1, limit: 50 });
        const files = results.files.filter((file) => (file.mimeType || "").startsWith("video/"));
        response = files.length
          ? `Videos found:\n\n${files.map((file, index) => `${index + 1}. ${file.name}`).join("\n")}`
          : "No videos found right now.";
      } else if (lowerText.includes("folder f1") || lowerText.includes("open folder f1")) {
        response = "I can open a folder only if it exists in your vault. Use the Vault page to navigate to the matching folder path.";
      } else if (lowerText.includes("friend uploads")) {
        const vault = await utils.vault.list.fetch({ folderId: undefined });
        const names = [...vault.files, ...vault.folders].map((item) => item.name);
        response = names.length
          ? `Current vault items:\n\n${names.map((name, index) => `${index + 1}. ${name}`).join("\n")}`
          : "No vault items found yet.";
      } else if (lowerText.includes("search") || lowerText.includes("find")) {
        const results = await utils.search.query.fetch({ q: text, type: "all", page: 1, limit: 10 });
        const items = [...results.files.map((file) => `File: ${file.name}`), ...results.folders.map((folder) => `Folder: ${folder.name}`)];
        response = items.length
          ? `Search results:\n\n${items.map((item, index) => `${index + 1}. ${item}`).join("\n")}`
          : "No matching files or folders found.";
      }

      const assistantMsg: Message = {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setIsLoading(false);
    }, 450);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-[rgba(0,0,0,0.08)]">
        <div className="p-1.5 bg-black text-white rounded">
          <Sparkles size={16} />
        </div>
        <div>
          <h1 className="text-[14px] font-medium">AI Assistant</h1>
          <p className="text-[10px] text-[#888888]">Powered by SharedPoint Intelligence</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
            >
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-black text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles size={13} />
                </div>
              )}
              <div
                className={`max-w-[80%] p-3 rounded-lg text-[13px] leading-relaxed whitespace-pre-line ${
                  msg.role === "user"
                    ? "bg-black text-white"
                    : "bg-[#f8f8f8] border border-[rgba(0,0,0,0.08)]"
                }`}
              >
                {msg.content}
              </div>
              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-full bg-[#f0f0f0] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User size={13} />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-black text-white flex items-center justify-center flex-shrink-0">
                <Loader2 size={13} className="animate-spin" />
              </div>
              <div className="p-3 bg-[#f8f8f8] border border-[rgba(0,0,0,0.08)] rounded-lg">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-[#888888] rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-[#888888] rounded-full animate-bounce [animation-delay:0.1s]" />
                  <div className="w-1.5 h-1.5 bg-[#888888] rounded-full animate-bounce [animation-delay:0.2s]" />
                </div>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </div>

      {/* Suggestions */}
      {messages.length <= 2 && (
        <div className="px-6 pb-2">
          <div className="max-w-2xl mx-auto">
            <p className="text-[10px] text-[#888888] uppercase tracking-[0.5px] mb-2">
              Try asking
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(s)}
                  className="px-3 py-1.5 bg-[#f8f8f8] border border-[rgba(0,0,0,0.08)] rounded text-[11px] hover:bg-black hover:text-white hover:border-black transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-6 py-3 border-t border-[rgba(0,0,0,0.08)]">
        <div className="max-w-2xl mx-auto flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend(input)}
            placeholder="Ask about your files, search, or get help..."
            className="text-[12px] flex-1"
          />
          <Button
            onClick={() => handleSend(input)}
            disabled={!input.trim() || isLoading}
            className="bg-black text-white hover:bg-[#222] px-3"
          >
            <Send size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
