import { useState, useEffect, useRef } from "react";
import { trpc } from "@/providers/trpc";
import {
  Search as SearchIcon,
  File,
  Folder,
  X,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export default function Search() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [type, setType] = useState<"all" | "files" | "folders">("all");
  const [_showFilters] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: results, isLoading } = trpc.search.query.useQuery(
    { q: debouncedQuery, type },
    { enabled: debouncedQuery.length > 0 }
  );

  const { data: suggestions } = trpc.search.suggestions.useQuery(
    { q: query },
    { enabled: query.length > 0 && query.length < 50 }
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <h1 className="text-[24px] font-light tracking-[-0.3px] mb-6">Search</h1>

      {/* Search Bar */}
      <div className="max-w-2xl mb-6">
        <div className="relative">
          <SearchIcon
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#888888]"
          />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files, folders, by name, type, or content..."
            className="pl-10 pr-10 py-2.5 text-[13px] border-[rgba(0,0,0,0.15)] focus:border-black"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#888888] hover:text-black"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Suggestions */}
        {suggestions && suggestions.length > 0 && query && !debouncedQuery && (
          <div className="mt-1 bg-white border border-[rgba(0,0,0,0.08)] rounded shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => setQuery(s)}
                className="w-full text-left px-3 py-2 text-[12px] hover:bg-[#f8f8f8] transition-colors flex items-center gap-2"
              >
                <SearchIcon size={12} className="text-[#888888]" />
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Type Filter */}
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => setType("all")}
            className={`px-3 py-1 text-[11px] rounded transition-colors ${
              type === "all" ? "bg-black text-white" : "bg-[#f8f8f8] text-[#888888] hover:text-black"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setType("files")}
            className={`px-3 py-1 text-[11px] rounded transition-colors ${
              type === "files" ? "bg-black text-white" : "bg-[#f8f8f8] text-[#888888] hover:text-black"
            }`}
          >
            Files
          </button>
          <button
            onClick={() => setType("folders")}
            className={`px-3 py-1 text-[11px] rounded transition-colors ${
              type === "folders" ? "bg-black text-white" : "bg-[#f8f8f8] text-[#888888] hover:text-black"
            }`}
          >
            Folders
          </button>
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={20} className="animate-spin text-[#888888]" />
        </div>
      ) : debouncedQuery && results ? (
        <div>
          <p className="text-[11px] text-[#888888] mb-3">
            Found {results.files.length} files, {results.folders.length} folders
          </p>

          {results.folders.length > 0 && (
            <div className="mb-4">
              <h3 className="text-[10px] text-[#888888] uppercase tracking-[0.5px] mb-2">
                Folders
              </h3>
              <div className="border border-[rgba(0,0,0,0.08)] rounded divide-y divide-[rgba(0,0,0,0.04)]">
                {results.folders.map((folder) => (
                  <div
                    key={folder.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f8f8f8] transition-colors"
                  >
                    <Folder size={16} strokeWidth={1.5} className="text-[#888888]" />
                    <span className="flex-1 text-[13px]">{folder.name}</span>
                    <span className="text-[11px] text-[#888888]">{folder.path}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.files.length > 0 && (
            <div>
              <h3 className="text-[10px] text-[#888888] uppercase tracking-[0.5px] mb-2">
                Files
              </h3>
              <div className="border border-[rgba(0,0,0,0.08)] rounded divide-y divide-[rgba(0,0,0,0.04)]">
                {results.files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f8f8f8] transition-colors"
                  >
                    <File size={16} strokeWidth={1.5} className="text-[#888888]" />
                    <span className="flex-1 text-[13px]">{file.name}</span>
                    <span className="text-[11px] text-[#888888]">{formatBytes(file.size || 0)}</span>
                    <span className="text-[11px] text-[#888888]">{file.mimeType}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.files.length === 0 && results.folders.length === 0 && (
            <div className="text-center py-10 text-[#888888]">
              <SearchIcon size={32} strokeWidth={1} className="mx-auto mb-2" />
              <p className="text-[13px]">No results found</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
